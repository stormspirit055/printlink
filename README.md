# 印蛙 PrintLink

面向个人用户的分布式 3D 打印需求撮合平台。当前版本通过授权后的微信联系方式交换完成撮合，不包含平台内报价、订单、支付或履约。

## 技术栈

- Web：Vue 3、TypeScript、Vite、Naive UI、TanStack Vue Query、Zod
- API：Node.js 22、TypeScript、Express 5、Zod、Pino、Helmet
- 数据：PostgreSQL 16、Prisma ORM、Redis 7
- 基础设施：Docker、Nginx、健康检查、私有文件存储和短信适配层

## 本地启动

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
NODE_ENV=development npm run db:seed:demo
npm run dev
```

前端：`http://localhost:5173`，API：`http://localhost:4311`。

`db:seed` 只初始化材料、颜色和计价规则。演示账号、测试设备和固定邀请码仅由 `db:seed:demo` 创建，该命令要求显式设置 `NODE_ENV=development` 或 `test`。正式管理员初始化见 [生产初始化说明](docs/PRODUCTION_INITIALIZATION.md)。

## 当前业务闭环

```text
填写微信号 → 发布 3MF 需求 → 管理员审核 → 接单方申请微信 → 需求方同意 → 私有通知披露微信号
```

详细产品范围见 `docs/PRD.md`。阿里云单机部署见 [Docker 手动部署手册](docs/MANUAL_DOCKER_DEPLOYMENT.md)，最基础版本上线检查见 `docs/MVP_LAUNCH_GAP_CHECKLIST.md`，阿里云 OSS 对接见 `docs/ALIYUN_OSS_SETUP.md`，完整生产审计见 `docs/DEPLOYMENT_READINESS_AUDIT.md`。

## 上线约束

数据库变更必须先执行 `prisma migrate deploy`，应用发布前检查 `/health/ready`。生产短信必须使用真实服务，密钥只能通过部署平台 Secret 注入。

数据库迁移已接入部署：`npm run deploy` 每次先执行一次性迁移任务，成功后才更新 API 和 Web。空库可执行完整迁移；已有库需要先核对迁移记录。操作步骤与失败处理见 [数据库迁移与部署](docs/DATABASE_MIGRATIONS.md)。

生产短信、OSS、HTTPS、网络隔离和真实环境验收仍需完成，不能直接用默认配置发布。

当前版本不使用支付，生产启动不要求配置真实支付供应商。本地存储只保存用户上传的 3MF 模型；数据库业务数据仍存 PostgreSQL。
