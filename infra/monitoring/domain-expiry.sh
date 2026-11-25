#!/usr/bin/env bash
# Vencimiento del dominio (B44, numeral 10.7: aviso 20 días antes). Los certificados TLS los
# vigila Uptime Kuma en cada monitor HTTP; el dominio lo consulta este guion una vez al día en el
# registro público RDAP y avisa a Uptime Kuma (DOMAIN_PUSH_URL): «down» si faltan 20 días o
# menos, o si no se pudo consultar (para revisarlo a mano).
#
# Uso: domain-expiry.sh                          (en el servidor de vigilancia)
#      domain-expiry.sh --evaluate <fecha ISO> <ahora ISO>   (solo para las pruebas)
set -euo pipefail

BASE_DIR="${ARZA_MONITORING_DIR:-/srv/arza-vigilancia}"
WARNING_DAYS=20

value() { sed -n "s/^$1=//p" "$BASE_DIR/.env" | tail -n 1; }

# Imprime «up|…» o «down|…» según los días que faltan.
evaluate() {
  local expires="$1" now="$2"
  local days=$((($(date -u -d "$expires" +%s) - $(date -u -d "$now" +%s)) / 86400))
  if ((days <= WARNING_DAYS)); then
    echo "down|el dominio vence en $days días ($(date -u -d "$expires" +%d/%m/%Y)): renuévelo"
  else
    echo "up|el dominio vence en $days días"
  fi
}

push() {
  local url
  url="$(value DOMAIN_PUSH_URL)"
  [[ -n "$url" ]] || return 0
  curl --silent --fail --max-time 20 --get "$url" \
    --data-urlencode "status=$1" --data-urlencode "msg=$2" >/dev/null || true
}

main() {
  if [[ "${1:-}" == --evaluate ]]; then
    evaluate "$2" "$3"
    return
  fi
  local domain expires result
  domain="$(value MONITORING_DOMAIN)"
  expires="$(curl --silent --fail --max-time 30 --location "https://rdap.org/domain/$domain" |
    python3 -c 'import json, sys
events = json.load(sys.stdin).get("events", [])
print(next((e["eventDate"] for e in events if e.get("eventAction") == "expiration"), ""))' ||
    true)"
  if [[ -z "$expires" ]]; then
    push down "No se pudo consultar el vencimiento de $domain; revíselo en el registrador"
    return
  fi
  result="$(evaluate "$expires" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  push "${result%%|*}" "${result#*|}"
}

main "$@"
