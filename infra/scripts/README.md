# infra/scripts

Guiones de operación del repositorio. Node los ejecuta directamente (sin compilar), por eso solo
usan sintaxis de TypeScript que se puede borrar.

## local/ — entorno local (B06)

Guía de uso: [`docs/runbooks/entorno-local.md`](../../docs/runbooks/entorno-local.md).

| Guion                | Comando                                                         | Qué hace                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local/env-local.ts` | `pnpm env:local`                                                | Crea `.env` desde `.env.example`: cada `REEMPLAZAR` recibe un secreto al azar con el formato que exige su pieza (`env-file.ts`) y cada puerto ocupado, uno libre (`ports.ts`) |
| `local/infra.ts`     | `pnpm infra:up` · `infra:down` · `infra:reset` · `infra:status` | Enciende o apaga [`infra/compose/local.yml`](../compose/local.yml), prepara Garage (`garage-setup.ts`), migra y carga la semilla (`stack-commands.ts`)                        |
| `local/dev-watch.ts` | `pnpm dev` (API y worker)                                       | Compila, arranca el programa y lo reinicia al guardar un cambio                                                                                                               |

La lógica recibe los comandos externos (docker, pnpm) como una función, así que se prueba sin
Docker. `node-runner.ts` es la única conexión real con el sistema.

## ci/ — ayudantes de la integración continua (B05)

| Guion                                                | Verificación (numeral 11.4) | Qué hace                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node infra/scripts/ci/check-migrations.ts <base>`   | 7. Migraciones              | Compara las migraciones con la rama base. Falla si una migración ya integrada cambió o si una nueva borra, renombra o vuelve obligatorio algo que la versión anterior usa (numeral 10.6)       |
| `node infra/scripts/ci/check-vulnerabilities.ts <f>` | 6. Dependencias             | Lee el informe JSON de osv-scanner y falla solo con vulnerabilidades altas o críticas (CVSS 7 o más, o etiqueta HIGH/CRITICAL). Los avisos sin severidad se listan para revisión, sin bloquear |

### Fase de contraer

Borrar o renombrar algo es legítimo cuando la versión anterior ya no lo usa (expandir, migrar,
contraer). En ese caso, la migración declara el motivo en una línea:

```sql
-- arza:contract la columna notes dejó de usarse desde v1.4.0
ALTER TABLE "crm_leads" DROP COLUMN "notes";
```

La marca queda a la vista en la revisión del pull request. Desactivar la seguridad por fila
(`DISABLE` o `NO FORCE ROW LEVEL SECURITY`) nunca se permite, ni con la marca (ADR-007).

`ci/build-image.sh <api|web|worker|migrate> <etiqueta> [plataforma]` construye cada imagen igual en
la integración continua, el ensayo y el despliegue (B07).

## deploy/ — despliegue al ambiente de pruebas (B07)

Guías: [`docs/runbooks/despliegue-y-reversion.md`](../../docs/runbooks/despliegue-y-reversion.md) y
[`docs/runbooks/servidor-de-pruebas.md`](../../docs/runbooks/servidor-de-pruebas.md).

| Archivo                   | Qué hace                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `deploy/deploy-main.ts`   | Punto de entrada (`pnpm --filter @arza/infra-scripts deploy:staging`). Lee los datos de las variables de entorno (`config.ts`) |
| `deploy/deploy.ts`        | Los pasos del despliegue y la reversión automática                                                                             |
| `deploy/release.ts`       | Carpetas de cada versión en el servidor, enlace `current` y el comando `docker compose` de cada una                            |
| `deploy/smoke.ts`         | Pruebas de humo desde fuera, por internet, con TLS y la contraseña adicional                                                   |
| `deploy/isolation.ts`     | Prueba de aislamiento entre empresas en la base desplegada (solo lee)                                                          |
| `deploy/ports.ts`         | Revisión de puertos desde fuera (`check-ports.ts <servidor>`): solo 80, 443 y SSH                                              |
| `deploy/remote.ts`        | Órdenes al servidor: comillas de bash y argumentos de SSH (solo con llave y huella conocida)                                   |
| `deploy/deploy-runner.ts` | Conexión real con ssh, bash y tar                                                                                              |
| `deploy/rehearsal.sh`     | Ensayo completo en un equipo Linux con Docker (tarea 11 de la integración continua)                                            |

Igual que en `local/`, la lógica recibe el servidor como una función (`Remote`) y se prueba con un
servidor simulado (`fake-server.ts`). Ningún secreto viaja desde GitHub al servidor: las llaves de
Garage se leen allí mismo, y el token del registro y la contraseña adicional solo por la entrada
estándar o las variables del proceso.

## Pruebas

```bash
pnpm --filter @arza/infra-scripts test
```
