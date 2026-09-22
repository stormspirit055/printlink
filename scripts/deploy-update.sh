#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

main() {
  local deploy_dir=${1:-/opt/printlink}
  local backup_dir=${2:-/var/backups/printlink}
  local registry=${DEPLOY_REGISTRY:-ghcr.io/stormspirit055}
  local stage=preflight old_commit new_commit api_container web_container api_image web_image release_dir attempt
  local api_remote_image web_remote_image
  cd "$deploy_dir"
  for command_name in git docker flock; do
    command -v "$command_name" >/dev/null || { echo "Missing command: $command_name" >&2; return 1; }
  done
  exec 9>/opt/printlink-deploy.lock
  flock -n 9 || { echo 'Another deployment is running.' >&2; return 1; }
  [[ $(git branch --show-current) == main ]] || { echo 'Expected main branch.' >&2; return 1; }
  [[ -z $(git status --porcelain) ]] || { echo 'Working tree must be clean.' >&2; return 1; }
  [[ -f .env ]] || { echo 'Production .env is missing.' >&2; return 1; }
  docker compose version >/dev/null
  compose() { docker compose -f docker-compose.yml -f docker-compose.production.yml --profile app "$@"; }
  compose config --quiet
  api_container=$(compose ps -q api)
  web_container=$(compose ps -q web)
  [[ -n "$api_container" && -n "$web_container" ]] || { echo 'API and Web must be running.' >&2; return 1; }
  api_image=$(docker inspect --format '{{.Image}}' "$api_container")
  web_image=$(docker inspect --format '{{.Image}}' "$web_container")
  old_commit=$(git rev-parse HEAD)
  mkdir -p "$backup_dir"
  backup_dir=$(cd "$backup_dir" && pwd)
  release_dir=$(mktemp -d "$backup_dir/release-$(date +%Y%m%d-%H%M%S)-XXXXXX")
  exec > >(tee -a "$release_dir/deploy.log") 2>&1
  on_error() {
    local exit_code=$?
    trap - ERR
    echo "Deployment failed at stage: $stage. Records: $release_dir. No database or image rollback performed." >&2
    exit "$exit_code"
  }
  trap on_error ERR
  printf 'previous_commit=%s\napi_image=%s\nweb_image=%s\n' "$old_commit" "$api_image" "$web_image" > "$release_dir/version.txt"

  stage=backup
  echo 'Backing up database and running images...'
  compose exec -T postgres pg_dump -U printlink -d printlink -Fc > "$release_dir/database.dump"
  test -s "$release_dir/database.dump"
  docker tag "$api_image" printlink-api:rollback
  docker tag "$web_image" printlink-web:rollback

  stage=pull
  git fetch --prune origin
  git log --oneline HEAD..origin/main
  git pull --ff-only origin main
  new_commit=$(git rev-parse HEAD)
  printf 'new_commit=%s\n' "$new_commit" >> "$release_dir/version.txt"
  compose config --quiet

  stage=pull-images
  if [[ ${DEPLOY_SKIP_BUILD:-0} == 1 ]]; then
    echo 'Using release images already imported on this server.'
    docker image inspect printlink-api:release printlink-web:release >/dev/null
  else
    api_remote_image="$registry/printlink-api:$new_commit"
    web_remote_image="$registry/printlink-web:$new_commit"
    echo "Waiting for published images for commit $new_commit..."
    for attempt in {1..40}; do
      if docker pull "$api_remote_image" && docker pull "$web_remote_image"; then
        break
      fi
      if [[ $attempt == 40 ]]; then
        echo 'Images were not available after 20 minutes. Check the GitHub Actions workflow and package visibility.' >&2
        return 1
      fi
      sleep 30
    done
    docker tag "$api_remote_image" printlink-api:release
    docker tag "$web_remote_image" printlink-web:release
  fi
  stage=migrate
  compose run --rm --no-deps migrate
  stage=replace
  compose up -d --no-deps --force-recreate --no-build api web
  stage=verify
  for attempt in {1..30}; do
    if compose exec -T api node -e "fetch('http://127.0.0.1:4311/health/ready').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"; then
      break
    fi
    if [[ $attempt == 30 ]]; then
      compose logs --tail=200 api web
      return 1
    fi
    sleep 2
  done
  # Nginx serves the built Web bundle inside its own container.
  compose exec -T web wget -q -O /dev/null http://127.0.0.1/
  compose ps
  compose logs --tail=100 api web
  echo "Deployment complete: $new_commit"
  echo "Backup and logs: $release_dir"
  echo 'Verify login, uploads and changed workflows through the production domain.'
}

if [[ ${DEPLOY_BOOTSTRAPPED:-0} != 1 ]]; then
  bootstrap_dir=${1:-/opt/printlink}
  bootstrap_script=$(mktemp /tmp/printlink-deploy-update-XXXXXX.sh)
  trap 'rm -f "$bootstrap_script"' EXIT
  git -C "$bootstrap_dir" fetch --prune origin
  git -C "$bootstrap_dir" show origin/main:scripts/deploy-update.sh > "$bootstrap_script"
  if ! cmp -s "$bootstrap_script" "$bootstrap_dir/scripts/deploy-update.sh"; then
    echo 'A newer deployment script was found; running that version.'
    DEPLOY_BOOTSTRAPPED=1 bash "$bootstrap_script" "$@"
    exit $?
  fi
fi

# Parse the complete function before pulling code that may replace this file.
main "$@"
