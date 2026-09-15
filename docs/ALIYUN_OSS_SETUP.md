# 阿里云 OSS 对接指南

> 适用范围：印蛙 API 服务端上传 3MF，并为私有模型生成短期访问 URL

## 1. 已实现的架构

```text
浏览器上传 3MF
  -> PrintLink API 接收临时文件
  -> AliyunOssStorageAdapter 上传到私有 OSS Bucket
  -> PostgreSQL 只保存对象 key
  -> 读取需求详情时生成短期签名 URL
  -> 浏览器通过签名 URL 读取模型
```

存储实现由 `STORAGE_PROVIDER` 选择：

- `local`：本地开发，文件写入 `UPLOAD_DIR`。
- `oss`：生产环境，文件上传到阿里云 OSS。

OSS 对象默认存入 `models/` 前缀。数据库保存类似 `models/<uuid>.3mf` 的 key，不保存永久公开 URL。签名 URL 默认有效 600 秒，每次读取需求详情时重新生成。

此外 API 提供 `GET /api/uploads/credentials`（登录用户可用），实时调用阿里云 STS `AssumeRole` 签发临时上传凭证，供客户端直传 OSS 使用。凭证不落任何本地配置，只授予 `oss:PutObject` 且限定在对象前缀之下。当前 Web 前端仍走服务端代理上传；直传接入时需按下文配置 Bucket CORS。

## 2. 创建 Bucket

在阿里云 OSS 控制台创建 Bucket：

1. 选择与 API 服务器相同或邻近的地域。
2. 读写权限选择「私有」。
3. 存储类型首版选择「标准存储」。
4. 不要开启公共读。
5. 记录 Bucket 名称和地域 ID，例如 `printlink-models`、`oss-cn-hangzhou`。

当前上传和下载都由服务端处理，不需要配置浏览器直传 CORS。

## 3. 创建 RAM 身份与上传角色

不要使用阿里云主账号 AccessKey。创建专用 RAM 用户或 RAM 角色，只授予目标 Bucket 的对象权限。

RAM 用户策略（服务端上传与签名 URL 使用），将 `<bucket-name>` 替换为真实 Bucket 名称：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject", "oss:GetObject"],
      "Resource": ["acs:oss:*:*:<bucket-name>/models/*"]
    }
  ]
}
```

### STS 直传角色（`STORAGE_PROVIDER=oss` 时必配）

`GET /api/uploads/credentials` 通过 AssumeRole 签发只允许上传的临时凭证，需要一次性完成：

1. 创建普通服务角色（可信实体选择 RAM 用户），记录角色 ARN，例如 `acs:ram::1234567890:role/printlink-upload`。
2. 为角色授予上传策略（只允许 `PutObject`，范围锁定对象前缀）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject"],
      "Resource": ["acs:oss:*:*:<bucket-name>/models/*"]
    }
  ]
}
```

3. 角色信任策略中允许上述 RAM 用户扮演。
4. 给 RAM 用户追加 `sts:AssumeRole` 权限（资源指向该角色 ARN）。

服务端在 AssumeRole 时还会附加同样的内联 Policy 双重限定，即使角色策略日后放宽，签发出的凭证仍只能上传到对象前缀之下。模型读取不经过 STS 凭证，继续使用服务端签名 URL。

### Bucket CORS（仅浏览器直传需要）

Web 前端接入直传时，在 Bucket「跨域设置」中允许来源 `WEB_ORIGIN`、方法 `PUT`、Headers `*` 并暴露 `ETag`。当前服务端代理上传不需要 CORS。

## 4. 配置环境变量

生产环境设置：

```dotenv
STORAGE_PROVIDER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=<bucket-name>
OSS_ACCESS_KEY_ID=<ram-access-key-id>
OSS_ACCESS_KEY_SECRET=<ram-access-key-secret>
OSS_STS_ROLE_ARN=acs:ram::<account-id>:role/printlink-upload
OSS_INTERNAL=false
OSS_PREFIX=models
OSS_SIGNED_URL_EXPIRES_SEC=600
```

`OSS_STS_ROLE_ARN` 是 `STORAGE_PROVIDER=oss` 的必填项：上传凭证只通过该角色动态签发，没有静态 token 配置。

可选配置：

- `OSS_STS_SESSION_NAME`：AssumeRole 会话名前缀，默认 `printlink-upload`；实际会话名附带用户 ID，便于在阿里云操作审计中追溯。
- `OSS_STS_DURATION_SEC`：临时凭证有效期，允许 900-3600 秒，默认 3600 秒。
- `OSS_STS_ENDPOINT`：自定义 STS 服务 endpoint。通常留空，由 `OSS_REGION` 推导（如 `oss-cn-hangzhou` 推导为 `sts.cn-hangzhou.aliyuncs.com`）。
- `OSS_ENDPOINT`：使用自定义 OSS endpoint 时填写。通常留空，由 SDK 根据地域生成。
- `OSS_INTERNAL=true`：API 部署在同地域阿里云网络且能够访问 OSS 内网 endpoint 时启用。注意浏览器无法访问内网 endpoint，直传场景不要开启。
- `OSS_PREFIX`：对象目录前缀，默认 `models`。
- `OSS_SIGNED_URL_EXPIRES_SEC`：签名 URL 有效期，允许 60-3600 秒，默认 600 秒。

AccessKey 必须通过部署平台 Secret 注入，不要写入 `.env.example`、镜像或 Git 仓库。

## 5. 上线验证

使用测试账号完成以下验证：

1. 启动 API，确认没有 `OSS credentials are not configured` 错误。
2. 登录后请求 `GET /api/uploads/credentials`，确认返回临时凭证和 `upload` 参数，且 `expiration` 晚于当前时间。
3. 用返回的凭证尝试上传到 `models/` 之外的前缀，确认被 RAM 策略拒绝。
4. 上传一个 3MF 并发布需求。
5. 在 OSS 控制台确认 `models/` 下出现 UUID 命名的 `.3mf` 对象。
6. 确认 Bucket 中的对象不能通过无签名 URL 直接访问。
7. 打开需求详情，确认模型能够通过带签名参数的 URL 加载。
8. 等待签名 URL 过期，确认旧 URL 不再可用。
9. 刷新需求详情，确认新签名 URL 可以继续加载模型。
10. 重启 API，确认原模型仍可读取。

如果上传返回 `AccessDenied`，检查 RAM Policy、Bucket 名称、地域和对象前缀。如果返回 `SignatureDoesNotMatch`，检查服务器时间、AccessKey、地域和自定义 endpoint。如果凭证接口返回 `502`，检查角色信任策略和 RAM 用户的 `sts:AssumeRole` 授权。

## 6. 后续扩展位置

主要代码位置：

- `apps/api/src/infrastructure/storage.ts`：`StoragePort`、本地存储和 OSS 适配器。
- `apps/api/src/infrastructure/sts/aliyun-sts-gateway.ts`：STS AssumeRole 网关与工厂（含内联 Policy）。
- `apps/api/src/application/backend-services.ts`：`UploadCredentialsService`（会话名与响应组装）。
- `apps/api/src/routes/uploads.ts`：`GET /api/uploads/credentials` 路由与限流。
- `apps/api/src/bootstrap/container.ts`：根据 provider 装配存储与 STS 网关。
- `apps/api/src/config.ts`：环境变量定义和启动校验。

后续可在不改变业务服务的情况下增加：

- Web 前端接入直传（获取凭证后用 ali-oss 浏览器端上传，需求创建改为提交对象 key）。
- ECS/容器 RAM 角色自动刷新服务端 STS 凭证。
- 分片上传和上传进度。
- 对象删除与孤儿文件清理。
- 生命周期规则和低频存储转换。
- 独立鉴权下载接口或 CDN。
