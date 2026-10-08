#!/usr/bin/env bash
# Ensayo de la preparación del servidor (B07). Solo en GitHub Actions (tarea 12): prepara la
# máquina desechable de GitHub, que es un Ubuntu 24.04 como el servidor, con provision.sh y
# comprueba desde fuera lo que debe y lo que no debe poder hacerse.
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == true ]] ||
  { echo "Solo en GitHub Actions: este ensayo cambia la configuración del equipo." >&2; exit 1; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
ADMIN=arzaadmin
KEYS="$(mktemp -d)"
fail() { echo "ENSAYO FALLIDO: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

ssh-keygen -q -t ed25519 -N '' -f "$KEYS/admin"
ssh-keygen -q -t ed25519 -N '' -f "$KEYS/deploy"
ssh_as() {
  local key="$1" user="$2"
  shift 2
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KEYS/known_hosts" \
    -o ConnectTimeout=10 -i "$KEYS/$key" "$user@127.0.0.1" "$@"
}

step "Preparación con provision.sh (incluye verify.sh al final)"
sudo bash "$REPO_ROOT/infra/server/provision.sh" --admin "$ADMIN" \
  --admin-key "$(cat "$KEYS/admin.pub")" --deploy-key "$(cat "$KEYS/deploy.pub")" \
  --domain pruebas.arza.test --email ci@arza.test

step "Lo permitido"
ssh_as admin "$ADMIN" 'sudo -n true' || fail "el administrador no entra con su llave o no tiene sudo."
ssh_as deploy deploy 'docker info --format "{{.ServerVersion}}"' >/dev/null ||
  fail "deploy no entra con su llave o no puede usar Docker."

step "Lo denegado"
if ssh_as deploy deploy 'sudo -n true' 2>/dev/null; then fail "deploy tiene sudo."; fi
# Aunque root tenga una llave válida, SSH no lo deja entrar.
sudo install -d -m 700 /root/.ssh
sudo cp "$KEYS/admin.pub" /root/.ssh/authorized_keys
if ssh_as admin root true 2>/dev/null; then fail "root puede entrar por SSH."; fi
# El servidor solo ofrece llave pública: nunca contraseña.
methods="$(ssh -o BatchMode=yes -o PubkeyAuthentication=no -o UserKnownHostsFile="$KEYS/known_hosts" \
  "$ADMIN@127.0.0.1" true 2>&1 || true)"
grep -q 'Permission denied (publickey)' <<<"$methods" ||
  fail "SSH ofrece otro método además de la llave: $methods"
if ssh_as admin intruso true 2>/dev/null; then fail "un usuario no autorizado entró."; fi

step "Puertos que responden en la dirección de la red"
node "$REPO_ROOT/infra/scripts/deploy/check-ports.ts" "$(hostname -I | awk '{print $1}')" ||
  fail "hay puertos abiertos además de 80, 443 y SSH."
sudo bash "$REPO_ROOT/infra/server/verify.sh" "$ADMIN"

step "Ensayo superado: el servidor quedó endurecido según el numeral 10.2."
