#!/usr/bin/env bash
# Revisa que el servidor de pruebas siga endurecido (B07, numeral 10.2). Solo lee: no cambia nada.
# Lo ejecuta provision.sh al final y se puede repetir cuando se quiera:
#   sudo bash verify.sh <usuario administrador>
# Termina con código 1 si algún control no se cumple.
set -uo pipefail

admin="${1:?Uso: sudo bash verify.sh <usuario administrador>}"
SSH_PORT=22
failures=0

check() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '  [ok]    %s\n' "$description"
  else
    printf '  [FALLA] %s\n' "$description"
    failures=$((failures + 1))
  fi
}

sshd_option() { sshd -T 2>/dev/null | grep -qix "$1"; }
# sshd -T escribe cada usuario de AllowUsers en su propia línea.
only_admin_and_deploy() {
  local configured expected
  configured="$(sshd -T 2>/dev/null | grep -i '^allowusers ' | awk '{print $2}' | sort | xargs)"
  expected="$(printf '%s\n' "$admin" deploy | sort | xargs)"
  [[ "$configured" == "$expected" ]]
}

# Puertos que aceptan conexiones desde fuera del servidor (sin contar 127.0.0.1 ni ::1).
public_ports() {
  ss -Htln | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1)' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un
}
only_allowed_ports() {
  local port
  for port in $(public_ports); do
    [[ "$port" == 80 || "$port" == 443 || "$port" == "$SSH_PORT" ]] || return 1
  done
}
# Reglas del cortafuegos: exactamente SSH, 80 y 443 (en IPv4 e IPv6).
firewall_rules() {
  ufw status | grep -E 'ALLOW|LIMIT' | awk '{print $1}' | sed 's/ (v6)//' | sort -u | tr '\n' ' '
}
firewall_only_allowed() { [[ "$(firewall_rules)" == "$SSH_PORT/tcp 443/tcp 80/tcp " ]]; }

echo "Revisión del servidor de pruebas:"
check "Cortafuegos activo y entrada denegada por defecto" bash -c "ufw status verbose | grep -q 'Status: active' && ufw status verbose | grep -q 'deny (incoming)'"
check "Cortafuegos: solo 80, 443 y SSH permitidos" firewall_only_allowed
check "Solo 80, 443 y SSH escuchan hacia fuera" only_allowed_ports
check "SSH: root no puede entrar" sshd_option 'permitrootlogin no'
check "SSH: sin contraseñas" sshd_option 'passwordauthentication no'
check "SSH: sin preguntas interactivas" sshd_option 'kbdinteractiveauthentication no'
check "SSH: solo $admin y deploy" only_admin_and_deploy
check "La cuenta root está bloqueada" bash -c "passwd -S root | grep -qE '^root (L|LK) '"
check "deploy no tiene sudo" bash -c "! id -nG deploy | grep -qw sudo"
check "fail2ban vigila SSH" bash -c "fail2ban-client status sshd"
check "Actualizaciones de seguridad automáticas" bash -c "systemctl is-enabled unattended-upgrades && grep -q 'Unattended-Upgrade \"1\"' /etc/apt/apt.conf.d/20auto-upgrades"
check "Reloj sincronizado por NTP y en UTC" bash -c "timedatectl show -p NTP --value | grep -qx yes && timedatectl show -p Timezone --value | grep -qx UTC"
check "Docker activo con registros rotados" bash -c "systemctl is-active docker && grep -q max-size /etc/docker/daemon.json"
check "Contraseñas del ambiente solo legibles por deploy" bash -c "[[ \$(stat -c '%a %U' /srv/arza-one/.env) == '600 deploy' ]]"

if [[ $failures -gt 0 ]]; then
  echo "Controles que no se cumplen: $failures. Revise docs/runbooks/servidor-de-pruebas.md."
  exit 1
fi
echo "Todos los controles se cumplen."
