# Alta de un ambiente nuevo

Cómo levantar un ambiente más (por ejemplo un segundo servidor de pruebas, o un reemplazo de
producción) con lo que ya existe en el repositorio (capítulo 22; bloque B44). Todos los ambientes
se preparan con el **mismo guion** y se describen con un archivo de Docker Compose versionado
(ADR-017).

| Ambiente   | Guía                                                   | `provision.sh --role` | Archivo de servicios           | Despliegue                                     |
| ---------- | ------------------------------------------------------ | --------------------- | ------------------------------ | ---------------------------------------------- |
| Local      | [entorno-local.md](entorno-local.md)                   | —                     | `infra/compose/local.yml`      | `pnpm infra:up`                                |
| Pruebas    | [servidor-de-pruebas.md](servidor-de-pruebas.md)       | `staging`             | `infra/compose/staging.yml`    | Automático al integrar a `main`                |
| Producción | [servidor-de-produccion.md](servidor-de-produccion.md) | `production`          | `infra/compose/production.yml` | A mano, versión etiquetada, usuario autorizado |
| Vigilancia | [servidor-de-vigilancia.md](servidor-de-vigilancia.md) | `monitoring`          | `infra/compose/monitoring.yml` | A mano (`docker compose up`)                   |

## Pasos comunes

1. Contratar el servidor (Ubuntu Server 24.04 LTS) y apuntar el DNS
   ([proveedores-de-servidor-y-dominio.md](proveedores-de-servidor-y-dominio.md)).
2. Crear una llave SSH nueva para los despliegues de ese ambiente (nunca reutilizar la de otro).
3. `sudo bash provision.sh --role <ambiente> …` desde `infra/server` en el servidor: lo endurece
   (numeral 10.2) y crea sus contraseñas allí mismo.
4. Completar el `.env` del servidor y guardar una copia en el gestor de contraseñas.
5. En GitHub, crear el ambiente (`pruebas` o `produccion`) con sus secretos y variables.
6. Primer despliegue y revisión: `sudo bash /srv/arza-one/current/infra/server/verify.sh <usuario>`
   y, desde fuera, `node infra/scripts/deploy/check-ports.ts <dirección>` (solo 80, 443 y SSH).

Un ambiente con datos reales (otro de producción) necesita además su depósito de copias propio, sus
temporizadores (los instala `--role production`) y sus monitores en el servidor de vigilancia.
