#!/usr/bin/env bash
# Ensayo de producción: despliegue, copias y restauración completa (B44, numerales 10.5 y 10.6).
# Corre en GitHub Actions (tarea 13) y en cualquier equipo Linux con Docker. Este mismo equipo
# hace de servidor de producción:
#
#  1. Construye las cinco imágenes y las publica en un registro local desechable.
#  2. Prepara la carpeta del servidor con generate-env-production.sh. Las copias van a una carpeta
#     local (en el servidor real, a un depósito S3 de otro proveedor) y el sello de los PDF usa un
#     certificado desechable.
#  3. Despliega la versión con production-main.ts: copia previa, migraciones, semilla de la
#     plataforma (sin datos ficticios) y pruebas de humo de www, app, clientes y api.
#  4. Deja marcas: un archivo en Garage y, después de la copia completa, una tabla que solo
#     existe en el archivo continuo de cambios (prueba de que no se pierden los últimos minutos).
#  5. Corre todas las copias: completa, diferencial, mensual, anual y de archivos.
#  6. Simula la pérdida total: borra la base, los archivos y las colas.
#  7. Restaura con restore.sh all, comprueba con verify-restore.sh y las marcas, y mide el tiempo
#     contra el RTO de 4 horas (numeral 10.5).
#
# Uso: bash infra/backup/rehearsal.sh   (necesita sudo para registrar los dominios locales)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REGISTRY_IMAGE='registry:3@sha256:ddf754342cfc8acc51a56d5d0ab6af06826461864460636d8bd5c546dab2a7b8'
REGISTRY=localhost:5000
DOMAIN=arza.test
VERSION=v0.44.0
RTO_SECONDS=14400
BASE_DIR="${REHEARSAL_DIR:-${RUNNER_TEMP:-/tmp}/arza-one-produccion}"
PROJECT=arza-one-production
export ARZA_BASE_DIR="$BASE_DIR" ARZA_PROJECT="$PROJECT"

step() { printf '\n==> %s\n' "$*"; }
fail() { echo "ENSAYO FALLIDO: $*" >&2; exit 1; }

compose() {
  docker compose --project-name "$PROJECT" \
    --file "$BASE_DIR/current/infra/compose/production.yml" \
    --env-file "$BASE_DIR/.env" --env-file "$BASE_DIR/current/release.env" "$@"
}

sql() {
  compose exec -T postgres psql --username postgres --dbname arza_one --no-psqlrc \
    --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

# Lee o escribe la marca de Garage con el cliente S3 que ya trae la imagen de la API.
garage_marker() {
  local action="$1" value="${2:-}"
  compose exec -T -e MARK_ACTION="$action" -e MARK_VALUE="$value" api node --input-type=module -e "
    import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
    const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
      forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY } });
    const key = { Bucket: process.env.S3_BUCKET, Key: 'ensayo/marca.txt' };
    if (process.env.MARK_ACTION === 'put') {
      await client.send(new PutObjectCommand({ ...key, Body: process.env.MARK_VALUE }));
    } else {
      const object = await client.send(new GetObjectCommand(key));
      process.stdout.write(await object.Body.transformToString());
    }"
}

clean_up() {
  local status=$?
  if [[ $status -ne 0 && -L "$BASE_DIR/current" ]]; then
    step "Registros de los servicios (para encontrar la falla)"
    compose ps --all || true
    compose logs --tail 80 || true
  fi
  if [[ "${REHEARSAL_KEEP:-0}" != 1 ]]; then
    [[ -L "$BASE_DIR/current" ]] && compose down --volumes --remove-orphans >/dev/null 2>&1
    docker rm --force arza-rehearsal-registry >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap clean_up EXIT

step "1. Imágenes de $VERSION en un registro local"
docker run --detach --name arza-rehearsal-registry --publish "127.0.0.1:5000:5000" \
  "$REGISTRY_IMAGE" >/dev/null
for app in api web worker migrate postgres; do
  bash "$REPO_ROOT/infra/scripts/ci/build-image.sh" "$app" "$REGISTRY/arza-one-$app:$VERSION"
  docker push --quiet "$REGISTRY/arza-one-$app:$VERSION"
done

step "2. Carpeta del servidor y contraseñas generadas allí ($BASE_DIR)"
rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR"
bash "$REPO_ROOT/infra/server/generate-env-production.sh" "$BASE_DIR/.env" "$DOMAIN" ci@arza.test \
  >/dev/null
seal_dir="$(mktemp -d)"
seal_pass="$(openssl rand -hex 16)"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=Ensayo ARZA ONE' \
  -keyout "$seal_dir/key.pem" -out "$seal_dir/cert.pem" 2>/dev/null
openssl pkcs12 -export -inkey "$seal_dir/key.pem" -in "$seal_dir/cert.pem" \
  -passout "pass:$seal_pass" -out "$seal_dir/sello.p12"
{
  echo 'CADDY_EXTRA_GLOBAL=local_certs'
  echo 'COMPOSE_PROFILES='
  echo 'SMTP_HOST=127.0.0.1'
  echo "MAIL_FROM=ARZA ONE <no-responder@$DOMAIN>"
  echo "PDF_SEAL_PKCS12=$(base64 -w 0 "$seal_dir/sello.p12")"
  echo "PDF_SEAL_PASSPHRASE=$seal_pass"
  echo 'BACKUP_REPO_TYPE=posix'
  echo 'BACKUP_REPO_ROOT=/var/lib/pgbackrest/ensayo'
  echo 'FILES_BACKUP_REPOSITORY=/ensayo/archivos'
} >>"$BASE_DIR/.env"
rm -rf "$seal_dir"
hosts="$DOMAIN www.$DOMAIN app.$DOMAIN clientes.$DOMAIN api.$DOMAIN"
grep -q "api.$DOMAIN" /etc/hosts || echo "127.0.0.1 $hosts" | sudo tee -a /etc/hosts >/dev/null

step "3. Despliegue de $VERSION en «producción»"
echo '[]' >"$BASE_DIR/festivos.json"
APP_VERSION="$VERSION" PRODUCTION_TARGET=local PRODUCTION_TRUST_LOCAL_CA=1 \
  PRODUCTION_BASE_DIR="$BASE_DIR" PRODUCTION_DOMAIN="$DOMAIN" IMAGE_REGISTRY="$REGISTRY" \
  URGENT_SECURITY_FIX=1 node "$REPO_ROOT/infra/scripts/deploy/production-main.ts" \
  "$BASE_DIR/festivos.json" || fail "la versión no quedó publicada en producción."
sql "SELECT count(*) FROM core_tenants" | grep -qx 1 ||
  fail "producción debe tener solo la empresa de la plataforma (sin datos ficticios)."

step "4. Marca en los archivos"
marker="ensayo-$(openssl rand -hex 8)"
garage_marker put "$marker"

step "5. Todas las copias"
for kind in db-full db-diff db-monthly db-annual files; do
  bash "$REPO_ROOT/infra/backup/backup.sh" "$kind" || fail "la copia $kind falló."
done
# Un cambio posterior a las copias: solo puede volver si se reproduce el archivo de cambios.
sql "CREATE TABLE ensayo_ultimo_minuto AS SELECT '$marker'::text AS marca"
sql "SELECT pg_switch_wal()" >/dev/null
for _ in $(seq 1 30); do
  archived="$(sql "SELECT last_archived_wal IS NOT NULL AND last_archived_time > now() - interval '2 minutes' FROM pg_stat_archiver")"
  [[ "$archived" == t ]] && break
  sleep 2
done
[[ "$archived" == t ]] || fail "PostgreSQL no entregó el último archivo de cambios a pgBackRest."
bash "$REPO_ROOT/infra/backup/backup.sh" status

step "6. Pérdida total: se borran la base, los archivos y las colas"
compose down
for volume in postgres-data garage-data valkey-data restic-cache; do
  docker volume rm "${PROJECT}_$volume" >/dev/null
done

step "7. Restauración completa"
started=$(date +%s)
bash "$REPO_ROOT/infra/backup/restore.sh" all || fail "la restauración falló."
bash "$REPO_ROOT/infra/backup/verify-restore.sh" || fail "la restauración no pasó la comprobación."
[[ "$(garage_marker get)" == "$marker" ]] || fail "el archivo de Garage no volvió."
[[ "$(sql 'SELECT marca FROM ensayo_ultimo_minuto')" == "$marker" ]] ||
  fail "se perdió el cambio posterior a la copia (archivo continuo de cambios)."
seconds=$(($(date +%s) - started))
[[ "$seconds" -le "$RTO_SECONDS" ]] || fail "la restauración tardó $seconds s, más que el RTO."

summary="Restauración completa en $seconds s (RTO: $RTO_SECONDS s). Base al último cambio archivado, archivos de la última copia, cadena de auditoría íntegra y aislamiento verificado."
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && printf '### Ensayo de restauración (FT-TEC-005)\n\n%s\n' "$summary" >>"$GITHUB_STEP_SUMMARY"
step "Ensayo superado. $summary"
