#!/usr/bin/env bash
# Crea el archivo de contraseñas del servidor de vigilancia (B44, ADR-026). Se ejecuta EN ESE
# SERVIDOR (lo llama provision.sh --role monitoring). Las contraseñas internas se generan aquí y
# no salen de él; el correo de las alertas y los avisos «push» se completan a mano siguiendo
# docs/runbooks/servidor-de-vigilancia.md.
#
# Uso: generate-env-monitoring.sh <archivo> <dominio raíz> <correo para Let's Encrypt>
set -euo pipefail

env_file="${1:?Uso: generate-env-monitoring.sh <archivo> <dominio> <correo>}"
domain="${2:?Falta el dominio raíz (por ejemplo arzatech.co)}"
email="${3:?Falta el correo para los avisos de los certificados}"

if [[ ! "$domain" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]]; then
  echo "Dominio no válido: use minúsculas, números, puntos y guiones." >&2
  exit 1
fi
if [[ -e "$env_file" ]]; then
  echo "Ya existe $env_file: no se reemplaza." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }

umask 077
cat > "$env_file" <<EOF
# Contraseñas del servidor de vigilancia de ARZA ONE. Generadas el $(date -u +%Y-%m-%dT%H:%M:%SZ).
MONITORING_DOMAIN=$domain
ACME_EMAIL=$email
CADDY_EXTRA_GLOBAL=
GLITCHTIP_SECRET_KEY=$(hex 32)
GLITCHTIP_DB_PASSWORD=$(hex 24)
GLITCHTIP_VALKEY_PASSWORD=$(hex 24)
# Remitente y servidor de correo de las alertas, por ejemplo:
#   ALERT_EMAIL_URL=smtp+tls://usuario:clave@smtp.proveedor.com:587
ALERT_FROM=
ALERT_EMAIL_URL=
# Aviso «push» de Uptime Kuma para el vencimiento del dominio.
DOMAIN_PUSH_URL=
EOF

echo "Archivo de contraseñas creado: $env_file"
echo "Complete ALERT_FROM y ALERT_EMAIL_URL y guarde una copia en el gestor de contraseñas."
