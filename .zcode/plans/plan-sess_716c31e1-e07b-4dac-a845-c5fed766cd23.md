# 服务端动态 STS 凭证签发接口实现方案

## 目标与范围

**做**:新增 `GET /api/uploads/credentials`(需登录):服务端实时调用阿里云 STS `AssumeRole` 返回临时上传凭证(含 bucket/region/prefix/大小限制等参数);**删除静态 `OSS_STS_TOKEN` 配置**(config、storage、.env、.env.example、文档);补齐单元测试与文档。

**不做**(后续接入):前端直传改造(PublishDemandModal)、OSS Bucket CORS 配置(写入文档为运维步骤)、服务端自用凭证自动刷新。

## 后端改动(apps/api)

### 1. 新增依赖
- `@alicloud/sts20150401`(与现有 `@alicloud/dysmsapi20170525` 同族,复用已装的 `openapi-client`/`tea-util`):`npm install -w @printlink/api @alicloud/sts20150401`

### 2. config.ts
- 删除 `OSS_STS_TOKEN`(第 34 行)
- 新增:
  - `OSS_STS_ROLE_ARN: z.string().optional()` — AssumeRole 的 RAM 角色 ARN
  - `OSS_STS_SESSION_NAME: z.string().regex(/^[a-zA-Z0-9.@-_]{2,64}$/).default('printlink-upload')`
  - `OSS_STS_DURATION_SEC: z.coerce.number().int().min(900).max(3600).default(3600)`(阿里云下限 900s)
  - `OSS_STS_ENDPOINT: z.string().optional()`(默认由 region 推导:`sts.<去掉oss-前缀的region>.aliyuncs.com`)
- 交叉校验(第 47-55 行):`STORAGE_PROVIDER=oss` 时把 `OSS_STS_ROLE_ARN` 加入必填缺失列表(fail-fast,兑现"token 不在本地配置")

### 3. 新增 `src/infrastructure/sts/aliyun-sts-gateway.ts`(完全镜像 SMS 网关模式)
- `AliyunStsClient` 结构化接口(`assumeRole(request)` → `body.credentials`),单测可用普通对象 mock
- `AliyunStsGateway.assumeRole(sessionName)`:调用成功返回 `{ accessKeyId, accessKeySecret, securityToken, expiration }`;SDK 抛错或返回体不完整 → `AppError(502, 'DEPENDENCY_UNAVAILABLE', '获取上传凭证失败：…')`
- `createStsGateway(config)` 工厂:复用 `OSS_ACCESS_KEY_ID/SECRET` 签名调用(与 gateways.ts 相同的 `createRequire` CJS 互操作);**附内联 Policy 进一步限定为 `oss:PutObject` 且仅限 `acs:oss:*:*:<bucket>/<prefix>/*`**(纵深防御,只授予上传、不授予读取——下载仍走服务端签名 URL)
- 定义 `StsGatewayPort { assumeRole(sessionName): Promise<StsCredentials> }` 供应用层依赖

### 4. 新增服务(backend-services.ts,遵循现有约定)
- `UploadCredentialsService(gateway: StsGatewayPort | undefined, config)`:
  - `issue(userId)`:gateway 未配置(provider=local)→ `AppError(501, 'DEPENDENCY_UNAVAILABLE', '上传凭证服务未配置')`
  - 会话名 `${OSS_STS_SESSION_NAME}-${userId}`(截断至 64 字符,便于阿里云操作审计按用户追溯)
  - 返回:顶层临时凭证 + `upload: { provider: 'oss', bucket, region, endpoint?, prefix, maxSizeMb, allowedExtensions: ['.3mf'] }`

### 5. 新增 `src/routes/uploads.ts`
- `createUploadsRouter(service, redis, guards)`:`GET /credentials` 挂 `guards.auth` + Redis 限流(镜像 auth.ts 的 `rate-limit-redis` 模式,60s/10 次,前缀 `rl:uploads:`),防止 AssumeRole 调用被滥用
- app.ts 在 catch-all 404 前挂载 `app.use('/api/uploads', …)`

### 6. container.ts
- 组装 `uploadCredentialsService` 并加入 `AppContainer` 接口:`provider === 'oss'` 时才构造网关(local 模式不构造,避免无 AK 时启动失败;运行时由服务返回 501)

### 7. 移除静态 token
- `storage.ts:68` 删掉 `stsToken` 传入(服务端 OSS 客户端继续用 RAM 用户 AK 做 put/签名 URL,行为不变)
- 根目录 `.env` 删除 `OSS_STS_TOKEN` 行;全局 grep 确认无残留

## 测试(vitest,与现有风格一致)

- `infrastructure/sts/aliyun-sts-gateway.test.ts`(模板:aliyun-sms-gateway.test.ts):断言 assumeRole 入参(roleArn/sessionName/durationSeconds/policy);credentials 缺失 → 502;SDK reject → 502
- `application/upload-credentials-service.test.ts`:网关 mock → 响应含凭证与 upload 参数(bucket/prefix/maxSizeMb/allowedExtensions);网关为 undefined → 501;网关抛错透传
- `app.test.ts` 追加:未登录 `GET /api/uploads/credentials` → 401(与现有匿名用例一致,不依赖 DB/Redis)

## 文档与配置样例

- `.env.example`:删除 `OSS_STS_TOKEN`,新增注释块说明 `OSS_STS_ROLE_ARN` 等 4 个变量
- `docs/API.md`:汇总表新增"上传"模块行 + 详情节(响应结构、401/429/501/502 错误)
- `docs/ALIYUN_OSS_SETUP.md`:更新 RAM/STS 章节为"服务端动态签发"说明;新增 RAM 角色创建步骤(建角色、信任策略允许 RAM 用户、角色策略 PutObject 限定 models/*、给 RAM 用户授 `sts:AssumeRole`);更新变量表与未来规划条目(第 54/73/106 行)
- `docs/BACKEND_ARCHITECTURE.md`:文件存储组件行补一句 STS 签发接口

## 验证

- `apps/api`:`npm run typecheck`、`npm test`(vitest run)、`npm run build`
- 启动冒烟:dev 环境(local provider)`GET /api/uploads/credentials` 未登录 401、登录后 501;行为符合预期即通过

## 运维前提(写入文档,不在代码内)

生产启用需:创建 RAM 角色(策略仅 `PutObject` 限 `models/*`)、信任策略允许现有 RAM 用户、给该 RAM 用户追加 `sts:AssumeRole` 权限、设置 `OSS_STS_ROLE_ARN`;前端直传还需配置 Bucket CORS(文档中给出建议配置)。