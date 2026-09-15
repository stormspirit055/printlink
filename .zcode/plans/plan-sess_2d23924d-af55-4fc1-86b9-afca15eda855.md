# 注册/登录改为「用户名 + 密码 + 邀请码」方案

去掉手机号与短信验证。注册 = 用户名 + 密码 + 邀请码（+可选昵称）；登录 = 用户名 + 密码。邀请码校验逻辑不变。现有 SMS 网关代码按你「保留不动」的要求**保留**，仅解除它与认证流程的耦合（成为 dormant 代码，无调用方）。

## A. 数据模型 + 迁移

### schema.prisma 的 User 模型
- 新增 `username String @unique`（必填、唯一）
- 新增 `passwordHash String?`（可空：迁移期不在 SQL 里嵌 argon2 哈希；register 总会写，login 对空值按密码错处理）
- `phone String @unique` → `phone String? @unique`（降为可选，保留唯一索引，存量数据不丢）
- 其余字段不动

### 迁移 `20260819130000_switch_user_login_to_username_password`
流程：改 schema → `prisma migrate dev --create-only` 生成 → 手改 SQL 插入回填 → `migrate deploy` 应用。最终 SQL：
```sql
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
UPDATE "User" SET "username" = "phone";              -- 存量用户用 phone 作初始 username
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL; -- phone 降为可选，唯一索引保留
```
passwordHash 不回填（可空）；存量非种子用户登录会被拒（dev 可重新注册，pre-launch 无存量）。应用后 `db:generate` + `db:seed`。

## B. 后端

### 密码哈希工具（新增，用已装的 argon2）
`apps/api/src/infrastructure/security.ts` 加 `hashPassword`/`verifyPassword`（argon2id 默认）。**不复用 `TokenCodec.hash`**（SHA-256 不适合密码）。

### AuthService 重写（backend-services.ts）
- 构造函数精简为 `constructor(prisma, tokens)`：删除 `redis`、`otpGateway`、`config`、`devLoginPhones`。
- 删除 `requestCode`、`verifyOtp`。
- `login(username, password)`：`findUnique({ where: { username } })` + `verifyPassword` 比对；账号不存在或密码错统一抛 `401 AUTHENTICATION_REQUIRED '账号或密码错误'`（不泄漏账号是否存在）；`passwordHash` 为空也按密码错。
- `register(username, password, inviteCode, nickname?)`：`findUnique({username})` 查重 → 邀请码校验（逻辑同现状，去掉 `code`）→ 事务内 `updateMany` 原子占位 → `tx.user.create({ data: { username, passwordHash: await hashPassword(password), nickname: nickname || username, avatarKey, role:'USER', invitationCodeId } })`，P2002 转「用户名已被占用」。`hashPassword` 在事务外先算好。
- `createSession`/`logout`/`resolveSession` 不变。
- `publicUser`：`phone: user.phone` → `username: user.username`。

### 路由 auth.ts
- 删 `phoneSchema`、`/auth/code` 路由。
- 新增 `usernameSchema = z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/)`、`passwordSchema = z.string().min(8).max(128)`。
- `/auth/register` body `{ username, password, inviteCode, nickname? }`；`/auth/login` body `{ username, password }`。
- 保留 Redis-store limiter 挂在 register+login（密码登录防爆破必要）；保留 `setSessionCookie`/`/auth/logout`/`/me`。`createAuthRouter(service, config, redis, guards)` 签名不变（app.ts 调用点不动）。

### container.ts / app.ts
- container：`new AuthService(prisma, tokens)`（去掉 redis/createOtpGateway/config 三个实参）；删 `createOtpGateway` 导入。**`createOtpGateway` 函数本身保留在 gateways.ts（dormant）**。
- app.ts：pino redact 由 `['req.headers.cookie','req.body.code','req.body.phone','req.body.inviteCode']` 改为 `['req.headers.cookie','req.body.password','req.body.inviteCode']`。

### seed.ts
- 用 argon2 给 3 个种子用户生成 passwordHash；upsert 仍按 `phone`（现有唯一键）定位、`update`/`create` 写入 username+passwordHash：
  - 管理员：phone `13800000000`, username `admin`, password `admin123`, role `ADMIN`
  - 测试 A：phone `13900000001`, username `alice`, password `demo1234`, role `USER`
  - 测试 B：phone `13900000002`, username `bob`, password `demo1234`, role `USER`
- `WELCOME1` 邀请码 upsert 不变。

## C. 前端
- `api.ts` User 类型：`phone: string` → `username: string`。
- `useAuth.ts`：`login({ username, password })`、`register({ username, password, inviteCode, nickname? })`。
- `RegisterView.vue`：字段改 username + password + inviteCode + 昵称(可选)；删 phone/code/sendCode/获取验证码按钮；校验 username(3-30 位字母数字下划线)、password(≥8)、inviteCode(≥4)；图标 UserRound/KeyRound/Ticket；提交 `auth.register` → `router.push('/')`；复用 `.login-page/.login-box/.switch-link` 样式。
- `LoginView.vue`：字段改 username + password；删 phone/code/sendCode；demoAccounts 改为 `{ username, password, role, icon }`（admin/admin123、alice/demo1234、bob/demo1234），点击自动填充；副文案改「凭用户名与密码登录」；保留注册链接。
- `MainLayout.vue`：账户 popover 的 `maskedPhone` 改为显示 `user.username`。
- `router.ts` 守卫不变。

## D. 测试
- `auth-service.test.ts` 重写：删 requestCode 块；register 用例入参改 username+password（保留 unknown/disabled/expired/exhausted 邀请码拒绝 + 成功建号 + 用户名占用）；新增 login 用例（成功 / 密码错 / 账号不存在，均报「账号或密码错误」）。用真实 argon2 哈希。
- `aliyun-sms-gateway.test.ts`/`tencent-sms-gateway.test.ts` 保留（dormant 仍通过）。`app.test.ts` 无需改。

## E. SMS 代码处置（按你「保留不动」）
保留 `gateways.ts`、`sms/` 目录及测试、`config.ts` 的 SMS 字段与生产校验、`@alicloud/*`+`tencentcloud-sdk-nodejs-sms` 依赖。仅解除与认证的耦合。`rate-limit-redis` 仍被 limiter 使用，保留。→ 这些 SMS 文件成为 dormant 死代码。若你希望一并删除，审批时告知，我单独清理。

## F. 验证
`db:generate` → 迁移 → `db:seed` → `typecheck` → `test` → `build`（api+web）→ 联调：admin 后台生成邀请码 → `/register` 用新用户名+密码+邀请码注册（USER）→ 同名再注册被拒 → `/login` 用 admin/admin123 登录 → 错误密码报「账号或密码错误」。

## 备注
- username 大小写敏感（exact 匹配）；如需大小写不敏后续可改 citext。
- password 最短 8 位；演示密码 admin123/demo1234 均满足。
- 登录与注册保留 Redis 限流（每 IP 5 次/分钟）防爆破。