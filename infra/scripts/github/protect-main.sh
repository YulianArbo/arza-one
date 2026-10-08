#!/usr/bin/env bash
# Protección de la rama principal (numeral 11.3, bloque B05). La ejecuta el dueño del repositorio,
# con GitHub CLI autenticado (`gh auth login`). Requiere GitHub Pro o un repositorio público.
#
# - Todo cambio entra por pull request; no se admiten cambios directos.
# - La tarea «Verificaciones» de ci.yml debe estar en verde y la rama al día con main.
# - Sin forzar cambios ni borrar main. La regla aplica también a los administradores.
# - Sin aprobación obligatoria de otra persona: el equipo es de una sola persona y GitHub no
#   permite aprobar el propio pull request.
#
# Uso: bash infra/scripts/github/protect-main.sh
set -euo pipefail

REPOSITORY="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

gh api --method PUT "repos/${REPOSITORY}/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Verificaciones"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Protección aplicada a main en ${REPOSITORY}."
