#!/usr/bin/env bash
# Vigilancia del procesador, la memoria y el disco del servidor (B44, numeral 10.7). La lanza un
# temporizador cada minuto (infra/server/systemd). Umbrales:
#   - procesador o memoria al 80 % o más durante 15 minutos seguidos;
#   - disco al 75 % o más (de inmediato).
# Avisa a Uptime Kuma (HOST_PUSH_URL): «up» si todo está bien, «down» con el motivo si no. Si deja
# de avisar (el servidor se cayó), Uptime Kuma también alerta.
#
# Uso: host-metrics.sh            (en el servidor, como deploy)
#      host-metrics.sh --evaluate <archivo de muestras> <disco %>   (solo para las pruebas)
set -euo pipefail

BASE_DIR="${ARZA_BASE_DIR:-/srv/arza-one}"
SAMPLES_FILE="$BASE_DIR/monitoring/host-samples.log"
SUSTAINED_MINUTES=15
CPU_MEMORY_LIMIT=80
DISK_LIMIT=75

# Uso del procesador en % entre dos lecturas de /proc/stat separadas un segundo.
cpu_percent() {
  local -a first second
  read -r -a first < <(grep '^cpu ' /proc/stat)
  sleep 1
  read -r -a second < <(grep '^cpu ' /proc/stat)
  local idle=$((second[4] + second[5] - first[4] - first[5]))
  local total=0 index
  for index in 1 2 3 4 5 6 7 8; do total=$((total + second[index] - first[index])); done
  ((total > 0)) || { echo 0; return; }
  echo $(((100 * (total - idle)) / total))
}

memory_percent() {
  awk '/^MemTotal:/ { total = $2 } /^MemAvailable:/ { free = $2 }
       END { printf "%d\n", 100 * (total - free) / total }' /proc/meminfo
}

disk_percent() {
  df --output=pcent / | tail -n 1 | tr -dc '0-9'
}

# Decide con las últimas muestras («cpu memoria» por línea) y el disco. Imprime «up|motivo» o
# «down|motivo».
evaluate() {
  local samples="$1" disk="$2"
  local recent count cpu_high memory_high
  recent="$(tail -n "$SUSTAINED_MINUTES" "$samples")"
  count="$(grep -c . <<<"$recent" || true)"
  cpu_high="$(awk -v limit="$CPU_MEMORY_LIMIT" '$1 >= limit' <<<"$recent" | grep -c . || true)"
  memory_high="$(awk -v limit="$CPU_MEMORY_LIMIT" '$2 >= limit' <<<"$recent" | grep -c . || true)"
  local last
  last="$(tail -n 1 <<<"$recent")"
  local reasons=()
  ((disk >= DISK_LIMIT)) && reasons+=("disco al ${disk} %")
  if ((count >= SUSTAINED_MINUTES)); then
    ((cpu_high >= SUSTAINED_MINUTES)) && reasons+=("procesador sobre ${CPU_MEMORY_LIMIT} % por ${SUSTAINED_MINUTES} min")
    ((memory_high >= SUSTAINED_MINUTES)) && reasons+=("memoria sobre ${CPU_MEMORY_LIMIT} % por ${SUSTAINED_MINUTES} min")
  fi
  if ((${#reasons[@]} > 0)); then
    local joined
    joined="$(printf '%s; ' "${reasons[@]}")"
    echo "down|${joined%; }"
  else
    read -r cpu memory <<<"$last"
    echo "up|procesador ${cpu:-?} %, memoria ${memory:-?} %, disco ${disk} %"
  fi
}

push() {
  local url status message
  url="$(sed -n 's/^HOST_PUSH_URL=//p' "$BASE_DIR/.env" | tail -n 1)"
  status="$1" message="$2"
  [[ -n "$url" ]] || return 0
  curl --silent --fail --max-time 20 --get "$url" \
    --data-urlencode "status=$status" --data-urlencode "msg=$message" >/dev/null || true
}

main() {
  if [[ "${1:-}" == --evaluate ]]; then
    evaluate "$2" "$3"
    return
  fi
  mkdir -p "$(dirname "$SAMPLES_FILE")"
  echo "$(cpu_percent) $(memory_percent)" >>"$SAMPLES_FILE"
  # Solo se guardan las últimas muestras que hacen falta.
  tail -n "$SUSTAINED_MINUTES" "$SAMPLES_FILE" >"$SAMPLES_FILE.tmp" && mv "$SAMPLES_FILE.tmp" "$SAMPLES_FILE"
  local result
  result="$(evaluate "$SAMPLES_FILE" "$(disk_percent)")"
  push "${result%%|*}" "${result#*|}"
}

main "$@"
