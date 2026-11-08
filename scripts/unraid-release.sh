#!/usr/bin/env bash
# Invoked by deploy-unraid.sh. Configuration is provisioned separately on the host.
set -euo pipefail
umask 077
base=${1:?}
revision=${2:?}
incoming=${3:?}
[[ $base =~ ^/[a-zA-Z0-9_./-]+$ && $base != *..* ]] || exit 2
[[ $revision =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ $incoming == "$base"/incoming/upload.* && $incoming =~ ^[a-zA-Z0-9_./-]+$ ]] || exit 2
export DOCKER_CONFIG="$base/docker-config"
mkdir -p "$base/releases" "$base/backups"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Ein Deployment läuft bereits.'; exit 1; }
test -s "$base/.env" || { echo "Zuerst $base/.env konfigurieren."; exit 1; }
docker compose version >/dev/null
release="$base/releases/$revision"
if [[ ! -d $release ]]; then
  mkdir "$incoming/extracted"
  tar -xzf "$incoming/source.tar.gz" -C "$incoming/extracted"
  mv "$incoming/extracted" "$release"
fi
# Each upload carries the current operator script, independent of the app revision.
cp "$incoming/unraid-release.sh" "$base/unraid-release.sh"
cat > "$release/compose.release.yaml" <<OVERRIDE
services:
  app:
    image: kidsdaily365-app:$revision
  migrate:
    image: kidsdaily365-tools:$revision
OVERRIDE
compose() {
  docker compose --project-name kidsdaily365 --project-directory "$release" \
    --env-file "$base/.env" -f "$release/compose.yaml" -f "$release/compose.release.yaml" "$@"
}
compose config --quiet
# Never adopt an unrelated/manual Compose stack just because the name matches.
if [[ ! -e $base/managed-stack && ! -L $base/current ]]; then
  existing=$(docker ps -aq --filter label=com.docker.compose.project=kidsdaily365)
  [[ -z $existing ]] || { echo 'Vorhandenen kidsdaily365-Stack zuerst bewusst migrieren.'; exit 1; }
fi
printf 'kidsdaily365\n' > "$base/managed-stack"
autostart_file=${KIDSDAILY_AUTOSTART_FILE:-/var/lib/docker/unraid-autostart}
autostart_app() {
  [[ -f $autostart_file ]] || return 0
  local mode=$1
  awk '$1 != "kidsdaily365-app-1"' "$autostart_file" > "$autostart_file.kidsdaily-next"
  if [[ $mode == enable ]]; then
    grep -qxF 'kidsdaily365-db-1' "$autostart_file.kidsdaily-next" || printf 'kidsdaily365-db-1\n' >> "$autostart_file.kidsdaily-next"
    printf 'kidsdaily365-app-1\n' >> "$autostart_file.kidsdaily-next"
  fi
  mv -f "$autostart_file.kidsdaily-next" "$autostart_file"
}
if [[ -L $base/current && $(readlink "$base/current") == "$release" ]]; then
  echo "Version $revision ist bereits installiert."
  compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  autostart_app enable
  compose ps
  exit 0
fi
# Build while the previous app still serves requests; never change its database yet.
compose build
previous=''
if [[ -L $base/current ]]; then previous=$(readlink "$base/current"); fi
stopped=0
migration_started=0
finish() {
  status=$?
  if [[ $status != 0 ]]; then
    echo 'Deployment fehlgeschlagen. Release-Dateien und Sicherungen bleiben erhalten.' >&2
    if [[ $stopped == 1 && $migration_started == 0 ]]; then
      # No migration ran, so the existing container can safely resume.
      compose start app || true
    elif [[ $migration_started == 1 ]]; then
      compose stop app || true
      echo 'Migration wurde begonnen: App bleibt gestoppt. Kein automatischer Schema-Rollback.' >&2
    fi
  fi
}
trap finish EXIT
if [[ -n $previous ]]; then
  compose stop app
  stopped=1
  backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$previous")"
  mkdir "$backup"
  compose exec -T db pg_dump -U kidsdaily -d kidsdaily -Fc > "$backup/database.dump.partial"
  compose exec -T db pg_restore --list < "$backup/database.dump.partial" >/dev/null
  mv "$backup/database.dump.partial" "$backup/database.dump"
  cp "$base/.env" "$backup/config.env"
  printf '%s\n' "$(basename "$previous")" > "$backup/revision"
  sha256sum "$backup/database.dump" > "$backup/SHA256SUMS"
  echo "Backup abgeschlossen: $backup"
fi
compose up -d --wait db
autostart_app disable
migration_started=1
compose run --rm --no-deps migrate
# Migration was explicitly checked above; do not rerun the one-shot service.
compose up -d --no-deps --wait --wait-timeout 180 app
compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
printf '%s\n' "$revision" > "$base/installed-revision"
autostart_app enable
compose ps
printf 'Installiert: %s\n' "$revision"
