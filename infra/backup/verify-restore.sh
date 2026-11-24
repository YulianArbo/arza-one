#!/usr/bin/env bash
# Comprobación después de restaurar (B44, numeral 10.5; registro FT-TEC-005). Solo lee.
#   1. La cadena de la auditoría de cada empresa está íntegra (nada se alteró ni se perdió).
#   2. El usuario de la API sigue aislado: sin empresa no ve ninguna; con una, solo la suya.
#   3. La API responde con base de datos, colas y archivos.
#   4. Las cifras básicas (empresas, personas, eventos de auditoría, archivos) para el registro.
# Termina con código 1 si algo no se cumple.
#
# Uso: verify-restore.sh   (en el servidor, como deploy)
set -euo pipefail

BASE_DIR="${ARZA_BASE_DIR:-/srv/arza-one}"
PROJECT="${ARZA_PROJECT:-arza-one-production}"
problems=0

compose() {
  docker compose --project-name "$PROJECT" \
    --file "$BASE_DIR/current/infra/compose/production.yml" \
    --env-file "$BASE_DIR/.env" --env-file "$BASE_DIR/current/release.env" "$@"
}

sql_as_owner() {
  compose exec -T postgres psql --username postgres --dbname arza_one --no-psqlrc \
    --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

sql_as_app() {
  compose exec -T postgres sh -c \
    'PGPASSWORD="$APP_DB_PASSWORD" psql --host 127.0.0.1 --username app_user --dbname arza_one --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$0"' \
    "$1"
}

check() {
  local name="$1" ok="$2" detail="$3"
  if [[ "$ok" == 1 ]]; then
    printf '  [ok]    %s (%s)\n' "$name" "$detail"
  else
    printf '  [FALLA] %s (%s)\n' "$name" "$detail"
    problems=$((problems + 1))
  fi
}

echo "Comprobación de la restauración — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

tenants="$(sql_as_owner 'SELECT id FROM aud_tenant_ids()')"
for tenant in $tenants; do
  result="$(sql_as_owner "SELECT set_config('app.tenant_id', '$tenant', false); SELECT checked || ' ' || coalesce(problem, 'íntegra') FROM aud_verify_chain();" | tail -n 1)"
  [[ "$result" == *íntegra ]] && ok=1 || ok=0
  check "Cadena de auditoría de la empresa $tenant" "$ok" "$result eventos"
done

first="$(head -n 1 <<<"$tenants")"
isolation="$(sql_as_app "SELECT 'none=' || count(*) FROM core_tenants; SELECT set_config('app.tenant_id', '$first', false); SELECT 'own=' || count(*) FROM core_tenants;" | tr '\n' ' ')"
[[ "$isolation" == *none=0*own=1* ]] && ok=1 || ok=0
check 'Aislamiento entre empresas del usuario de la API' "$ok" "$isolation"

health="$(compose exec -T api node -e "fetch('http://127.0.0.1:4000/health').then(async (r) => console.log(r.status, JSON.stringify(await r.json())))" 2>&1 || true)"
[[ "$health" == 200* ]] && ok=1 || ok=0
check 'La API responde con base de datos, colas y archivos' "$ok" "$health"

figures="$(sql_as_owner "SELECT 'empresas=' || (SELECT count(*) FROM core_tenants) || ' personas=' || (SELECT count(*) FROM iam_users) || ' auditoría=' || (SELECT count(*) FROM aud_events) || ' archivos=' || (SELECT count(*) FROM doc_files)")"
check 'Cifras de la base restaurada' 1 "$figures"

if [[ "$problems" -gt 0 ]]; then
  echo "Restauración NO verificada: $problems comprobación(es) fallaron."
  exit 1
fi
echo 'Restauración verificada.'
