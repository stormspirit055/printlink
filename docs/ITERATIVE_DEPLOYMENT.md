# PrintLink 版本迭代部署手册

本文用于已经完成首次部署的生产服务器。流程从 Git 仓库拉取 `main` 分支最新代码，构建新的生产镜像，执行数据库迁移，然后替换 API 和 Web 容器。

本文不包含 Docker、域名、HTTPS、短信、OSS、数据库和环境变量的首次配置。首次部署请阅读 [服务器部署手册](./SERVER_DEPLOYMENT.md)。

服务器不需要安装 Node.js，也不在服务器构建镜像。代码推送到 `main` 后，GitHub Actions 构建并发布 `linux/amd64` 镜像。服务器脚本拉取对应提交的镜像，然后执行迁移和替换。

## 0. 一次性准备 Git 工作区

首次部署如果通过 `rsync` 上传源码，`/opt/printlink` 中没有 `.git`，需要执行本节一次性转换。后续发布直接从第 1 节开始。

### 安装 Git

先识别服务器发行版：

```bash
cat /etc/os-release
```

Ubuntu 或 Debian：

```bash
sudo apt-get update
sudo apt-get install -y git
```

Alibaba Cloud Linux、Rocky Linux、AlmaLinux 或其他使用 DNF 的系统：

```bash
sudo dnf install -y git
```

旧版 CentOS：

```bash
sudo yum install -y git
```

确认安装结果：

```bash
git --version
docker compose version
```

### 配置仓库只读部署密钥

为当前服务器用户生成独立密钥：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C 'printlink-production-deploy' \
  -f ~/.ssh/printlink_deploy -N ''
chmod 600 ~/.ssh/printlink_deploy
cat ~/.ssh/printlink_deploy.pub
```

在 GitHub 仓库 `stormspirit055/printlink` 的「Settings > Deploy keys」中添加输出的公钥。只需要读取仓库，不要启用写权限。

测试连接。首次连接时先核对 GitHub 主机指纹，再接受主机密钥：

```bash
ssh -T -i ~/.ssh/printlink_deploy -o IdentitiesOnly=yes git@github.com
```

GitHub 会提示认证成功但不提供 Shell，这是正常结果。

### 将现有部署目录转换为 Git 工作区

确认当前服务仍在运行，并检查生产配置文件存在：

```bash
cd /opt/printlink
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps
test -f .env
```

从仓库克隆最新 `main` 到临时目录：

```bash
cd /opt
GIT_SSH_COMMAND='ssh -i ~/.ssh/printlink_deploy -o IdentitiesOnly=yes' \
  git clone --branch main --single-branch \
  git@github.com:stormspirit055/printlink.git printlink-next
```

将现有生产 `.env` 复制到新工作区，并保持仅当前用户可读写：

```bash
install -m 600 /opt/printlink/.env /opt/printlink-next/.env
```

比较生产 Compose 文件：

```bash
diff -u /opt/printlink/docker-compose.production.yml \
  /opt/printlink-next/docker-compose.production.yml || true
```

如果差异只是旧目录中将 Web 改为 `127.0.0.1:8080:80`，不要修改新目录的 Compose 文件。在 `/opt/printlink-next/.env` 中增加：

```dotenv
WEB_BIND=127.0.0.1:8080
```

其他差异需要逐项确认。服务器专用配置不能直接写回受 Git 管理的文件，否则后续 `git pull --ff-only` 可能失败。

确认新目录包含 `.env`、Compose 文件和 `.git`：

```bash
test -f /opt/printlink-next/.env
test -f /opt/printlink-next/docker-compose.yml
test -d /opt/printlink-next/.git
```

保留旧源码目录并切换新工作区。该操作不会停止已经运行的容器：

```bash
cd /opt
DEPLOY_LEGACY_DIR="/opt/printlink-before-git-$(date +%Y%m%d-%H%M%S)"
mv /opt/printlink "$DEPLOY_LEGACY_DIR"
mv /opt/printlink-next /opt/printlink
```

为该仓库固定部署密钥，并验证可以读取远端：

```bash
cd /opt/printlink
git config core.sshCommand 'ssh -i ~/.ssh/printlink_deploy -o IdentitiesOnly=yes'
git fetch origin
git status --short
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps
```

`git status --short` 应没有输出，原有容器应继续运行。确认迭代发布成功后，再单独处理 `$DEPLOY_LEGACY_DIR` 指向的旧源码备份目录。

## 1. 发布前提

### 使用迭代部署脚本

完成第 0 节准备，并确保脚本已同步到服务器后，可以使用脚本执行下文的发布主流程：

```bash
bash /opt/printlink/scripts/deploy-update.sh
```

自定义源码目录和备份目录：

```bash
bash /opt/printlink/scripts/deploy-update.sh /opt/printlink /var/backups/printlink
```

使用能够访问 Docker、仓库和 `/opt` 目录的部署用户执行。脚本要求 `git`、`docker` 和 `flock` 可用，不需要服务器安装 Node.js。`flock` 由 Linux 的 util-linux 软件包提供。

脚本检查干净的 `main` 工作区，备份数据库及运行镜像，然后拉取代码、等待 GitHub Actions 镜像、迁移数据库和替换 API/Web。镜像尚未发布时，脚本每 30 秒重试一次，最多等待 20 分钟。拉取和等待镜像期间，现有服务继续运行。

脚本最多重试 API 就绪检查 30 次，间隔 2 秒，并检查 Web 容器首页。日志、数据库备份和版本记录保存在备份目录下独立的 `release-*` 目录中。

任何步骤失败都会停止发布。失败不会自动回滚；迁移可能已经改变数据库，先根据日志确认数据库兼容性，再按第 10 节处理。数据库备份不包含 OSS 对象或上传卷。脚本完成后仍需要通过实际生产域名验证登录、上传和本次改动的业务流程。

开始发布前，确认：

- 当前服务已通过 `docker-compose.yml` 和 `docker-compose.production.yml` 运行。
- 服务器部署目录为 `/opt/printlink`，并且是可以访问 `origin` 的 Git 工作区。
- 服务器已安装 Git、Docker Engine 和 Docker Compose v2；不要求安装 Node.js 或 npm。
- 生产 `.env` 已存在，不需要随代码更新。
- 待发布代码已经合并到远端 `main` 分支。
- 当前没有其他人员执行部署或数据库结构变更。

下文命令均在服务器执行。

## 2. 检查当前版本

进入部署目录：

```bash
cd /opt/printlink
```

检查服务状态：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
```

检查当前提交和工作区：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

预期当前分支为 `main`，并且 `git status --short` 没有输出。如果工作区存在未提交修改，先确认修改来源。不要直接覆盖或删除这些修改。

记录 `git rev-parse HEAD` 输出的发布前提交哈希。发生回滚时需要使用该版本定位代码和迁移变化。

## 3. 备份数据库和旧镜像

发布包含数据库迁移时，先备份 PostgreSQL：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T postgres pg_dump -U printlink -d printlink -Fc \
  > /var/backups/printlink/printlink-$(date +%Y%m%d-%H%M%S).dump
```

确认备份文件存在且不是空文件：

```bash
ls -lh /var/backups/printlink/
```

获取当前运行容器的镜像 ID，并增加回滚标签：

```bash
DEPLOY_API_CONTAINER_ID=$(docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps -q api)
DEPLOY_WEB_CONTAINER_ID=$(docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps -q web)
DEPLOY_API_IMAGE_ID=$(docker inspect --format '{{.Image}}' "$DEPLOY_API_CONTAINER_ID")
DEPLOY_WEB_IMAGE_ID=$(docker inspect --format '{{.Image}}' "$DEPLOY_WEB_CONTAINER_ID")
docker tag "$DEPLOY_API_IMAGE_ID" printlink-api:rollback
docker tag "$DEPLOY_WEB_IMAGE_ID" printlink-web:rollback
docker image inspect printlink-api:rollback --format '{{.Id}} {{.Created}}'
docker image inspect printlink-web:rollback --format '{{.Id}} {{.Created}}'
```

如果容器 ID 为空或 `docker inspect` 失败，停止发布并先确认当前容器状态。每次发布都会覆盖现有 `rollback` 标签。如需保留多个历史版本，应在镜像仓库中使用提交哈希或版本号保存镜像。

## 4. 拉取最新代码

获取远端状态：

```bash
git fetch --prune origin
```

查看即将发布的提交：

```bash
git log --oneline --decorate HEAD..origin/main
```

确认提交范围正确后，以快进方式更新本地 `main`：

```bash
git switch main
git pull --ff-only origin main
```

确认当前代码版本：

```bash
git rev-parse HEAD
git log -1 --oneline
```

`git pull --ff-only` 失败时停止发布。先处理本地分支偏离或工作区修改，不要在生产服务器执行强制重置。

## 5. 检查部署配置

新版本可能修改 Compose 文件。构建前检查合并后的生产配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app config --quiet
```

命令无输出并以状态码 `0` 结束表示配置可以解析。配置检查失败时停止发布并修复代码，不要替换现有容器。

## 6. 获取新镜像

代码推送到 `main` 后，`.github/workflows/publish-images.yml` 在 GitHub Actions 构建并发布：

```text
ghcr.io/stormspirit055/printlink-api:<完整提交哈希>
ghcr.io/stormspirit055/printlink-web:<完整提交哈希>
```

首次发布后，在 GitHub 的 Packages 页面分别打开 `printlink-api` 和 `printlink-web`，进入「Package settings > Change visibility」，将两个包设为 `Public`。仓库和镜像都不包含 `.env` 或生产密钥。完成该一次性设置后，服务器可以匿名拉取镜像。

脚本自动等待并拉取镜像。也可以手工检查：

```bash
docker pull ghcr.io/stormspirit055/printlink-api:<完整提交哈希>
docker pull ghcr.io/stormspirit055/printlink-web:<完整提交哈希>
```

GitHub Actions 构建失败或镜像包未公开时，脚本停在 `pull-images` 阶段，不执行迁移或替换容器。

## 7. 执行数据库迁移

使用新 API 镜像运行一次性迁移任务：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps migrate
```

迁移命令必须成功退出。迁移失败时：

1. 不要继续更新 API 和 Web。
2. 保存迁移错误、当前提交哈希和数据库备份。
3. 按 [数据库迁移与部署](./DATABASE_MIGRATIONS.md) 检查数据库实际状态。

不要在生产数据库执行 `migrate reset` 或带数据丢失选项的 `db push`。

## 8. 替换业务容器

迁移成功后，使用新镜像重新创建 API 和 Web：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

检查容器状态：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
```

查看新容器启动日志：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

## 9. 验证新版本

在 API 容器内执行就绪检查：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app exec -T api node -e \
  "fetch('http://127.0.0.1:4311/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
```

通过生产域名检查 Web：

```bash
curl -fI https://<生产域名>/
```

根据本次改动验证受影响的业务流程。至少确认登录、页面加载、API 请求和文件访问正常。验证通过后记录新提交哈希和发布时间。

## 10. 应用回滚

只有在新数据库迁移仍兼容旧版应用时，才可以直接回滚镜像。将旧镜像重新标记为 `release`：

```bash
docker tag printlink-api:rollback printlink-api:release
docker tag printlink-web:rollback printlink-web:release
```

重新创建业务容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

随后重新执行第 9 节的健康检查和业务验证。

镜像回滚不会撤销数据库迁移。如果迁移删除、转换或重命名了旧版应用依赖的数据结构，不要直接执行以上回滚。先根据迁移内容和数据库备份制定恢复步骤。

## 11. 清理旧镜像

确认新版本稳定并且不再需要回滚镜像后，再查看未使用镜像：

```bash
docker image ls
```

按镜像 ID 单独删除确认不再使用的镜像。不要在发布过程中执行全局镜像、容器或数据卷清理命令。

## 快速命令清单

代码推送到远端 `main` 后，在服务器执行：

```bash
cd /opt/printlink
bash scripts/deploy-update.sh
```

首次启用本版本的脚本时，服务器仍是旧脚本，需要先执行一次：

```bash
cd /opt/printlink
git pull --ff-only origin main
bash scripts/deploy-update.sh
```

后续版本只需运行脚本。脚本先从 `origin/main` 读取最新版部署脚本，再执行备份、`git pull --ff-only origin main`、顺序构建、迁移和替换，因此应用代码和部署脚本可以在同一次提交中更新。
