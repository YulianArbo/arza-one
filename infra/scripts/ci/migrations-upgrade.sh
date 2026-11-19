#!/usr/bin/env bash
# Verificación 7 del numeral 11.4: las migraciones aplican sobre la versión anterior.
#
# 1. Crea un PostgreSQL 17 desechable con el mismo guion de usuarios que los ambientes reales.
# 2. Instala la versión anterior (rama base), aplica sus migraciones y carga sus datos ficticios.
# 3. Aplica encima las migraciones de este cambio, comprueba que la base coincide con el modelo
#    y vuelve a cargar los datos ficticios con el código nuevo.
#
# Uso: bash infra/scripts/ci/migrations-upgrade.sh <rama-o-commit-base>
# Requiere Docker y que este repositorio ya tenga las dependencias instaladas y compiladas.
set -euo pipefail

BASE_REF="${1:?Indique la rama o el commit de la versión anterior (por ejemplo origin/main)}"
POSTGRES_IMAGE='postgres:17@sha256:0d938e975177bef9f1f61f3f9dbcf2e0aa0a139568f66d3415ed8892eb97f6ac'
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORK_DIR="$(mktemp -d)"
BASE_DIR="${WORK_DIR}/base"
CONTAINER="arza-migrations-$$"
PORT="${MIGRATIONS_DB_PORT:-5434}"

# Contraseñas desechables, distintas en cada ejecución; nunca se escriben en el repositorio.
POSTGRES_PASSWORD="$(openssl rand -hex 18)"
APP_DB_PASSWORD="$(openssl rand -hex 18)"
MIGRATION_DB_PASSWORD="$(openssl rand -hex 18)"
export POSTGRES_PASSWORD APP_DB_PASSWORD MIGRATION_DB_PASSWORD

cleanup() {
  docker rm --force "${CONTAINER}" >/dev/null 2>&1 || true
  git -C "${REPO_ROOT}" worktree remove --force "${BASE_DIR}" >/dev/null 2>&1 || true
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$1"; }

start_database() {
  step "PostgreSQL 17 desechable en el puerto ${PORT}"
  docker run --detach --name "${CONTAINER}" --publish "127.0.0.1:${PORT}:5432" \
    --env POSTGRES_PASSWORD --env APP_DB_PASSWORD --env MIGRATION_DB_PASSWORD \
    --volume "${REPO_ROOT}/infra/postgres/init:/docker-entrypoint-initdb.d:ro" \
    "${POSTGRES_IMAGE}" >/dev/null
  # Durante la preparación PostgreSQL solo escucha por socket; por TCP responde ya listo.
  for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" pg_isready --host 127.0.0.1 --dbname arza_one >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  docker logs "${CONTAINER}"
  echo 'La base de datos no arrancó.' >&2
  return 1
}

export APP_ENV=local
export PRISMA_HIDE_UPDATE_MESSAGE=1
export DATABASE_URL="postgresql://app_user:${APP_DB_PASSWORD}@127.0.0.1:${PORT}/arza_one"
export DATABASE_MIGRATION_URL="postgresql://migration_user:${MIGRATION_DB_PASSWORD}@127.0.0.1:${PORT}/arza_one"

# Migraciones y datos ficticios de una copia del repositorio.
migrate_and_seed() {
  pnpm --dir "$1" --filter @arza/api db:migrate
  pnpm --dir "$1" --filter @arza/api db:seed:demo
}

start_database

step "Versión anterior (${BASE_REF}): instalar, migrar desde cero y cargar datos ficticios"
git -C "${REPO_ROOT}" worktree add --detach "${BASE_DIR}" "${BASE_REF}" >/dev/null
pnpm --dir "${BASE_DIR}" install --frozen-lockfile
pnpm --dir "${BASE_DIR}" exec turbo run build --filter=@arza/api
migrate_and_seed "${BASE_DIR}"

step 'Este cambio: aplicar las migraciones nuevas sobre la base con datos'
migrate_and_seed "${REPO_ROOT}"

step 'La base migrada coincide con el modelo de Prisma de este cambio'
pnpm --dir "${REPO_ROOT}/apps/api" exec prisma migrate status
pnpm --dir "${REPO_ROOT}/apps/api" exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code

step 'Migraciones compatibles: aplicaron sobre la versión anterior con sus datos'
