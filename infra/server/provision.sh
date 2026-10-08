#!/usr/bin/env bash
# Prepara y endurece un servidor Ubuntu Server 24.04 LTS nuevo para el ambiente de pruebas
# (B07, numeral 10.2). Se ejecuta una sola vez, como root, desde la carpeta infra/server:
#
#   sudo bash provision.sh --admin <usuario> --admin-key "<llave pública>" \
#     --deploy-key "<llave pública del despliegue>" --domain <dominio> --email <correo>
#
# Deja: un usuario nominal con sudo y otro «deploy» solo para el despliegue, SSH solo con llave y
# sin root, fail2ban, cortafuegos con 80, 443 y SSH, actualizaciones de seguridad automáticas con
# reinicio semanal, reloj por NTP en UTC, Docker con registros rotados y la carpeta /srv/arza-one
# con sus contraseñas. Se puede repetir: cada paso revisa si ya está hecho.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR=/srv/arza-one
DEPLOY_USER=deploy
SSH_PORT=22

admin="" admin_key="" deploy_key="" domain="" email=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin) admin="$2"; shift 2 ;;
    --admin-key) admin_key="$2"; shift 2 ;;
    --deploy-key) deploy_key="$2"; shift 2 ;;
    --domain) domain="$2"; shift 2 ;;
    --email) email="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }
trap 'echo "ERROR en la línea $LINENO: $BASH_COMMAND" >&2' ERR
step() { printf '\n==> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || fail "Ejecute con sudo (como root)."
[[ -n "$admin" && -n "$admin_key" && -n "$deploy_key" && -n "$domain" && -n "$email" ]] ||
  fail "Faltan opciones. Vea el encabezado de este guion o docs/runbooks/servidor-de-pruebas.md."
[[ "$admin" =~ ^[a-z][a-z0-9_-]{1,30}$ && "$admin" != root && "$admin" != "$DEPLOY_USER" ]] ||
  fail "Usuario administrador no válido (minúsculas; no puede ser root ni deploy)."
for key in "$admin_key" "$deploy_key"; do
  [[ "$key" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)\ [A-Za-z0-9+/=]+ ]] ||
    fail "Una de las llaves no parece una llave pública SSH (ssh-ed25519 AAAA…)."
done
# shellcheck disable=SC1091 # Archivo del sistema operativo.
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || fail "Se esperaba Ubuntu 24.04 (encontrado: $PRETTY_NAME)."

export DEBIAN_FRONTEND=noninteractive

step "Actualizaciones del sistema y paquetes de seguridad"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq openssh-server ufw fail2ban python3-systemd unattended-upgrades ca-certificates curl \
  gnupg openssl

step "Reloj por NTP y zona horaria UTC (numeral 10.2)"
timedatectl set-timezone UTC
timedatectl set-ntp true

step "Usuarios: $admin (administrador con sudo) y $DEPLOY_USER (solo despliegues)"
add_user() {
  local user="$1" key="$2" options="$3"
  id "$user" >/dev/null 2>&1 || adduser --disabled-password --gecos '' "$user"
  install -d -m 700 -o "$user" -g "$user" "/home/$user/.ssh"
  printf '%s%s\n' "$options" "$key" > "/home/$user/.ssh/authorized_keys"
  chown "$user:$user" "/home/$user/.ssh/authorized_keys"
  chmod 600 "/home/$user/.ssh/authorized_keys"
}
add_user "$admin" "$admin_key" ""
usermod -aG sudo "$admin"
# El administrador entra solo con llave: sudo sin contraseña (no tiene contraseña).
echo "$admin ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$admin"
chmod 440 "/etc/sudoers.d/90-$admin"
visudo -cqf "/etc/sudoers.d/90-$admin"
# deploy: sin sudo, sin terminal interactiva ni reenvío de puertos (restrict). Usa Docker.
add_user "$DEPLOY_USER" "$deploy_key" "restrict "
passwd -l root >/dev/null

step "SSH solo con llave, sin root ni contraseñas (numeral 10.2)"
cat > /etc/ssh/sshd_config.d/10-arza-one.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $admin $DEPLOY_USER
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
EOF
# Algunas imágenes de proveedores traen un archivo que permite contraseñas: se desactiva.
for file in /etc/ssh/sshd_config.d/*.conf; do
  [[ "$file" == */10-arza-one.conf ]] && continue
  if grep -qiE '^\s*PasswordAuthentication\s+yes' "$file"; then mv "$file" "$file.disabled"; fi
done
# Con SSH por socket (Ubuntu 24.04) esta carpeta no existe hasta la primera conexión.
install -d -m 755 /run/sshd
sshd -t
# En Ubuntu 24.04 SSH arranca por socket: cada conexión nueva ya lee esta configuración.
systemctl try-reload-or-restart ssh

step "fail2ban: bloquea por una hora a quien falle 5 veces en 10 minutos"
cat > /etc/fail2ban/jail.d/arza-one.local <<EOF
[sshd]
enabled = true
port = $SSH_PORT
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

step "Cortafuegos: solo 80, 443 y SSH (numeral 10.2)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit "$SSH_PORT/tcp" comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Caddy)'
ufw allow 443/tcp comment 'HTTPS (Caddy)'
ufw --force enable

step "Actualizaciones de seguridad automáticas y reinicio programado (capítulo 22)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# Si una actualización lo requiere, reinicia a las 9:00 UTC (4:00 a. m. en Bogotá).
cat > /etc/apt/apt.conf.d/52arza-one-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "09:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades

step "Docker desde su repositorio oficial"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
# Registros rotados (no llenan el disco) y contenedores vivos durante una actualización de Docker.
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true
}
EOF
systemctl enable docker
systemctl restart docker
# El grupo docker equivale a administrador de los contenedores: solo deploy lo tiene.
usermod -aG docker "$DEPLOY_USER"

step "Carpeta del ambiente de pruebas y contraseñas ($BASE_DIR)"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE_DIR" "$BASE_DIR/releases" "$BASE_DIR/backups"
if [[ -e "$BASE_DIR/.env" ]]; then
  echo "Ya existe $BASE_DIR/.env: se conserva."
else
  bash "$SCRIPT_DIR/generate-env.sh" "$BASE_DIR/.env" "$domain" "$email"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$BASE_DIR/.env"
fi

step "Revisión final"
bash "$SCRIPT_DIR/verify.sh" "$admin"

cat <<EOF

Servidor listo. Antes de cerrar esta sesión, abra OTRA terminal y confirme que entra con:
  ssh $admin@<dirección del servidor>
(root ya no puede entrar por SSH).

Huella del servidor para GitHub (secreto STAGING_SSH_KNOWN_HOSTS):
$(for key in /etc/ssh/ssh_host_*_key.pub; do printf '<dirección del servidor> %s\n' "$(cut -d' ' -f1,2 "$key")"; done)

Siga con docs/runbooks/servidor-de-pruebas.md, paso «Conectar GitHub».
EOF
