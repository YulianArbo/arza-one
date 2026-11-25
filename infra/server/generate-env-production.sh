#!/usr/bin/env bash
# Crea el archivo de contraseñas del servidor de producción (B44, numerales 10.2 y 10.5).
# Se ejecuta EN EL SERVIDOR (lo llama provision.sh --role production) y en el ensayo de GitHub.
# Las contraseñas internas se generan al azar aquí mismo y nunca salen del servidor. Dos se
# muestran una sola vez, para guardarlas en el gestor de contraseñas:
#   - BACKUP_PASSWORD: la llave de las copias. Sin ella no se puede restaurar nada; va además en
#     sobre sellado al Director General (numeral 10.5).
#   - MONITOR_TOKEN: la llave de los vigilantes para /ops/status (Uptime Kuma).
# Los datos que vienen de afuera (correo, certificado del sello, depósito de las copias, GlitchTip
# y los avisos de Uptime Kuma) quedan vacíos: se completan a mano siguiendo
# docs/runbooks/servidor-de-produccion.md.
#
# Uso: generate-env-production.sh <archivo> <dominio raíz> <correo para Let's Encrypt>
set -euo pipefail

env_file="${1:?Uso: generate-env-production.sh <archivo> <dominio> <correo>}"
domain="${2:?Falta el dominio raíz (por ejemplo arzatech.co)}"
email="${3:?Falta el correo para los avisos de los certificados}"

if [[ ! "$domain" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]]; then
  echo "Dominio no válido: use minúsculas, números, puntos y guiones." >&2
  exit 1
fi
if [[ -e "$env_file" ]]; then
  echo "Ya existe $env_file: no se reemplaza (las bases de datos y las copias usan esas llaves)." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }

backup_password="$(hex 32)"
monitor_token="$(hex 32)"

umask 077
cat > "$env_file" <<EOF
# Contraseñas del servidor de producción de ARZA ONE. Generadas el $(date -u +%Y-%m-%dT%H:%M:%SZ).
# No copie este archivo fuera del servidor. Las líneas vacías se completan con la guía
# docs/runbooks/servidor-de-produccion.md antes del primer despliegue.
PRODUCTION_DOMAIN=$domain
ACME_EMAIL=$email
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
MONITOR_TOKEN=$monitor_token
BACKUP_PASSWORD=$backup_password
COMPOSE_PROFILES=antivirus
# Empresa del sitio público (NIT sin dígito de verificación), para las PQRSF sin sesión.
PUBLIC_SITE_TAX_ID=
# Correo real (numeral 10.4).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
# Certificado de la empresa para sellar los PDF firmados (B43): archivo .p12 en base64 y su clave.
PDF_SEAL_PKCS12=
PDF_SEAL_PASSPHRASE=
# Depósito externo de las copias, de otro proveedor (numeral 10.5).
BACKUP_REPO_TYPE=s3
BACKUP_REPO_ROOT=
BACKUP_S3_BUCKET=
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGION=
BACKUP_S3_KEY=
BACKUP_S3_SECRET=
# restic: s3:https://<endpoint>/<depósito>/archivos
FILES_BACKUP_REPOSITORY=
# Errores de la API y del worker (GlitchTip del servidor de vigilancia).
GLITCHTIP_DSN=
# Avisos «push» de Uptime Kuma (cada uno es una dirección secreta).
BACKUP_PUSH_URL_DB=
BACKUP_PUSH_URL_FILES=
HOST_PUSH_URL=
EOF

echo "Archivo de contraseñas creado: $env_file"
echo
echo "Cuando lo complete, guarde una copia del archivo entero en el gestor de contraseñas: para"
echo "restaurar en un servidor nuevo hacen falta estas mismas contraseñas (las de la base de datos"
echo "y la llave de Garage viajan dentro de las copias)."
echo
echo "Guarde AHORA estas dos llaves en el gestor de contraseñas; no se vuelven a mostrar."
echo "La de las copias va además en sobre sellado al Director General (numeral 10.5)."
echo "  Llave de las copias (BACKUP_PASSWORD): $backup_password"
echo "  Llave de los vigilantes (MONITOR_TOKEN): $monitor_token"
