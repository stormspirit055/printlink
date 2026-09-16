# PrintLink 本地部署手册

本文用于在开发机上启动 PrintLink 的完整本地环境。服务由 PostgreSQL、Redis、Express API 和 Vue Web 组成。默认前端地址为 `http://localhost:5173`，API 地址为 `http://localhost:4311`。

## 1. 前置条件

- Node.js `20.19.0` 或更高版本（推荐 Node.js 22）
- Docker Desktop 或 Docker Engine，并支持 Docker Compose v2
- 可用端口：`5173`、`4311`、`5432`、`6379`

```bash
node --version
docker --version
docker compose version
```

## 2. 安装依赖和配置环境变量

```bash
cp .env.example .env
npm install
```

确认 `.env` 至少包含以下本地配置：

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://printlink:printlink@localhost:5432/printlink?schema=public
REDIS_URL=redis://localhost:6379
OTP_PROVIDER=console
STORAGE_PROVIDER=local
SESSION_SECRET=replace-with-at-least-32-random-characters
```

`OTP_PROVIDER=console` 仅用于本地开发，会将验证码回显在 API 响应中。

## 3. 启动依赖服务

```bash
docker compose up -d postgres redis
docker compose ps
```

等待两个容器显示 `healthy`。查看日志：

```bash
docker compose logs --tail=100 postgres redis
```

## 4. 初始化数据库

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

如需演示账号、测试设备和固定邀请码：

```bash
NODE_ENV=development npm run db:seed:demo
```

不要在生产环境执行 `db:seed:demo`。检查迁移状态：

```bash
npm run db:status
```

## 5. 启动 API 和 Web

```bash
npm run dev
```

访问 Web：`http://localhost:5173`；API 就绪检查：`http://localhost:4311/health/ready`。停止开发服务按 `Ctrl+C`；停止依赖服务：

```bash
docker compose stop postgres redis
```

## 6. 使用 Docker 启动完整应用

```bash
docker compose --profile app up -d --build --wait
docker compose --profile app ps
```

此方式的 Web 地址为 `http://localhost:8080`，并会在 API 启动前自动执行数据库迁移。

## 7. 本地验证

```bash
curl -f http://localhost:4311/health/ready
npm run typecheck
npm run lint
npm test
npm run build
```

浏览器中确认页面可打开、登录可用、材料和颜色选项已加载；演示环境还应能发布需求并进入审核流程。

## 8. 常见问题

### 端口已被占用

停止占用端口的程序，或修改 `.env` 中的 `PORT`；前端开发端口可在 `apps/web/vite.config.ts` 中调整。

### API 无法连接数据库或 Redis

确认依赖容器健康，并检查 `.env` 使用 `localhost`。API 容器内部应使用 Compose 服务名 `postgres` 和 `redis`。

### 重新初始化本地数据

仅在不需要保留本地数据时执行：

```bash
docker compose down -v
```

然后重新执行第 3、4 步。生产部署请阅读 [服务器部署手册](./SERVER_DEPLOYMENT.md)。
