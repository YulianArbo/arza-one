#!/usr/bin/env bash
# Restauración de producción desde las copias externas (B44, numeral 10.5). Guía paso a paso:
# docs/runbooks/restauracion.md. Detiene la aplicación, restaura y la vuelve a encender.
#
#   restore.sh db [aaaa-mm-dd hh:mm:ss]   la base, a lo último que haya o a ese minuto (UTC)
#   restore.sh files                      los archivos (Garage) de la última copia diaria
#   restore.sh all [aaaa-mm-dd hh:mm:ss]  ambas cosas: pérdida total del servidor
#
# Requisitos: la versión desplegada (enlace current) y el archivo .env ORIGINAL del servidor,
# recuperado del gestor de contraseñas (las contraseñas de la base y la llave de Garage viven
# dentro de la copia). Al terminar, compruebe con verify-restore.sh.
set -euo pipefail

BASE_DIR="${ARZA_BASE_DIR:-/srv/arza-one}"
PROJECT="${ARZA_PROJECT:-arza-one-production}"
APP_SERVICES=(caddy web api worker)
TIME_FORMAT='^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}(:[0-9]{2})?$'

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

compose() {
  docker compose --project-name "$PROJECT" \
    --file "$BASE_DIR/current/infra/compose/production.yml" \
    --env-file "$BASE_DIR/.env" --env-file "$BASE_DIR/current/release.env" "$@"
}

restore_db() {
  local target="${1:-}"
  local args=(--delta restore)
  if [[ -n "$target" ]]; then
    [[ "$target" =~ $TIME_FORMAT ]] || { echo "Fecha no válida: $target" >&2; return 2; }
    args+=(--type=time "--target=$target+00" --target-action=promote)
  fi
  log "Base de datos: deteniendo PostgreSQL y restaurando ${target:-lo último que haya}."
  compose stop postgres
  compose run --rm --no-deps --user postgres --entrypoint pgbackrest postgres "${args[@]}"
  compose up --detach --wait --wait-timeout 1800 postgres
  log "Base de datos restaurada."
}

# restic deja los datos y las instantáneas; la base de Garage sale de la instantánea más nueva.
restore_files() {
  log "Archivos: deteniendo Garage y restaurando la última copia."
  compose stop garage
  compose run --rm --no-deps files-backup restore latest --host arza-one --target / \
    --include /data/garage --delete
  compose run --rm --no-deps --entrypoint sh files-backup -c '
    set -e
    latest="$(ls -1d /data/garage/meta/snapshots/*/ | sort | tail -n 1)"
    [ -n "$latest" ] || { echo "La copia no trae instantánea de Garage." >&2; exit 1; }
    rm -f /data/garage/meta/db.sqlite /data/garage/meta/db.sqlite-wal /data/garage/meta/db.sqlite-shm
    cp "${latest}db.sqlite" /data/garage/meta/db.sqlite
    chown -R 1000:1000 /data/garage'
  compose up --detach --wait --wait-timeout 600 garage
  log "Archivos restaurados."
}

main() {
  local what="${1:-}"
  case "$what" in
    db | files | all) ;;
    *)
      echo "Uso: restore.sh <db|files|all> [aaaa-mm-dd hh:mm:ss]" >&2
      return 2
      ;;
  esac
  local started
  started=$(date +%s)
  log "Deteniendo la aplicación: nadie debe escribir mientras se restaura."
  compose stop "${APP_SERVICES[@]}"
  [[ "$what" == files ]] || restore_db "${2:-}"
  [[ "$what" == db ]] || restore_files
  compose up --detach --wait --wait-timeout 600 "${APP_SERVICES[@]}"
  log "Restauración terminada en $(($(date +%s) - started)) s. Compruebe con verify-restore.sh."
}

main "$@"
