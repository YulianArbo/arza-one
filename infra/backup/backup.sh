#!/usr/bin/env bash
# Copias de seguridad de producción (B44, numeral 10.5). Las lanzan los temporizadores del
# servidor (infra/server/systemd) como el usuario «deploy»; también se pueden correr a mano.
#
#   backup.sh db-full     copia completa de la base (domingos)            → juego «pitr» (30 días)
#   backup.sh db-diff     copia diferencial de la base (lunes a sábado)    → juego «pitr»
#   backup.sh db-monthly  copia completa del mes (día 1)                   → juego «mensual» (12)
#   backup.sh db-annual   copia completa del año (1 de enero)              → juego «anual» (10)
#   backup.sh files       instantánea de Garage y copia incremental restic (30 diarias, 12 mensuales)
#   backup.sh status      lista las copias que hay en el depósito externo
#
# El archivo continuo de cambios (WAL) no pasa por aquí: PostgreSQL lo entrega a pgBackRest cada
# vez que cierra uno, y como máximo cada 5 minutos (archive_timeout). Al terminar, cada copia
# avisa a Uptime Kuma (BACKUP_PUSH_URL_DB o BACKUP_PUSH_URL_FILES): si una falla o deja de llegar
# por más de 26 horas, Uptime Kuma alerta por correo y mensajería (numeral 10.7).
set -euo pipefail

BASE_DIR="${ARZA_BASE_DIR:-/srv/arza-one}"
PROJECT="${ARZA_PROJECT:-arza-one-production}"
# Garage guarda unas pocas instantáneas de sus metadatos; restic se lleva la última.
KEPT_GARAGE_SNAPSHOTS=2

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

compose() {
  docker compose --project-name "$PROJECT" \
    --file "$BASE_DIR/current/infra/compose/production.yml" \
    --env-file "$BASE_DIR/.env" --env-file "$BASE_DIR/current/release.env" "$@"
}

# Lee una variable del archivo del servidor sin cargarlo entero en el entorno.
server_value() {
  sed -n "s/^$1=//p" "$BASE_DIR/.env" | tail -n 1
}

# Aviso a Uptime Kuma: «up» con el resumen o «down» con el motivo. Sin dirección, no avisa.
push() {
  local url="$1" status="$2" message="$3"
  [[ -n "$url" ]] || return 0
  curl --silent --show-error --fail --max-time 20 --retry 3 --get "$url" \
    --data-urlencode "status=$status" --data-urlencode "msg=$message" >/dev/null ||
    log "No se pudo avisar a Uptime Kuma."
}

# Deja constancia en el servidor y avisa. Se llama al final, salga bien o mal.
report() {
  local kind="$1" what="$2" status="$3" started="$4"
  local seconds=$(($(date +%s) - started))
  local url_name='BACKUP_PUSH_URL_DB'
  [[ "$kind" == files ]] && url_name='BACKUP_PUSH_URL_FILES'
  local result='correcta'
  [[ "$status" == 0 ]] || result='FALLIDA'
  mkdir -p "$BASE_DIR/backups"
  printf '{"at":"%s","what":"%s","result":"%s","seconds":%d}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$what" "$result" "$seconds" >>"$BASE_DIR/backups/copias.log"
  if [[ "$status" == 0 ]]; then
    push "$(server_value "$url_name")" up "Copia $what correcta en ${seconds} s"
  else
    push "$(server_value "$url_name")" down "Copia $what FALLIDA; revise $BASE_DIR/backups/copias.log"
  fi
  log "Copia $what $result (${seconds} s)."
}

pgbackrest() {
  compose exec -T --user postgres postgres arza-postgres pgbackrest "$@"
}

# Crea el registro de la base en cada juego la primera vez; después solo comprueba que coincide.
ensure_stanza() {
  pgbackrest stanza-create
}

db_backup() {
  local repo="$1" type="$2"
  ensure_stanza
  pgbackrest backup --repo="$repo" --type="$type"
}

# Instantánea consistente de los metadatos de Garage (base SQLite) y limpieza de las viejas.
garage_snapshot() {
  compose exec -T garage /garage meta snapshot
  compose run --rm --no-deps --entrypoint sh files-backup -c \
    "ls -1d /data/garage/meta/snapshots/*/ | sort | head -n -$KEPT_GARAGE_SNAPSHOTS | xargs -r rm -rf"
}

files_backup() {
  garage_snapshot
  # El repositorio se crea la primera vez (cifrado con BACKUP_PASSWORD).
  compose run --rm --no-deps files-backup cat config >/dev/null 2>&1 ||
    compose run --rm --no-deps files-backup init
  # Los datos y las instantáneas; la base viva de Garage no (puede estar a medio escribir).
  compose run --rm --no-deps files-backup backup /data/garage --host arza-one \
    --exclude /data/garage/meta/db.sqlite --exclude '/data/garage/meta/db.sqlite-*'
  compose run --rm --no-deps files-backup forget --host arza-one \
    --keep-daily 30 --keep-monthly 12 --prune
}

run() {
  local command="${1:-}"
  local started
  started=$(date +%s)
  local status=0
  case "$command" in
    db-full) db_backup 1 full || status=$? ;;
    db-diff) db_backup 1 diff || status=$? ;;
    db-monthly) db_backup 2 full || status=$? ;;
    db-annual) db_backup 3 full || status=$? ;;
    files) files_backup || status=$? ;;
    status)
      pgbackrest info
      compose run --rm --no-deps files-backup snapshots --host arza-one
      return 0
      ;;
    *)
      echo "Uso: backup.sh <db-full|db-diff|db-monthly|db-annual|files|status>" >&2
      return 2
      ;;
  esac
  local kind=db
  [[ "$command" == files ]] && kind=files
  report "$kind" "$command" "$status" "$started"
  return "$status"
}

run "$@"
