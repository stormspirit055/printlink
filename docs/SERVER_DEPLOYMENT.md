# PrintLink 服务器部署手册

本文说明如何将 PrintLink 部署到一台 Linux 服务器。生产服务由 Docker Compose 管理 PostgreSQL、Redis、数据库迁移任务、API 和 Web。Web 监听宿主机 `80` 端口，数据库、Redis 和 API 只在 Compose 网络内访问。

示例部署目录为 `/opt/printlink`。命令中的域名、手机号和密钥占位符必须替换为实际值。

## 1. 部署前检查

服务器至少需要：

- 64 位 Linux，项目镜像当前构建目标为 `linux/amd64`
- Docker Engine、Docker Compose v2 和 Docker Buildx
- 可用的 TCP `22`、`80` 端口；启用 HTTPS 后还需要 `443`
- 足够的磁盘空间保存镜像、数据库、Redis 和备份
- 已解析到服务器的域名，以及生产短信和私有 OSS 配置

在服务器检查：

```bash
docker --version
docker compose version
uname -m
ss -lntp | grep -E ':(80|443)\b' || true
```

生产环境还应先完成 [阿里云短信认证配置](./ALIYUN_PNVS_SETUP.md) 和 [阿里云 OSS 对接指南](./ALIYUN_OSS_SETUP.md)。

## 2. 上传项目文件

在服务器创建部署目录：

```bash
sudo mkdir -p /opt/printlink
sudo chown "$USER":"$USER" /opt/printlink
chmod 700 /opt/printlink
```

在开发机项目根目录上传代码。不要上传本地环境变量、依赖、构建产物和运行数据：

```bash
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/*/dist' \
  --exclude '.env' \
  --exclude '.env.local*' \
  --exclude 'data' \
  --exclude 'uploads' \
  ./ <服务器用户>@<服务器地址>:/opt/printlink/
```

`--delete` 会删除服务器部署目录中本次源码不再包含的文件。生产配置、数据和备份应保存在排除项或部署目录之外。

此上传方式不包含 Git 元数据。首次部署完成后，如需在服务器通过 `git pull` 更新版本，先执行 [版本迭代部署手册](./ITERATIVE_DEPLOYMENT.md) 的「一次性准备 Git 工作区」。服务器宿主机不需要安装 Node.js。

## 3. 创建生产配置

登录服务器并进入部署目录：

```bash
cd /opt/printlink
```

生成数据库密码和会话密钥：

```bash
openssl rand -hex 24
openssl rand -hex 32
```

从模板创建 `.env`，并编辑为生产配置：

```bash
cp .env.example .env
chmod 600 .env
```

至少配置以下项目：

```dotenv
NODE_ENV=production
PORT=4311
WEB_ORIGIN=https://example.com
COOKIE_SECURE=true
WEB_BIND=80

POSTGRES_PASSWORD=<高强度数据库密码>
DATABASE_URL=postgresql://printlink:<数据库密码>@postgres:5432/printlink?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=<至少 32 个字符的随机值>

OTP_PROVIDER=aliyun-pnvs
OTP_RESEND_COOLDOWN_SEC=60
ALIYUN_PNVS_ACCESS_KEY_ID=<AccessKey ID>
ALIYUN_PNVS_ACCESS_KEY_SECRET=<AccessKey Secret>
ALIYUN_PNVS_SIGN_NAME=<短信签名>
ALIYUN_PNVS_TEMPLATE_CODE=<短信模板代码>
DEV_LOGIN_PHONES=

STORAGE_PROVIDER=oss
OSS_REGION=<OSS 地域>
OSS_BUCKET=<私有 Bucket 名称>
OSS_ACCESS_KEY_ID=<AccessKey ID>
OSS_ACCESS_KEY_SECRET=<AccessKey Secret>
OSS_STS_ROLE_ARN=<STS 角色 ARN>
OSS_STS_SESSION_NAME=printlink-upload
OSS_STS_DURATION_SEC=3600
OSS_INTERNAL=false
OSS_PREFIX=models
OSS_SIGNED_URL_EXPIRES_SEC=600
MAX_UPLOAD_MB=50
```

如自行设置的 `POSTGRES_PASSWORD` 包含 URL 保留字符，写入 `DATABASE_URL` 时需要进行 URL 编码。生产环境不能使用 `OTP_PROVIDER=console`，也不要保留开发手机号。

## 4. 构建生产镜像

### 方案 A：直接在服务器构建

服务器可以访问 npm 和 Docker 镜像仓库时，在 `/opt/printlink` 执行：

```bash
docker buildx bake --load
```

该命令构建：

- `printlink-api:release`
- `printlink-web:release`

### 方案 B：在开发机构建后导入

服务器无法稳定访问外部仓库时，在开发机项目根目录执行：

```bash
npm run build:images
docker pull --platform linux/amd64 postgres:16-alpine
docker pull --platform linux/amd64 redis:7-alpine
```

确认镜像架构：

```bash
docker image inspect printlink-api:release --format '{{.Architecture}}'
docker image inspect printlink-web:release --format '{{.Architecture}}'
```

输出应为 `amd64`。将镜像传入服务器：

```bash
docker save printlink-api:release printlink-web:release \
  postgres:16-alpine redis:7-alpine | gzip -1 | \
  ssh <服务器用户>@<服务器地址> 'gzip -d | docker load'
```

## 5. 首次启动和迁移

以下命令均在服务器 `/opt/printlink` 执行。先检查最终 Compose 配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app config --quiet
```

启动 PostgreSQL 和 Redis，并等待健康检查：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --wait --no-build postgres redis
```

执行一次性迁移任务：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps migrate
```

迁移必须成功后才能启动业务服务。迁移失败时保存日志并按 [数据库迁移与部署](./DATABASE_MIGRATIONS.md) 排查，不要跳过或重置生产数据库。

## 6. 初始化生产数据

初始化材料、颜色和计价规则：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps \
  api node --import tsx apps/api/prisma/seed.ts
```

创建首个管理员，将手机号替换为可接收生产短信的号码：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps \
  -e ADMIN_PHONE=<管理员手机号> \
  api node --import tsx apps/api/prisma/init-admin.ts
```

不要在生产环境运行 `db:seed:demo` 或 `seed-demo.ts`。更多限制见 [生产数据初始化与模型访问](./PRODUCTION_INITIALIZATION.md)。

## 7. 启动业务服务

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-build api web

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
```

正常状态下，`postgres` 和 `redis` 显示 `healthy`，`api` 和 `web` 处于运行状态。`migrate` 是一次性任务，成功退出属于正常情况。

## 8. 配置 HTTPS

当前 Web 容器直接监听宿主机 `80` 端口。使用云负载均衡器终止 TLS 时，可以将请求转发到服务器的 `80` 端口。

如果在同一台服务器运行 Nginx 或 Caddy，将 `.env` 中的 Web 监听地址改为只允许本机访问：

```dotenv
WEB_BIND=127.0.0.1:8080
```

然后让宿主机反向代理监听 `80` 和 `443`，并将请求转发到 `http://127.0.0.1:8080`。修改后重新创建 Web 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate web
```

不要让 Web 容器和宿主机反向代理同时占用 `80` 端口。

确认 `.env` 使用实际 HTTPS 域名：

```dotenv
WEB_ORIGIN=https://example.com
COOKIE_SECURE=true
```

修改 `.env` 后重新创建 API：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate api
```

只在临时的 HTTP 验收环境中使用 `COOKIE_SECURE=false`，并将 `WEB_ORIGIN` 改为实际 HTTP 地址。

## 9. 验证部署

在服务器检查首页和 API：

```bash
curl -f http://127.0.0.1/
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app \
  exec -T api node -e \
  "fetch('http://127.0.0.1:4311/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
```

如果已按第 8 节设置 `WEB_BIND=127.0.0.1:8080`，首页检查地址相应改为 `http://127.0.0.1:8080/`。

查看日志：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

随后使用实际域名验证：

1. HTTPS 页面和登录流程正常，Cookie 可以保存。
2. 真实短信可以发送并完成登录。
3. 材料、颜色和计价规则已经加载。
4. `.3mf` 文件可以上传、预览，并保存到私有 OSS。
5. 需求发布、管理员审核、联系方式申请和同意流程完整可用。
6. 未授权用户不能直接访问模型文件。

## 10. 发布新版本

首次部署完成后，从仓库拉取代码、构建新镜像、迁移数据库和回滚版本的操作统一见 [版本迭代部署手册](./ITERATIVE_DEPLOYMENT.md)。

## 11. 数据备份

创建服务器外部备份目录：

```bash
sudo mkdir -p /var/backups/printlink
sudo chown "$USER":"$USER" /var/backups/printlink
chmod 700 /var/backups/printlink
```

备份 PostgreSQL：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T postgres pg_dump -U printlink -d printlink -Fc \
  > /var/backups/printlink/printlink-$(date +%Y%m%d-%H%M%S).dump
```

检查备份文件大小，并定期复制到服务器之外。恢复前应在独立数据库验证备份内容和恢复步骤。

## 12. 常见故障

### 页面无法访问

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps
curl -i http://127.0.0.1/
ss -lntp | grep -E ':(80|443)\b'
```

服务器本机可以访问但公网无法访问时，检查云安全组、防火墙、域名解析和 HTTPS 代理。

### 页面返回 502

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

优先检查 API 的环境变量校验、数据库和 Redis 连接。修改 `.env` 后需要重新创建 API 容器。

### 短信或 OSS 失败

核对 `.env` 中的供应商、地域、Bucket、RAM 权限、签名和模板。确认服务器时间准确，并在修改配置后重新创建 API。具体排查步骤见对应的短信和 OSS 配置文档。
