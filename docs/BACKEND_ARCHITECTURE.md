# PrintLink 后端架构

> 当前基线：初级联系方式撮合版，2026-08-28

## 组件

- Express 5 API：认证、资料、地址、需求、联系方式申请、通知、上传凭证签发和后台配置。
- PostgreSQL + Prisma：业务数据、唯一约束和事务。
- Redis：验证码、限流、SSE 跨实例广播。
- 文件存储：当前容器实际装配 `LocalStorageAdapter`；OSS 模式下另有 `GET /api/uploads/credentials` 通过 STS AssumeRole 动态签发临时上传凭证（无静态 token 配置）。
- Vue 3 Web：需求发布、详情、申请处理和通知中心。

## 核心写链路

联系方式申请逻辑位于 `ContactRequestService`：

- `request` 校验需求状态与所有权，在事务中创建申请和所有者通知。
- `approve` 校验申请所有者和微信号，条件更新申请，并在同一事务创建含微信号的申请人通知。
- 数据库唯一约束负责重复申请兜底。
- 条件更新负责并发同意兜底。

通知提交后通过 `RealtimeService` 本机投递，并发布到 Redis channel `printlink:realtime`，支持多 API 实例。

## 安全边界

- `AuthMiddleware` 从 HttpOnly Cookie 解析用户。
- 资料修改只写当前用户。
- 需求创建校验当前用户微信号和本人地址。
- 申请列表按需求所有者校验。
- 同意操作按申请 `ownerId` 校验。
- 通知查询和已读操作按 `userId` 过滤。
- 公开需求响应剔除收件人、电话和详细地址。

## 遗留模块

报价、订单、托管和评价模型及部分服务仍在仓库中，但没有当前业务入口。它们不得被视为线上产品能力。后续应在确认不恢复订单路线后做迁移清理。

## 部署约束

- API 启动依赖 PostgreSQL 和 Redis。
- 新环境必须先执行 `prisma migrate deploy`。
- 生产短信必须配置 Aliyun 或 Tencent 网关。
- 支付供应商不再是生产启动条件；遗留订单配置仍保留但不参与当前业务。
- `STORAGE_PROVIDER` 不会改变实际适配器；上线前必须明确使用持久卷本地存储或实现对象存储，见 `PRODUCTION_READINESS.md`。
