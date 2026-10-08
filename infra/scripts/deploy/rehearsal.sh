#!/usr/bin/env bash
# Ensayo del despliegue y de la reversión automática (B07). Corre en GitHub Actions en cada cambio
# (tarea 11) y en cualquier equipo Linux con Docker. Usa este mismo equipo como «servidor»:
#
#  1. Construye las cuatro imágenes y las publica en un registro local desechable.
#  2. Prepara la carpeta del servidor con generate-env.sh, igual que provision.sh.
#  3. Despliega la versión buena: debe quedar publicada y pasar las pruebas de humo.
#  4. Revisa que solo los puertos 80 y 443 respondan.
#  5. Despliega una versión dañada (su API dice que la base de datos no responde): el despliegue
#     debe fallar y volver solo a la versión buena, que debe seguir respondiendo.
#
# Uso: bash infra/scripts/deploy/rehearsal.sh   (necesita sudo para registrar el dominio local)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REGISTRY_IMAGE='registry:3@sha256:ddf754342cfc8acc51a56d5d0ab6af06826461864460636d8bd5c546dab2a7b8'
REGISTRY=localhost:5000
DOMAIN=pruebas.arza.test
BASE_DIR="${REHEARSAL_DIR:-${RUNNER_TEMP:-/tmp}/arza-one-servidor}"
GOOD="$(git rev-parse HEAD)"
BAD="bad${GOOD:3}"
COMPOSE=(docker compose --project-name arza-one-staging)

step() { printf '\n==> %s\n' "$*"; }
fail() { echo "ENSAYO FALLIDO: $*" >&2; exit 1; }

compose_current() {
  "${COMPOSE[@]}" --file "$BASE_DIR/current/infra/compose/staging.yml" \
    --env-file "$BASE_DIR/.env" --env-file "$BASE_DIR/current/release.env" "$@"
}

clean_up() {
  local status=$?
  if [[ $status -ne 0 && -L "$BASE_DIR/current" ]]; then
    step "Registros de los servicios (para encontrar la falla)"
    compose_current ps --all || true
    compose_current logs --tail 80 || true
  fi
  if [[ "${REHEARSAL_KEEP:-0}" != 1 ]]; then
    [[ -L "$BASE_DIR/current" ]] && compose_current down --volumes --remove-orphans >/dev/null 2>&1
    docker rm --force arza-rehearsal-registry >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap clean_up EXIT

deploy() {
  APP_VERSION="$1" STAGING_TARGET=local STAGING_TRUST_LOCAL_CA=1 STAGING_BASE_DIR="$BASE_DIR" \
    STAGING_DOMAIN="$DOMAIN" STAGING_AUTH_USER=revisor STAGING_AUTH_PASSWORD="$password" \
    IMAGE_REGISTRY="$REGISTRY" node "$REPO_ROOT/infra/scripts/deploy/deploy-main.ts"
}

step "1. Imágenes de la versión buena ($GOOD) en un registro local"
docker run --detach --name arza-rehearsal-registry --publish "127.0.0.1:5000:5000" \
  "$REGISTRY_IMAGE" >/dev/null
for app in api web worker migrate; do
  bash "$REPO_ROOT/infra/scripts/ci/build-image.sh" "$app" "$REGISTRY/arza-one-$app:$GOOD"
  docker push --quiet "$REGISTRY/arza-one-$app:$GOOD"
done

step "Versión dañada ($BAD): su API arranca, pero dice que la base de datos no responde"
for app in web worker migrate; do
  docker tag "$REGISTRY/arza-one-$app:$GOOD" "$REGISTRY/arza-one-$app:$BAD"
  docker push --quiet "$REGISTRY/arza-one-$app:$BAD"
done
docker build --quiet --tag "$REGISTRY/arza-one-api:$BAD" - <<EOF
FROM $REGISTRY/arza-one-api:$GOOD
CMD ["node", "-e", "require('node:http').createServer((req, res) => { const version = req.url === '/version'; res.writeHead(version ? 200 : 503, { 'content-type': 'application/json' }); res.end(JSON.stringify(version ? { version: '0.1.0', environment: 'staging', commit: process.env.GIT_COMMIT } : { status: 'degraded' })); }).listen(4000)"]
EOF
docker push --quiet "$REGISTRY/arza-one-api:$BAD"

step "2. Carpeta del servidor y contraseñas generadas allí ($BASE_DIR)"
rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR"
credentials="$(bash "$REPO_ROOT/infra/server/generate-env.sh" "$BASE_DIR/.env" "$DOMAIN" ci@arza.test)"
password="$(sed -n 's/^  Contraseña: //p' <<<"$credentials")"
[[ -n "$password" ]] || fail "generate-env.sh no entregó la contraseña adicional."
[[ "${GITHUB_ACTIONS:-}" == true ]] && echo "::add-mask::$password"
# Sin dominio público: Caddy usa su autoridad local en lugar de Let's Encrypt. Sin antivirus.
sed -i 's/^CADDY_EXTRA_GLOBAL=$/CADDY_EXTRA_GLOBAL=local_certs/; s/^COMPOSE_PROFILES=.*$/COMPOSE_PROFILES=/' \
  "$BASE_DIR/.env"
grep -q "$DOMAIN" /etc/hosts || echo "127.0.0.1 $DOMAIN correo.$DOMAIN" | sudo tee -a /etc/hosts >/dev/null

step "3. Despliegue de la versión buena"
deploy "$GOOD" || fail "la versión buena no quedó publicada."

step "4. Puertos abiertos en el «servidor»"
node "$REPO_ROOT/infra/scripts/deploy/check-ports.ts" 127.0.0.1 ||
  fail "hay puertos abiertos además de 80 y 443."

step "5. Despliegue de la versión dañada: debe volver sola a la buena"
if deploy "$BAD"; then fail "la versión dañada quedó publicada."; fi

[[ "$(basename "$(readlink "$BASE_DIR/current")")" == "$GOOD" ]] ||
  fail "el enlace current no volvió a la versión buena."
tail -n 1 "$BASE_DIR/deployments.log" | grep -q '"result":"rolled_back"' ||
  fail "la bitácora no registró la reversión."
compgen -G "$BASE_DIR/backups/*.dump" >/dev/null ||
  fail "no se copió la base de datos antes de migrar."
root_ca="$(mktemp)"
compose_current exec -T caddy cat /data/caddy/pki/authorities/local/root.crt >"$root_ca"
curl --fail --silent --show-error --cacert "$root_ca" --user "revisor:$password" \
  "https://$DOMAIN/api/version" | grep -q "\"commit\":\"$GOOD\"" ||
  fail "la versión buena no responde después de la reversión."

step "Ensayo superado: la versión buena se publicó y la dañada se revirtió sola."
