#!/usr/bin/env bash
#
# Creates one encrypted, self-contained backup of the production database and
# upload volume. Encryption happens before bytes leave this machine.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${CHATTY_COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.prod.yml}"
BACKUP_DIR="${CHATTY_BACKUP_DIR:?set CHATTY_BACKUP_DIR to a dedicated off-host or mounted backup directory}"
RECIPIENT="${CHATTY_BACKUP_RECIPIENT:?set CHATTY_BACKUP_RECIPIENT to an age public recipient}"
RETENTION_DAYS="${CHATTY_BACKUP_RETENTION_DAYS:?set CHATTY_BACKUP_RETENTION_DAYS to 0 (keep all) or a positive number}"

if command -v docker >/dev/null 2>&1; then
	DOCKER_BIN="$(command -v docker)"
elif [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
	# Docker Desktop can be running before its optional CLI symlink reaches PATH.
	DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker
else
	echo "Missing required command: docker" >&2
	exit 1
fi

case "$BACKUP_DIR" in
	"" | / | . | "$PROJECT_ROOT")
		echo "Refusing unsafe CHATTY_BACKUP_DIR: $BACKUP_DIR" >&2
		exit 1
		;;
esac

case "$RETENTION_DAYS" in
	*[!0-9]* | "")
		echo "CHATTY_BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
		exit 1
		;;
esac

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

mkdir -p "$BACKUP_DIR"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chatty-backup.XXXXXX")"
SERVICES_STOPPED=false

cleanup() {
	rm -rf -- "$STAGING_DIR"
	if [ "$SERVICES_STOPPED" = true ]; then
		"$DOCKER_BIN" compose -f "$COMPOSE_FILE" up -d api-1 api-2 api-gateway web >/dev/null || true
	fi
}
trap cleanup EXIT

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATABASE_DUMP="$STAGING_DIR/database.dump"
UPLOADS_DIR="$STAGING_DIR/uploads"
UPLOADS_ARCHIVE="$STAGING_DIR/uploads.tar"
BUNDLE="$STAGING_DIR/chatty-$TIMESTAMP.tar.gz"
FINAL_PATH="$BACKUP_DIR/chatty-$TIMESTAMP.tar.gz.age"
TEMP_PATH="$FINAL_PATH.partial"

mkdir -p "$UPLOADS_DIR"
# PostgreSQL and a filesystem cannot share one transaction. A short maintenance
# window is the only honest zero-cost way to keep rows and upload bytes at the
# same point in time.
"$DOCKER_BIN" compose -f "$COMPOSE_FILE" stop api-gateway api-1 api-2 web
SERVICES_STOPPED=true
"$DOCKER_BIN" compose -f "$COMPOSE_FILE" exec -T postgres \
	pg_dump --username=chatty --dbname=chatty --format=custom >"$DATABASE_DUMP"
"$DOCKER_BIN" compose -f "$COMPOSE_FILE" cp api-1:/data/uploads/. "$UPLOADS_DIR"
COPYFILE_DISABLE=1 tar --no-xattrs -C "$UPLOADS_DIR" -cf "$UPLOADS_ARCHIVE" .
"$DOCKER_BIN" compose -f "$COMPOSE_FILE" up -d api-1 api-2 api-gateway web
SERVICES_STOPPED=false

cat >"$STAGING_DIR/manifest" <<EOF
format=chatty-backup-v1
created_at=$TIMESTAMP
database_sha256=$(sha256_file "$DATABASE_DUMP")
uploads_sha256=$(sha256_file "$UPLOADS_ARCHIVE")
EOF

COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGING_DIR" -czf "$BUNDLE" manifest database.dump uploads.tar
age --encrypt --recipient "$RECIPIENT" --output "$TEMP_PATH" "$BUNDLE"
mv "$TEMP_PATH" "$FINAL_PATH"

if [ "$RETENTION_DAYS" -gt 0 ]; then
	find "$BACKUP_DIR" -maxdepth 1 -type f -name 'chatty-*.tar.gz.age' -mtime "+$RETENTION_DAYS" -delete
fi

echo "$FINAL_PATH"
