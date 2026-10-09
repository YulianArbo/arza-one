#!/usr/bin/env bash
# Crea el archivo de contraseñas del ambiente de pruebas (B07, numeral 10.2).
# Se ejecuta EN EL SERVIDOR (lo llama provision.sh) y en el ensayo de GitHub. Las contraseñas se
# generan al azar aquí mismo y nunca salen del servidor; solo la de la autenticación adicional se
# muestra una vez, para guardarla en el gestor de contraseñas y en GitHub.
#
# Uso: generate-env.sh <archivo> <dominio> <correo para Let's Encrypt> [usuario adicional]
set -euo pipefail

# Misma imagen que infra/compose/staging.yml (una prueba lo comprueba).
CADDY_IMAGE="caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f"

env_file="${1:?Uso: generate-env.sh <archivo> <dominio> <correo> [usuario]}"
domain="${2:?Falta el dominio (por ejemplo pruebas.arzatech.co)}"
email="${3:?Falta el correo para los avisos de los certificados}"
auth_user="${4:-revisor}"

if [[ ! "$domain" =~ ^[a-z0-9.-]+$ ]]; then
  echo "Dominio no válido: use minúsculas, números, puntos y guiones." >&2
  exit 1
fi
if [[ ! "$auth_user" =~ ^[a-z0-9_-]+$ ]]; then
  echo "Usuario no válido: use minúsculas, números, guion y guion bajo." >&2
  exit 1
fi
if [[ -e "$env_file" ]]; then
  echo "Ya existe $env_file: no se reemplaza (las bases de datos usan esas contraseñas)." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }

auth_password="$(hex 16)"
# bcrypt con la consola de Caddy, en un contenedor desechable sin red.
auth_hash="$(docker run --rm --network none "$CADDY_IMAGE" caddy hash-password --plaintext "$auth_password")"

umask 077
cat > "$env_file" <<EOF
# Contraseñas del ambiente de pruebas de ARZA ONE. Generadas el $(date -u +%Y-%m-%dT%H:%M:%SZ).
# No copie este archivo fuera del servidor. Si se pierde, se genera otro y se borran los datos.
STAGING_DOMAIN=$domain
ACME_EMAIL=$email
STAGING_AUTH_USER=$auth_user
STAGING_AUTH_HASH='$auth_hash'
CADDY_EXTRA_GLOBAL=
POSTGRES_PASSWORD=$(hex 24)
APP_DB_PASSWORD=$(hex 24)
MIGRATION_DB_PASSWORD=$(hex 24)
VALKEY_PASSWORD=$(hex 24)
S3_ACCESS_KEY=GK$(hex 12)
S3_SECRET_KEY=$(hex 32)
GARAGE_RPC_SECRET=$(hex 32)
GARAGE_ADMIN_TOKEN=$(hex 32)
CSRF_SECRET=$(hex 32)
FIELD_ENCRYPTION_KEY=$(hex 32)
COMPOSE_PROFILES=antivirus
EOF

echo "Archivo de contraseñas creado: $env_file"
echo
echo "Autenticación adicional del ambiente de pruebas (guárdela ahora; no se vuelve a mostrar):"
echo "  Usuario:    $auth_user"
echo "  Contraseña: $auth_password"
