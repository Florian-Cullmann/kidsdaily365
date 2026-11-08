#!/usr/bin/env bash
# Run on a development machine with Git and SSH access; no GitHub token on Unraid.
set -euo pipefail
host=${1:?Usage: deploy-unraid.sh user@host [git-ref]}
ref=${2:-origin/main}
base=${KIDSDAILY_REMOTE_PATH:-/mnt/user/appdata/kidsdaily365}
port=${KIDSDAILY_SSH_PORT:-22}
[[ $host =~ ^[a-zA-Z0-9_.@-]+$ && $host != -* ]] || exit 2
[[ $base =~ ^/[a-zA-Z0-9_./-]+$ && $base != *..* ]] || exit 2
[[ $port =~ ^[0-9]+$ ]] || exit 2
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"
if [[ $ref == origin/main ]]; then git fetch origin main; fi
revision=$(git rev-parse --verify "${ref}^{commit}")
ssh_args=(-o BatchMode=yes -o StrictHostKeyChecking=yes -p "$port")
scp_args=(-o BatchMode=yes -o StrictHostKeyChecking=yes -P "$port")
if [[ -n ${KIDSDAILY_SSH_KEY:-} ]]; then
  ssh_args+=(-i "$KIDSDAILY_SSH_KEY" -o IdentitiesOnly=yes)
  scp_args+=(-i "$KIDSDAILY_SSH_KEY" -o IdentitiesOnly=yes)
fi
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git archive --format=tar.gz "$revision" > "$stage/source.tar.gz"
remote_stage=$(ssh "${ssh_args[@]}" "$host" "umask 077; mkdir -p '$base/incoming'; mktemp -d '$base/incoming/upload.XXXXXXXX'")
[[ $remote_stage == "$base"/incoming/upload.* && $remote_stage =~ ^[a-zA-Z0-9_./-]+$ ]] || exit 2
scp "${scp_args[@]}" "$stage/source.tar.gz" "$root/scripts/unraid-release.sh" "$host:$remote_stage/"
ssh "${ssh_args[@]}" "$host" "bash '$remote_stage/unraid-release.sh' '$base' '$revision' '$remote_stage'"
