# Integración continua

Guía de las verificaciones automáticas de GitHub (numeral 11.4, ADR-018, bloque B05).

## Qué pasa cuando se propone un cambio

Cada pull request, y cada cambio que llega a `main`, pone a correr el flujo
[`ci.yml`](../../.github/workflows/ci.yml). Las tareas van en paralelo y la última, **«Verificaciones»**,
resume todas: solo queda en verde si todas pasaron. La protección de `main` exige esa tarea en
verde para permitir integrar.

| #   | Tarea en GitHub                                          | Qué revisa                                                                                                                                                                                                            | Falla si…                                                                           |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0   | Qué verificar en este cambio                             | Decide qué tareas corren (ver la sección siguiente y ADR-024)                                                                                                                                                         | No puede leer el repositorio (entonces nada se integra)                             |
| 1-3 | Formato, análisis, tipos y fronteras                     | Mensajes de commit, Prettier, ESLint, TypeScript, dependency-cruiser y knip                                                                                                                                           | Hay una sola advertencia, un error de tipos o un módulo importa el interior de otro |
| 4   | Pruebas unitarias con cobertura                          | Todas las pruebas unitarias                                                                                                                                                                                           | Falla una prueba o la cobertura baja de 90 % (capítulo 21)                          |
| 5   | Integración con base de datos, colas y correo reales     | Pruebas contra PostgreSQL 17, Valkey y Mailpit desechables: aislamiento entre empresas, permisos, límite de peticiones, reintentos del worker; migraciones desde cero                                                 | Falla una prueba                                                                    |
| 6   | Secretos, seguridad y dependencias                       | gitleaks (todo el historial), Semgrep (patrones inseguros) y osv-scanner (dependencias)                                                                                                                               | Hay un secreto, un hallazgo de severidad alta o una vulnerabilidad alta o crítica   |
| 7   | Migraciones desde cero y sobre la versión anterior       | Que las migraciones nuevas no rompan la versión anterior; aplica las de `main` con datos ficticios y luego las nuevas                                                                                                 | Una migración ya integrada cambió, una nueva borra o renombra algo, o no aplica     |
| 8   | Imágenes api, web, worker y migrate y análisis con Trivy | Construye las imágenes Docker (migrate: la de migraciones del despliegue, B07) y busca vulnerabilidades                                                                                                               | Hay una vulnerabilidad crítica con corrección disponible                            |
| 9   | Pruebas en navegador y accesibilidad                     | Playwright y axe-core sobre la web compilada                                                                                                                                                                          | Falla un recorrido o hay una violación grave de accesibilidad                       |
| 11  | Ensayo de despliegue y reversión automática              | [`rehearsal.sh`](../../infra/scripts/deploy/rehearsal.sh): la máquina de GitHub hace de servidor; publica una versión buena, revisa puertos y publica una dañada que debe revertirse sola (B07)                       | La versión buena no se publica, hay otro puerto abierto o la dañada no se revierte  |
| 12  | Preparación y endurecimiento del servidor                | ShellCheck de los guiones de bash y [`infra/server/rehearsal.sh`](../../infra/server/rehearsal.sh): prepara la máquina de GitHub (Ubuntu 24.04) con `provision.sh` y comprueba SSH, root, contraseñas y puertos (B07) | Un guion tiene un error o un control del numeral 10.2 no se cumple                  |
| 10  | OWASP ZAP (semanal)                                      | [`zap-semanal.yml`](../../.github/workflows/zap-semanal.yml): ataca una copia temporal de la web y la API                                                                                                             | Hay una alerta de riesgo alto                                                       |

## Qué corre en cada cambio (ADR-024)

Para no gastar minutos repitiendo verificaciones sobre el mismo código, la tarea
**«0. Qué verificar en este cambio»** decide qué corre. Ninguna verificación se elimina; en la
página de la ejecución, las que no hacían falta aparecen como omitidas (gris) y la tarea 0 explica
por qué.

| Cambio                                                | Qué corre                                        |
| ----------------------------------------------------- | ------------------------------------------------ |
| Pull request de código                                | Tareas 1 a 9 completas                           |
| Pull request que toca infraestructura¹                | Tareas 1 a 9, más los ensayos 11 y 12            |
| Fusión a `main` de un pull request ya verificado²     | Seguridad (6) y ensayos 11 y 12                  |
| Solo documentación (`docs/` o archivos `.md`)         | Formato y mensajes de commit (1) y seguridad (6) |
| Lanzada a mano, cambio directo a `main` o caso dudoso | Todo                                             |

¹ `infra/`, `.github/`, cualquier `Dockerfile` o `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `.nvmrc` o `.dockerignore`.
² El código fusionado es idéntico a la punta del pull request (la rama estaba al día con `main`) y
su tarea «Verificaciones» terminó en verde. Si no se puede comprobar, corre todo.

Si el ensayo 11 o 12 falla al fusionar a `main`, el despliegue a pruebas no ocurre: corrija la
causa en un pull request nuevo.

### Volver a correr todo siempre

Sin tocar el código, en GitHub: **Settings → Secrets and variables → Actions → pestaña Variables →
New repository variable**, nombre `CI_FULL_RUN` y valor `true`. Desde ese momento todas las tareas
corren en cada cambio, como antes de ADR-024. Para volver a la optimización, borre la variable o
cambie su valor.

Para correr todo una sola vez sobre una rama: **Actions → Integración continua → Run workflow** y
elija la rama.

### Tareas 1 a 5 en el runner propio (ADR-025)

Con la variable de repositorio `CI_RUNNER` en `local` (mismo lugar que `CI_FULL_RUN`), las tareas
1-3, 4 y 5 corren en el runner propio de WSL2 en lugar de una máquina de GitHub. Solo en dos casos:
un cambio enviado a `main`, o un pull request abierto desde una rama de este repositorio por el
dueño del repositorio, que también hizo el último envío o la nueva ejecución. Los pull requests de
Renovate, los de forks y los de cualquier otra persona siguen en GitHub. Las demás tareas, el
despliegue y ZAP no cambian. Para volver a GitHub, borre la variable.

- El runner debe estar encendido, con Docker Desktop abierto. Si no lo está, las tareas esperan
  hasta 24 horas y fallan, y «Verificaciones» queda en rojo.
- No esquiva un bloqueo de facturación: la tarea 0 y «Verificaciones» siguen en GitHub. Si GitHub
  no las inicia, nada corre y nada se puede integrar.
- Límite de seguridad: quien puede escribir en el repositorio puede cambiar `ci.yml` y enviar
  código al runner. Solo es seguro mientras esos sean el dueño y Renovate. Para no exponer el
  equipo, detenga el runner cuando no lo necesite.

La verificación 10 corre los lunes a la 1:00 a. m. (hora de Bogotá) y se puede lanzar a mano en
GitHub: **Actions → Análisis dinámico semanal (OWASP ZAP) → Run workflow**. Analiza una copia
levantada dentro de GitHub ([`infra/compose/ci.yml`](../../infra/compose/ci.yml)). Pasará a
analizar el servidor de pruebas cuando este exista (pendiente de B07: ver su cierre).

## Qué hacer cuando una verificación falla

1. En el pull request, abra **Checks** y haga clic en la tarea en rojo. El paso que falló está
   marcado; su texto dice qué y dónde.
2. Reproduzca en el equipo con `pnpm check`. Los análisis que solo corren en GitHub tienen su guion:
   - Migraciones: `node infra/scripts/ci/check-migrations.ts origin/main` y
     `bash infra/scripts/ci/migrations-upgrade.sh origin/main` (requiere Docker).
   - Imágenes: `bash infra/scripts/ci/build-image.sh api arza-one/api:ci` (igual con `web`,
     `worker` y `migrate`).
   - Ensayo de despliegue (requiere Linux con Docker): `bash infra/scripts/deploy/rehearsal.sh`.
3. Corrija la causa. **Nunca** se debilita una prueba ni un control para que pase (CLAUDE.md).

### Análisis dinámico y pruebas de carga (B43)

- **ZAP** (`zap-semanal.yml`): cada lunes, a demanda y en el pull request que cambie el propio
  análisis. Levanta una copia con `.github/actions/scan-stack`: invita una cuenta de análisis,
  le asigna Dirección y Comercial, la activa con contraseña y segundo factor por la API
  (`infra/scripts/security/scan-session.ts`) y analiza la API con esa sesión. Falla con cualquier
  alerta de riesgo alto. Los informes quedan en el artefacto `informes-zap`. Una alerta solo se
  acepta en [`.zap/reglas.tsv`](../../.zap/reglas.tsv), con motivo y aprobación del Director General.
- **k6** (`rendimiento.yml`): antes de cada versión (etiqueta `v*`), a demanda y en el pull request
  que cambie la prueba. Crea 2000 terceros y mide 50 usuarios simultáneos durante 5 minutos. Falla
  si el percentil 95 supera 500 ms en consultas o 1 s en escrituras (`infra/k6/carga.js`). El
  resumen queda en el artefacto `resumen-k6`.
- **Licencias, avisos de terceros y SBOM** (tareas 6 y 8): la tarea 6 falla si un componente que se
  entrega trae una licencia que obligue a publicar el código de ARZA ONE
  (`infra/scripts/ci/license-gate.ts`) y guarda `AVISOS-DE-TERCEROS.md`. La tarea 8 guarda el
  inventario CycloneDX de cada imagen (`sbom-<commit>`), por 90 días.

### Excepciones de vulnerabilidades

Si una vulnerabilidad alta no tiene corrección publicada, se puede registrar una excepción
temporal en [`osv-scanner.toml`](../../osv-scanner.toml), con motivo y fecha de vencimiento (máximo
30 días). Requiere la aprobación del Director General en el pull request. Al vencer, la verificación
vuelve a fallar y se revisa de nuevo. Para Trivy, el equivalente es `.trivyignore` (hoy no existe:
no hay excepciones).

### Migraciones destructivas (fase de contraer)

Ver [`infra/scripts/README.md`](../../infra/scripts/README.md#fase-de-contraer). La línea
`-- arza:contract <motivo>` en la migración declara que la versión anterior ya no usa lo que se
borra. Desactivar la seguridad por fila nunca se permite.

## Protección de la rama principal

Configuración aplicada a `main` (numeral 11.3):

- Todo cambio entra por pull request; no se admiten cambios directos.
- La tarea **Verificaciones** debe estar en verde y la rama al día con `main`.
- No se permite forzar cambios (`force push`) ni borrar `main`.
- La regla aplica también a los administradores.
- No se exige aprobación de otra persona mientras el equipo sea de una sola persona (GitHub no
  permite aprobar el propio pull request). En los bloques críticos la revisión externa se registra
  en el pull request.

Requiere GitHub Pro (o un repositorio público). Se aplica, y se vuelve a aplicar si alguien la
cambia, con un solo comando desde la carpeta del proyecto:

```bash
bash infra/scripts/github/protect-main.sh
```

Para revisarla: **Settings → Branches** en GitHub.

## Renovate (actualización de dependencias)

La configuración está en [`renovate.json`](../../renovate.json). Cada lunes antes de las 6:00 a. m.
Renovate propone, como pull requests, las versiones nuevas: una propuesta agrupada para versiones
menores, otra para acciones e imágenes y una por cada versión mayor. Las vulnerabilidades se
proponen de inmediato. Espera tres días desde la publicación de cada versión y **nunca integra
solo**: el responsable técnico revisa cada propuesta con Claude Code (capítulo 22).
El panel «Panel de actualizaciones de dependencias» (una incidencia en GitHub) resume lo pendiente.

Instalación (una sola vez, la hace el dueño del repositorio):

1. Abra https://github.com/apps/renovate y pulse **Install** (o **Configure** si ya existe).
2. Elija **Only select repositories**, marque `arza-one` y confirme.
3. Renovate lee `renovate.json` y crea el panel en las horas siguientes.

## Herramientas fijadas

Para evitar sorpresas (en 2026 hubo un ataque real a una acción de Trivy), cada acción de GitHub va
fijada a un commit exacto, cada imagen a su huella `sha256` (también ZAP y k6) y cada programa descargado (gitleaks,
osv-scanner, Trivy) a su versión y a la huella del archivo, que se verifica antes de usarlo.
Renovate actualiza las acciones y las imágenes. Los tres programas se actualizan a mano cada
trimestre: cambie la versión y la huella en `ci.yml`, tomándola del archivo de huellas
(`checksums`) publicado con esa versión.

## Tiempo y minutos

La meta es que todas las verificaciones terminen en menos de 15 minutos (B05). Cada tarea tiene un
límite de 15 minutos (20 la de imágenes, que construye las cuatro). Un cambio nuevo en el mismo pull
request cancela la ejecución anterior para no gastar minutos de la cuota de GitHub Actions.

GitHub cobra cada tarea por separado y redondea cada una al minuto. Con ADR-024 un bloque gasta
unos 58 minutos (pull request más fusión) en lugar de 116. El consumo del mes se consulta en
GitHub: foto de perfil → **Settings → Billing and licensing → Usage**.
