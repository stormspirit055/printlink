# PrintLink 版本迭代部署手册

本文适用于已经完成首次部署的生产环境。新版本在本地构建为 `linux/amd64` Docker 镜像，通过可断点续传的方式上传到服务器；服务器只拉取代码、校验文件、备份数据库、执行迁移和替换业务容器。

本流程不包含 Docker、Git、域名、HTTPS、数据库和环境变量的首次配置。首次部署请阅读 [服务器部署手册](./SERVER_DEPLOYMENT.md)。

## 发布流程

```text
本地检查代码并推送 main
  -> 本地构建带提交号的 API/Web 镜像
  -> 导出镜像并生成校验文件
  -> 断点续传到服务器
  -> 服务器拉取同一提交的代码
  -> 备份数据库和当前运行镜像
  -> 导入新镜像并执行数据库迁移
  -> 替换 API/Web 容器
  -> 健康检查和业务验收
```

构建和传输期间，线上服务继续运行。只有替换 API 和 Web 容器时会发生短暂中断。

## 1. 发布前提

开始前确认：

- 本地已经安装 Node.js、npm、Docker Desktop 和 `rsync`，并且 Docker 正在运行。
- 本地代码使用 `main` 分支，待发布代码已经提交并推送到远端仓库。
- 服务器 `/opt/printlink` 是 Git 工作区，可以读取远端仓库。
- 服务器已经安装 Docker Engine、Docker Compose v2、Git 和 `rsync`，不需要安装 Node.js。
- 生产 `.env` 位于 `/opt/printlink/.env`，本次发布不修改该文件。
- 当前没有其他人同时执行部署或数据库结构变更。

以下示例使用服务器 `root@120.26.86.139` 和部署目录 `/opt/printlink`。

## 2. 本地检查并确定版本

在本地项目根目录执行：

```bash
cd /Users/storm/Documents/印蛙
git branch --show-current
git status --short
```

预期分支为 `main`，并且 `git status --short` 没有输出。如果存在未提交修改，先完成提交；不要用未提交的工作区构建生产镜像。

安装依赖并执行项目检查：

```bash
npm ci
npm run db:generate
npm run check
git status --short
```

检查通过后推送代码，并记录完整提交哈希：

```bash
git push origin main
RELEASE_COMMIT=$(git rev-parse HEAD)
test "$(git rev-parse origin/main)" = "$RELEASE_COMMIT"
echo "$RELEASE_COMMIT"
```

后续所有命令必须使用同一个 `RELEASE_COMMIT`。不要使用可移动的 `latest` 标签代替提交哈希。

## 3. 本地构建生产镜像

使用项目的 Bake 配置构建 `linux/amd64` 镜像：

```bash
TAG="$RELEASE_COMMIT" npm run build:images
```

即使本地是 Apple 芯片，该命令也会按服务器架构构建镜像。确认镜像存在且架构正确：

```bash
docker image inspect "printlink-api:$RELEASE_COMMIT" \
  --format '{{.RepoTags}} {{.Os}}/{{.Architecture}}'
docker image inspect "printlink-web:$RELEASE_COMMIT" \
  --format '{{.RepoTags}} {{.Os}}/{{.Architecture}}'
```

两条命令都应显示 `linux/amd64`。任一镜像构建或检查失败时停止发布。

## 4. 导出并校验镜像包

创建本次发布的临时目录：

```bash
LOCAL_PACKAGE_DIR=$(mktemp -d /tmp/printlink-release.XXXXXX)
echo "$LOCAL_PACKAGE_DIR"
```

导出并压缩两个镜像：

```bash
docker save "printlink-api:$RELEASE_COMMIT" | \
  gzip -1 > "$LOCAL_PACKAGE_DIR/printlink-api-$RELEASE_COMMIT.tar.gz"
docker save "printlink-web:$RELEASE_COMMIT" | \
  gzip -1 > "$LOCAL_PACKAGE_DIR/printlink-web-$RELEASE_COMMIT.tar.gz"
```

生成校验文件，并先在本地验证一次：

```bash
(cd "$LOCAL_PACKAGE_DIR" && shasum -a 256 *.tar.gz > SHA256SUMS)
(cd "$LOCAL_PACKAGE_DIR" && shasum -a 256 -c SHA256SUMS)
ls -lh "$LOCAL_PACKAGE_DIR"
```

只有两个文件都显示 `OK` 时才能继续。

## 5. 断点续传到服务器

为本次发布创建独立的接收目录：

```bash
SERVER_PACKAGE_DIR="/var/backups/printlink/incoming/$RELEASE_COMMIT"
ssh root@120.26.86.139 "mkdir -p '$SERVER_PACKAGE_DIR'"
```

上传镜像包和校验文件：

```bash
rsync -av --append --progress \
  -e 'ssh -o ServerAliveInterval=10 -o ServerAliveCountMax=12' \
  "$LOCAL_PACKAGE_DIR/" \
  "root@120.26.86.139:$SERVER_PACKAGE_DIR/"
```

连接中断时，原样重新执行这条 `rsync` 命令。它会从已有文件继续传输。

上传完成后登录服务器：

```bash
ssh root@120.26.86.139
```

下文命令均在服务器执行。先将本地记录的完整提交哈希赋值给变量：

```bash
RELEASE_COMMIT=<本地记录的完整提交哈希>
SERVER_PACKAGE_DIR="/var/backups/printlink/incoming/$RELEASE_COMMIT"
```

校验压缩包：

```bash
cd "$SERVER_PACKAGE_DIR"
sha256sum -c SHA256SUMS
gzip -t "printlink-api-$RELEASE_COMMIT.tar.gz"
gzip -t "printlink-web-$RELEASE_COMMIT.tar.gz"
```

校验必须全部成功。失败时不要导入镜像，重新上传对应文件后再次校验。

## 6. 服务器同步同一版本的代码

进入生产工作区并检查状态：

```bash
cd /opt/printlink
git branch --show-current
git status --short
```

预期分支为 `main`，并且工作区没有未提交修改。否则停止发布并先确认修改来源。

记录当前代码版本，再查看并拉取待发布版本：

```bash
PREVIOUS_COMMIT=$(git rev-parse HEAD)
git fetch --prune origin
git log --oneline HEAD..origin/main
git pull --ff-only origin main
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"
git log -1 --oneline
```

最后一项校验失败，说明服务器代码和镜像不是同一个提交。此时停止发布，不要迁移数据库或替换容器。

检查生产 Compose 配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
```

配置解析失败，或 PostgreSQL、Redis、API、Web 状态异常时，先处理现有服务问题。

## 7. 备份数据库和当前镜像

创建本次发布记录目录：

```bash
RELEASE_RECORD_DIR="/var/backups/printlink/release-$(date +%Y%m%d-%H%M%S)-$RELEASE_COMMIT"
mkdir -m 700 "$RELEASE_RECORD_DIR"
```

备份 PostgreSQL，并确认备份不是空文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T postgres pg_dump -U printlink -d printlink -Fc \
  > "$RELEASE_RECORD_DIR/database.dump"
test -s "$RELEASE_RECORD_DIR/database.dump"
ls -lh "$RELEASE_RECORD_DIR/database.dump"
```

记录发布前版本，并为当前运行镜像增加回滚标签：

```bash
API_CONTAINER=$(docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps -q api)
WEB_CONTAINER=$(docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app ps -q web)
API_IMAGE=$(docker inspect --format '{{.Image}}' "$API_CONTAINER")
WEB_IMAGE=$(docker inspect --format '{{.Image}}' "$WEB_CONTAINER")
test -n "$API_IMAGE"
test -n "$WEB_IMAGE"
docker tag "$API_IMAGE" printlink-api:rollback
docker tag "$WEB_IMAGE" printlink-web:rollback
printf 'previous_commit=%s\nrelease_commit=%s\nprevious_api_image=%s\nprevious_web_image=%s\n' \
  "$PREVIOUS_COMMIT" "$RELEASE_COMMIT" "$API_IMAGE" "$WEB_IMAGE" \
  > "$RELEASE_RECORD_DIR/version.txt"
```

此处的 `rollback` 标签指向发布前正在运行的镜像。每次发布都会覆盖上一次的回滚标签。

## 8. 导入新镜像

导入两个已校验的镜像包：

```bash
gzip -dc "$SERVER_PACKAGE_DIR/printlink-api-$RELEASE_COMMIT.tar.gz" | docker load
gzip -dc "$SERVER_PACKAGE_DIR/printlink-web-$RELEASE_COMMIT.tar.gz" | docker load
```

确认带提交号的镜像存在：

```bash
docker image inspect "printlink-api:$RELEASE_COMMIT" \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}'
docker image inspect "printlink-web:$RELEASE_COMMIT" \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

两项都应显示 `linux/amd64`。确认后，将生产使用的固定标签指向新镜像：

```bash
docker tag "printlink-api:$RELEASE_COMMIT" printlink-api:release
docker tag "printlink-web:$RELEASE_COMMIT" printlink-web:release
```

## 9. 执行数据库迁移

使用新 API 镜像执行迁移：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app run --rm --no-deps migrate
```

迁移必须成功退出。迁移失败时不要替换 API 和 Web；保留终端错误和 `$RELEASE_RECORD_DIR`，按照 [数据库迁移与部署](./DATABASE_MIGRATIONS.md) 检查数据库实际状态。

生产数据库禁止执行 `migrate reset`，也不要执行带数据丢失选项的 `db push`。

## 10. 替换业务容器

迁移成功后重新创建 API 和 Web：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

检查容器状态和启动日志：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app ps
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app logs --tail=200 api web
```

如果 API 或 Web 持续重启，不要反复执行替换命令。立即查看对应容器日志，并根据第 12 节判断是否回滚应用。

## 11. 验证新版本

检查 API 就绪状态：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app exec -T api node -e \
  "fetch('http://127.0.0.1:4311/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) }).catch(e => { console.error(e); process.exit(1) })"
```

检查 Web 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app exec -T web wget -q -O /dev/null http://127.0.0.1/
```

再通过生产域名验证登录、页面加载、API 请求、文件访问和本次改动涉及的业务流程。验证通过后保留 `$RELEASE_RECORD_DIR` 中的数据库备份和版本记录。

## 12. 应用回滚

只有新数据库迁移仍兼容旧版应用时，才可以直接回滚镜像：

```bash
docker tag printlink-api:rollback printlink-api:release
docker tag printlink-web:rollback printlink-web:release
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --profile app up -d --no-deps --force-recreate --no-build api web
```

随后重新执行第 11 节的健康检查和业务验证。

镜像回滚不会撤销数据库迁移。如果迁移删除、重命名或转换了旧版应用依赖的数据结构，不要直接回滚应用，也不要直接覆盖生产数据库。应根据迁移内容、故障时间点和本次 `database.dump` 单独制定数据库恢复步骤。

## 13. 发布后清理

版本稳定后，删除本次传输文件：

服务器执行：

```bash
rm -rf "$SERVER_PACKAGE_DIR"
```

退出服务器后，在本地执行：

```bash
rm -rf "$LOCAL_PACKAGE_DIR"
```

保留发布记录目录和 `rollback` 镜像，直到确认不再需要回滚。不要在发布过程中执行全局容器、镜像或数据卷清理命令。

## 故障停止点

遇到以下任一情况时停止发布：

- 本地项目检查或镜像构建失败。
- 镜像架构不是 `linux/amd64`。
- 服务器校验和不一致或压缩包损坏。
- 服务器 Git 工作区不干净，或代码提交与 `RELEASE_COMMIT` 不一致。
- 数据库备份为空或失败。
- Compose 配置检查或数据库迁移失败。
- PostgreSQL、Redis 或现有业务容器在替换前已经异常。

停止发布不会影响仍在运行的旧版容器；如果数据库迁移已经执行，则需要先判断迁移与旧版应用的兼容性。
