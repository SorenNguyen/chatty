#!/usr/bin/env bash
#
# Restores a backup created by backup-production.sh. The explicit confirmation
# prevents a copied command from silently replacing live data.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${CHATTY_COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.prod.yml}"
IDENTITY_FILE="${CHATTY_BACKUP_IDENTITY:?set CHATTY_BACKUP_IDENTITY to the age identity file}"
CONFIRMATION="${CHATTY_RESTORE_CONFIRM:-}"
BACKUP_FILE="${1:-}"

if command -v docker >/dev/null 2>&1; then
	DOCKER_BIN="$(command -v docker)"
elif [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
	DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker
else
	echo "Missing required command: docker" >&2
	exit 1
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
	echo "Usage: CHATTY_BACKUP_IDENTITY=/path/to/key.txt CHATTY_RESTORE_CONFIRM=replace-chatty-data $0 /path/to/chatty-*.tar.gz.age" >&2
	exit 1
fi

if [ "$CONFIRMATION" != "replace-chatty-data" ]; then
	echo "Restore replaces the production database and uploads." >&2
	echo "Set CHATTY_RESTORE_CONFIRM=replace-chatty-data to continue." >&2
	exit 1
fi

for dependency in age tar; do
	if ! command -v "$dependency" >/dev/null 2>&1; then
		echo "Missing required command: $dependency" >&2
		exit 1
	fi
done

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

manifest_value() {
	awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2); exit }' "$STAGING_DIR/manifest"
}

STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chatty-restore.XXXXXX")"
SERVICES_STOPPED=false

cleanup() {
	rm -rf -- "$STAGING_DIR"
	if [ "$SERVICES_STOPPED" = true ]; then
		echo "Restore did not complete; application writers remain stopped for inspection." >&2
		echo "After resolving the failure, start them with: docker compose -f $COMPOSE_FILE up -d api-1 api-2 api-gateway web" >&2
	fi
}
trap cleanup EXIT

age --decrypt --identity "$IDENTITY_FILE" "$BACKUP_FILE" | tar -xzf - -C "$STAGING_DIR"

if [ "$(manifest_value format)" != "chatty-backup-v1" ]; then
	echo "Unsupported or missing backup manifest" >&2
	exit 1
fi

if [ "$(sha256_file "$STAGING_DIR/database.dump")" != "$(manifest_value database_sha256)" ]; then
	echo "Database dump checksum does not match the manifest" >&2
	exit 1
fi

if [ "$(sha256_file "$STAGING_DIR/uploads.tar")" != "$(manifest_value uploads_sha256)" ]; then
	echo "Upload archive checksum does not match the manifest" >&2
	exit 1
fi

# Keep application writers out while the database and file volume move back to
# one consistent snapshot. PostgreSQL stays up because pg_restore needs it.
"$DOCKER_BIN" compose -f "$COMPOSE_FILE" stop api-gateway api-1 api-2 web
SERVICES_STOPPED=true

"$DOCKER_BIN" compose -f "$COMPOSE_FILE" exec -T postgres \
	pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
	--username=chatty --dbname=chatty <"$STAGING_DIR/database.dump"

"$DOCKER_BIN" compose -f "$COMPOSE_FILE" run --rm --no-deps -T --user 0 --entrypoint sh api-1 -c \
	'find /data/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xf - -C /data/uploads; chown -R node:node /data/uploads' \
	<"$STAGING_DIR/uploads.tar"

"$DOCKER_BIN" compose -f "$COMPOSE_FILE" up -d api-1 api-2 api-gateway web
SERVICES_STOPPED=false
echo "Restore completed from $BACKUP_FILE"
