# 阿里云单机 Docker 部署手册

本文说明如何将 PrintLink 手动部署到一台 `linux/amd64` 阿里云服务器。生产环境由 Docker Compose 管理 PostgreSQL、Redis、API 和 Web。Web 监听宿主机 `80` 端口；PostgreSQL、Redis 和 API 只在 Docker 网络内访问。

本文使用以下示例值：

```text
服务器地址：120.26.86.139
服务器用户：root
部署目录：/opt/printlink
API 镜像：printlink-api:release
Web 镜像：printlink-web:release
```

## 1. 前置条件

本机需要安装：

- Docker Desktop，并启用 Buildx。
- `ssh` 和 `rsync`。
- 可以读取项目源码的终端。

服务器需要满足以下条件：

- 已安装 Docker Engine 和 Docker Compose v2。
- SSH 公钥登录可用。
- 阿里云防火墙已放行 TCP `22` 和 `80`。配置 HTTPS 后还需放行 TCP `443`。
- `80` 端口未被其他 Web 服务占用。

执行以下命令检查服务器：

```bash
ssh root@120.26.86.139
docker --version
docker compose version
ss -lntp | grep ':80' || true
exit
```

## 2. 上传部署文件

先创建远端部署目录：

```bash
ssh root@120.26.86.139 'mkdir -p /opt/printlink && chmod 700 /opt/printlink'
```

在本机项目根目录执行：

```bash
rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/*/dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'uploads' \
  ./ root@120.26.86.139:/opt/printlink/
```

该命令不会上传本机 `.env`。生产密钥只写入服务器上的 `/opt/printlink/.env`。

## 3. 创建生产配置

登录服务器并进入部署目录：

```bash
ssh root@120.26.86.139
cd /opt/printlink
```

生成数据库密码和会话密钥：

```bash
openssl rand -base64 36
openssl rand -base64 48
```

将两个输出分别保存到 `POSTGRES_PASSWORD` 和 `SESSION_SECRET`。创建 `/opt/printlink/.env`，至少配置以下项目：

```dotenv
NODE_ENV=production
PORT=4311
WEB_ORIGIN=http://120.26.86.139
COOKIE_SECURE=false

POSTGRES_PASSWORD=<数据库密码>
DATABASE_URL=postgresql://printlink:<数据库密码>@postgres:5432/printlink?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=<至少 32 个字符的随机值>

OTP_PROVIDER=aliyun-pnvs
ALIYUN_PNVS_ACCESS_KEY_ID=<短信 RAM 用户 AccessKey ID>
ALIYUN_PNVS_ACCESS_KEY_SECRET=<短信 RAM 用户 AccessKey Secret>
ALIYUN_PNVS_SIGN_NAME=<已审核签名>
ALIYUN_PNVS_TEMPLATE_CODE=<已审核模板代码>
OTP_RESEND_COOLDOWN_SEC=60
DEV_LOGIN_PHONES=

STORAGE_PROVIDER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=<私有 Bucket 名称>
OSS_ACCESS_KEY_ID=<OSS RAM 用户 AccessKey ID>
OSS_ACCESS_KEY_SECRET=<OSS RAM 用户 AccessKey Secret>
OSS_STS_ROLE_ARN=<STS 角色 ARN>
OSS_STS_SESSION_NAME=printlink-upload
OSS_STS_DURATION_SEC=3600
OSS_INTERNAL=false
OSS_PREFIX=models
OSS_SIGNED_URL_EXPIRES_SEC=600
MAX_UPLOAD_MB=50
```

设置文件权限：

```bash
chmod 600 /opt/printlink/.env
```

`COOKIE_SECURE=false` 只适用于 IP + HTTP 验收。绑定域名并启用 HTTPS 后，将 `WEB_ORIGIN` 改成 HTTPS 域名，并将 `COOKIE_SECURE` 改成 `true`。

## 4. 构建生产镜像

服务器无法稳定访问 Docker Hub 时，在本机构建 `linux/amd64` 镜像。即使本机使用 Apple 芯片，也必须保留 `--platform linux/amd64`。

在本机项目根目录执行：

```bash
npm run build:images
```

该命令读取项目根目录的 `docker-bake.hcl`，构建并加载以下镜像：

```text
printlink-api:release
printlink-web:release
```

`docker-bake.hcl` 集中定义平台、Dockerfile、镜像标签和本地构建缓存。修改标签时可以通过变量覆盖：

```bash
TAG=20260914 npm run build:images
```

生产 Compose 当前固定使用 `:release` 标签。使用其他标签发布前，需要同步修改 `docker-compose.production.yml` 中的镜像标签。

确认镜像架构：

```bash
docker image inspect printlink-api:release --format '{{.Architecture}}'
docker image inspect printlink-web:release --format '{{.Architecture}}'
```

两个命令都应输出 `amd64`。

## 5. 导入镜像到服务器

首次部署时，先在本机准备 PostgreSQL 和 Redis 的 `linux/amd64` 镜像：

```bash
docker pull --platform linux/amd64 postgres:16-alpine
docker pull --platform linux/amd64 redis:7-alpine
```

在本机将全部镜像导入服务器：

```bash
docker save printlink-api:release | gzip -1 | \
  ssh root@120.26.86.139 'gzip -d | docker load'

docker save printlink-web:release | gzip -1 | \
  ssh root@120.26.86.139 'gzip -d | docker load'

docker save postgres:16-alpine | gzip -1 | \
  ssh root@120.26.86.139 'gzip -d | docker load'

docker save redis:7-alpine | gzip -1 | \
  ssh root@120.26.86.139 'gzip -d | docker load'
```

在服务器确认镜像：

```bash
ssh root@120.26.86.139
docker image inspect printlink-api:release --format '{{.RepoTags}} {{.Architecture}}'
docker image inspect printlink-web:release --format '{{.RepoTags}} {{.Architecture}}'
```

## 6. 首次启动和数据库迁移

以下命令均在服务器 `/opt/printlink` 目录执行：

```bash
cd /opt/printlink

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --wait --no-build postgres redis

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps migrate
```

迁移命令必须成功，并显示 `All migrations have been successfully applied`。迁移失败时，不要继续启动新版本 API。先保存错误日志并检查数据库状态。

## 7. 初始化生产基础数据

执行基础数据初始化：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps \
  api node --import tsx apps/api/prisma/seed.ts
```

成功时输出：

```text
Base catalog initialized; no users, printers or invitations created.
```

该步骤创建材料、颜色和计价规则。脚本可以重复执行，不会创建演示用户。不要在生产环境运行 `seed-demo.ts`。

## 8. 创建首个管理员

首个管理员手机号必须是尚未注册的真实手机号。将示例值替换为实际手机号：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps \
  -e ADMIN_PHONE=13812345678 \
  api node --import tsx apps/api/prisma/init-admin.ts
```

成功输出包含 `"event":"admin.bootstrap"` 和 `"created":true`。如果数据库已经存在其他管理员，或该手机号已经属于普通用户，脚本会停止且不修改数据。

## 9. 启动业务服务

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-build api web
```

检查容器状态：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
```

`api`、`web`、`postgres` 和 `redis` 应处于运行状态；`postgres` 和 `redis` 应显示 `healthy`。

## 10. 验证部署

在服务器验证首页：

```bash
curl -i http://127.0.0.1/
```

预期状态码为 `200`。在本机浏览器访问：

```text
http://120.26.86.139/login
```

依次验证以下业务流程：

1. 使用管理员手机号获取短信验证码并登录。
2. 打开发布需求界面，确认材料和颜色选项存在。
3. 上传一个符合大小限制的 `.3mf` 文件，确认模型可以解析和预览。
4. 提交需求，确认需求进入管理员审核列表。
5. 审核需求，并验证另一个用户可以查看和申请联系方式。
6. 验证 OSS Bucket 中出现模型对象，未签名的对象地址不能公开访问。

查看服务日志：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

## 11. 发布新版本

每次更新都按以下顺序执行：

1. 在本机完成代码检查和构建。
2. 将最新部署文件同步到 `/opt/printlink`。
3. 在服务器为当前 API 和 Web 镜像增加 `rollback` 标签。
4. 构建并导入新的 `linux/amd64` API 和 Web 镜像。
5. 在服务器执行一次迁移任务。
6. 迁移成功后重新创建 API 和 Web 容器。
7. 检查容器状态、日志和核心业务流程。

导入新镜像前，在服务器执行：

```bash
docker tag printlink-api:release printlink-api:rollback
docker tag printlink-web:release printlink-web:rollback
```

然后按第 4 节和第 5 节构建并导入新镜像。默认执行 `npm run build:images` 会重新生成 `:release` 标签。

新镜像导入完成后，在服务器执行：

```bash
cd /opt/printlink

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps migrate

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

不要在迁移失败后更新 API 和 Web。数据库迁移不会随代码镜像回滚；涉及删除或转换数据的版本必须先备份数据库并验证恢复过程。

如果新容器无法启动，且数据库迁移仍兼容旧版本，可以恢复旧镜像：

```bash
docker tag printlink-api:rollback printlink-api:release
docker tag printlink-web:rollback printlink-web:release

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

如果新迁移不兼容旧版本，不要直接执行该回退命令。先根据迁移内容和数据库备份确定恢复方案。

## 12. 数据备份

在服务器执行：

```bash
mkdir -p /opt/printlink/backups

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T postgres pg_dump -U printlink -d printlink -Fc \
  > /opt/printlink/backups/printlink-$(date +%Y%m%d-%H%M%S).dump
```

检查备份文件不是空文件：

```bash
ls -lh /opt/printlink/backups/
```

恢复备份会覆盖或合并目标数据库中的数据。必须先在独立数据库验证恢复命令和备份内容，再对生产数据库执行恢复。

## 13. 常见故障

### 页面无法打开

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps
ss -lntp | grep ':80'
curl -i http://127.0.0.1/
```

如果服务器本机返回 `200`，但公网无法访问，检查阿里云防火墙是否放行 TCP `80`，并确认使用 `http://`，而不是 `https://`。

### 页面返回 502

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

先找到 API 最早出现的配置错误。修正 `.env` 后，重新创建 API 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate api
```

### 平台尚未配置可用材料

执行第 7 节的生产基础数据初始化命令，然后强制刷新页面。

### `crypto.randomUUID is not a function`

旧版 Web 镜像在 IP + HTTP 环境中可能出现该错误。构建并导入包含 HTTP 兼容逻辑的最新 Web 镜像，然后重新创建 `web` 容器。

### 短信发送失败

确认 `OTP_PROVIDER=aliyun-pnvs`，并检查 RAM 权限、AccessKey、短信签名和模板代码。修改 `.env` 后必须重新创建 API 容器。

### OSS 上传失败

检查以下项目：

- Bucket 为私有 Bucket。
- RAM 用户可以调用 STS `AssumeRole`。
- STS 角色允许向指定 Bucket 前缀写入对象。
- `OSS_REGION`、`OSS_BUCKET` 和 `OSS_STS_ROLE_ARN` 与阿里云控制台一致。
- 修改 `.env` 后已重新创建 API 容器。

## 14. HTTPS 切换

绑定域名并配置 TLS 证书后，修改 `/opt/printlink/.env`：

```dotenv
WEB_ORIGIN=https://example.com
COOKIE_SECURE=true
```

重新创建 API 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate api
```

确认 HTTPS 登录、Cookie、短信和 OSS 上传均正常后，再将 HTTP 请求重定向到 HTTPS。
