#!/usr/bin/env bash
# Construye una imagen de ARZA ONE igual en la integración continua (verificación 8), en el ensayo
# de despliegue y en el despliegue a pruebas (B07).
#
# Uso: bash infra/scripts/ci/build-image.sh <api|web|worker|migrate|postgres> <etiqueta> [plataforma]
# La imagen de migraciones es la etapa «migrate» del Dockerfile de la API. La de PostgreSQL con
# pgBackRest (B44) solo la usa producción.
set -euo pipefail

app="${1:?Indique la imagen: api, web, worker, migrate o postgres}"
tag="${2:?Indique la etiqueta (por ejemplo arza-one/api:ci)}"
platform="${3:-linux/amd64}"

case "$app" in
  api | web | worker) args=(--file "apps/$app/Dockerfile") ;;
  migrate) args=(--file apps/api/Dockerfile --target migrate) ;;
  postgres) args=(--file infra/postgres/Dockerfile) ;;
  *) echo "Imagen desconocida: $app" >&2; exit 1 ;;
esac

docker build "${args[@]}" --platform "$platform" --tag "$tag" "$(git rev-parse --show-toplevel)"
