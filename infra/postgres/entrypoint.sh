#!/bin/sh
set -eu

if [ "${PGBACKREST_REPO1_TYPE:-}" = posix ]; then
  for repo in 1 2 3; do
    for option in BUCKET ENDPOINT REGION KEY KEY_SECRET; do
      unset "PGBACKREST_REPO${repo}_S3_${option}"
    done
  done
fi

exec docker-entrypoint.sh "$@"
