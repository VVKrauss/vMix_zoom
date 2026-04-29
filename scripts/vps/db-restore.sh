#!/usr/bin/env bash
# Восстановление plain SQL дампа в контейнер Postgres официального Supabase docker compose.
# Запускать на VPS из каталога $SUPABASE_DOCKER_DIR (где docker-compose.yml).
#
# Usage: ./db-restore.sh /absolute/or/relative/path/to/dump.sql
set -euo pipefail

DUMP_LOCAL="${1:?Usage: $0 <path-to-dump.sql>}"
SUPABASE_DOCKER_DIR="${SUPABASE_DOCKER_DIR:-.}"
DB_SERVICE="${DB_SERVICE:-db}"
DUMP_IN_CONTAINER="/tmp/dump-restore.sql"

if [[ ! -f "$DUMP_LOCAL" ]]; then
  echo "File not found: $DUMP_LOCAL" >&2
  exit 1
fi

pushd "$SUPABASE_DOCKER_DIR" >/dev/null

CID="$(docker compose ps -q "$DB_SERVICE")"
if [[ -z "$CID" ]]; then
  echo "No running container for service '$DB_SERVICE'. Is compose up?" >&2
  exit 1
fi

echo "Using container $CID (service=$DB_SERVICE)"
docker cp "$DUMP_LOCAL" "$CID:$DUMP_IN_CONTAINER"
docker exec -i "$CID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$DUMP_IN_CONTAINER"

echo "Restore finished."
popd >/dev/null
