# Cierre del bloque B44 — Servidor de producción, copias y monitoreo

- Módulo: Infraestructura · Fase F8 · Depende de B43 · **Bloque crítico: requiere revisión externa**
- Construido por Claude Code el 24/11/2026, con el plan aprobado por el propietario («Apruebo
  todo», 10 decisiones).
- Rama `feat/b44-servidor-de-produccion-copias`, desde `5eed7a9` (`main` con B43 ya fusionado).
- Decisión de arquitectura nueva: [ADR-026](../adr/026-vigilancia-fuera-del-servidor-de-produccion.md).
- Guías de operación: [`docs/runbooks/`](../runbooks/README.md).

## Qué se construyó

Todavía no existe un servidor de producción contratado, así que el bloque deja **todo listo y
ensayado**: el día que usted contrate los servidores, se preparan siguiendo las guías, sin escribir
código.

- **Servidor de producción preparado por guion.**
  - El mismo guion de pruebas (`provision.sh`) ahora prepara producción con `--role production`:
    lo endurece igual (SSH solo con llave, cortafuegos, actualizaciones automáticas) y además
    instala los temporizadores de las copias y de la vigilancia.
  - Producción tiene cuatro direcciones: `www` (sitio público), `app` (aplicación interna),
    `clientes` (portal) y `api`. Correo real, antivirus siempre encendido y el sello de los PDF con
    el certificado de la empresa.
- **Despliegue a producción con su aprobación** (numeral 10.6).
  - Se publica solo a mano, desde GitHub, sobre una versión con etiqueta (por ejemplo `v1.0.0`), y
    solo si lo lanza su usuario. Nadie más puede.
  - Revisa sola la ventana de publicación: martes a jueves antes de las 4:00 p. m., nunca festivo
    ni víspera de festivo (los festivos los calcula la misma plataforma). Fuera de la ventana solo
    pasa si usted marca «corrección urgente de seguridad».
  - Copia la base antes de migrar, publica, hace las pruebas de humo de las cuatro direcciones y,
    si algo falla, **vuelve sola a la versión anterior**.
  - En producción nunca se cargan datos ficticios.
- **Copias de seguridad cifradas fuera del servidor** (numeral 10.5).
  - **pgBackRest** copia la base: completa los domingos, diferencial a diario y cada cambio al
    menos cada 5 minutos, así nunca se pierden más de 15 minutos. Guarda tres juegos: 30 días a
    cualquier minuto, uno mensual por 12 meses y uno anual por 10 años (decisión 5).
  - **restic** copia los archivos a diario (30 diarias y 12 mensuales).
  - Todo viaja cifrado a un depósito de **otro proveedor** (recomendado: Backblaze B2, decisión 4).
  - Hay guiones para restaurar (a lo último o a un minuto exacto) y para comprobar la restauración:
    cadena de auditoría íntegra en cada empresa, aislamiento entre empresas y API sana.
- **Restauración ensayada en cada cambio.** Una tarea nueva de la integración continua (13) usa la
  máquina de GitHub como si fuera producción: despliega una versión, saca **todas** las copias,
  escribe un cambio después de la última copia, **borra la base, los archivos y las colas**,
  restaura todo, comprueba que volvió hasta ese último cambio y mide el tiempo contra el límite de 4
  horas.
- **Vigilancia y alertas del numeral 10.7.**
  - **Uptime Kuma y GlitchTip** viven en un servidor de vigilancia **aparte** (ADR-026, decisión 1):
    si producción se cae por completo, desde allá se sigue avisando por correo y Telegram (decisión
    7). Allí también está la página de estado `estado.[dominio]`.
  - La API tiene una ruta nueva para los vigilantes, `/ops/status`, que dice el tiempo de respuesta,
    la tasa de errores y cuántos trabajos hay en espera o fallidos, y responde «alerta» si pasan los
    umbrales. Solo responde a una llave secreta de vigilancia; ni siquiera un administrador con
    sesión la puede leer.
  - La API y el worker envían a **GlitchTip** cada error inesperado, **sin datos personales**: solo
    el tipo de error, un mensaje depurado (sin correos, números largos ni valores), la ruta y el
    identificador para encontrarlo en los registros.
  - El servidor avisa si el procesador o la memoria pasan del 80 % por 15 minutos o el disco del
    75 %; las copias avisan cada vez que terminan (y si dejan de llegar más de 26 horas); el dominio
    avisa 20 días antes de vencer; los certificados los vigila Uptime Kuma.
- **Dos alertas de seguridad nuevas en la plataforma** (las que faltaban del numeral 10.7):
  - **Ingreso de un administrador de la plataforma.**
  - **Exportación masiva:** más de 500 registros en una sola exportación, o siempre que se exporte
    la auditoría o los datos personales de un titular (decisión 6).
  - Llegan como aviso y correo a Administración y Dirección **de la misma empresa**, y aparecen en
    Auditoría → Seguridad.
- **Guías de operación** (capítulo 22): producción, vigilancia, despliegue y reversión,
  restauración, atención de cada alerta (con el ensayo de todas), rotación de secretos, bloqueo de
  emergencia y alta de un ambiente nuevo; más los formatos FT-TEC-005 y FT-TEC-006.

### Criterios de aceptación

| Criterio                                                 | Cómo se cumple                                                                                                                                                                                                                                        | Dónde se comprueba                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Una restauración completa se logra dentro del RTO        | Ensayo de pérdida total y restauración en cada cambio de infraestructura, medido contra 4 horas                                                                                                                                                       | Tarea «13. Ensayo de producción, copias y restauración completa» del pull request (resumen FT-TEC-005)                          |
| Todas las alertas se disparan en un ensayo               | **Parcial (decisión 9):** sin servidores no hay a quién avisar. Cada umbral está probado (`/ops/status`, servidor, dominio, alertas de seguridad); el ensayo real queda como lista de 10 pasos                                                        | `ops.test.ts`, `ops-status.test.ts`, `monitoring-scripts.test.ts`, `security-alerts.int.test.ts`; guía `atencion-de-alertas.md` |
| `pnpm check` en verde                                    | Ver «Cómo se probó»                                                                                                                                                                                                                                   | Integración continua del pull request                                                                                           |
| Permiso denegado, aislamiento entre empresas y auditoría | `/ops/status`: 401 sin llave, con llave equivocada y con sesión de usuario. Alertas: solo llegan a Dirección de la misma empresa; quien no tiene permiso de exportar no exporta ni alerta; cada alerta queda en la misma transacción que su auditoría | `ops-status.test.ts`, `access.test.ts`, `security-alerts.int.test.ts`                                                           |
| Documentación y cierre                                   | Este archivo, las guías, ADR-026, `apps/api/README.md`, `infra/scripts/README.md` y el informe ASVS (V16 pasa a «Cumple»)                                                                                                                             | —                                                                                                                               |

## Cómo lo pruebo yo, paso a paso

### En su navegador, con el entorno local (las alertas nuevas)

1. Encienda el entorno como siempre: `pnpm infra:up` y luego `pnpm dev`.
2. Entre a `http://localhost:3000/app` con una cuenta que tenga el rol **Administrador de la
   plataforma**.
3. Abra la campana de avisos: debe aparecer «Alerta de seguridad en ARZA ONE: un administrador de
   la plataforma inició sesión». (Si su cuenta también tiene Dirección, le llega a usted mismo.)
4. Vaya a **Auditoría → Seguridad**: verá el evento «Inició sesión un administrador de la
   plataforma».
5. Vaya a **Auditoría → Exportaciones** y exporte la auditoría. Vuelva a **Auditoría → Seguridad**:
   aparece «Exportación masiva de datos», y en la campana el aviso correspondiente.
6. Abra `http://localhost:4000/ops/status`: debe responder **401** (sin la llave de vigilancia
   nadie la lee, ni siquiera con su sesión abierta).
7. Abra la bandeja de correo de pruebas `http://localhost:8025`: están los correos de las dos
   alertas.

### En GitHub (el ensayo de copias y restauración)

1. Abra el pull request de este bloque, pestaña **Checks**.
2. Busque **«13. Ensayo de producción, copias y restauración completa»**. En verde significa que
   desplegó producción, sacó todas las copias, borró todo, restauró y comprobó la auditoría y el
   aislamiento.
3. En el resumen de esa tarea está la línea **«Ensayo de restauración (FT-TEC-005)»** con el tiempo
   que tardó la restauración frente al límite de 4 horas.

### Cuando tenga los servidores

Siga, en este orden: [servidor-de-vigilancia.md](../runbooks/servidor-de-vigilancia.md),
[servidor-de-produccion.md](../runbooks/servidor-de-produccion.md), el ensayo de
[atencion-de-alertas.md](../runbooks/atencion-de-alertas.md) y el primer ensayo de
[restauracion.md](../runbooks/restauracion.md).

## Cómo se probó

- **Nuevas pruebas:**
  - `apps/api/src/platform/ops/ops.test.ts` (umbrales, ventana de 10 minutos, llave, envío a
    GlitchTip sin datos personales) y `apps/api/test/ops-status.test.ts` (la ruta real: 401 sin
    llave, con llave equivocada, con sesión y sin llave configurada; 200 y 503 con sus alertas).
  - `apps/api/src/platform/audit/bulk-export.test.ts` y
    `apps/api/test/int/ntf/security-alerts.int.test.ts` (alertas de ingreso de administrador y de
    exportación masiva contra la base real: evento, alerta, auditoría, aislamiento y permiso
    denegado).
  - `infra/scripts/deploy/release-window.test.ts`, `smoke-production.test.ts`,
    `monitoring-scripts.test.ts` y los cambios de `release.test.ts` y `deploy.test.ts`.
  - Web: `security-events.test.tsx` nombra en español los dos tipos nuevos.
- **Ajuste de una prueba existente (sin debilitarla):** `email-dispatch.int.test.ts` contaba todos
  los correos de un administrador; desde ahora su propio ingreso le genera otro correo legítimo
  (la alerta nueva). La prueba sigue exigiendo que el correo que vigila salga **una sola vez**.
- **`pnpm check` en este equipo, paso por paso** (el comando entero no se puede correr aquí):
  - Formato: todos los archivos del repositorio en verde. El paso `format:check` completo falla
    solo por los archivos sueltos del propietario sin commit (`.agents/`, `docs/diagnosticos/`…),
    que no se tocaron.
  - Lint por partes (API, web, worker, paquetes y guiones): en verde. De una sola vez se queda sin
    memoria en este equipo (8 GB).
  - Tipos, fronteras entre módulos (`boundaries`), código sin usar (`knip`), compilación y
    secretos (gitleaks, 712 commits): en verde.
  - Pruebas unitarias de los 9 paquetes: en verde (API 97 %, web 95 %, worker 92 %, guiones 94 %
    de cobertura de líneas).
  - Integración: con la API y el worker a la vez, el equipo se satura (transacciones que no
    alcanzan a empezar). Cada archivo que falló así pasó al correrlo solo, entre ellos
    `write-routes-audited` (527 de 527). La corrida completa la confirma la CI.
  - Navegador (Playwright): 420 de 420, en dos tandas (16 se repitieron por caídas del navegador).
- **Lo que solo se comprueba en GitHub:** la tarea 13 (necesita Linux, `sudo` y Docker sin los
  límites de este equipo), ShellCheck de los guiones nuevos y Trivy sobre la imagen nueva de
  PostgreSQL.

## Decisiones (aprobadas el 24/11/2026)

1. Uptime Kuma y GlitchTip en un servidor de vigilancia aparte (ADR-026).
2. ~~GlitchTip comparte la base y la cola del servidor donde vive~~ → **ajustada:** como vive en el
   servidor de vigilancia (decisión 1), tiene su propia base y su propia cola con topes de memoria
   (ADR-026). Producción conserva su margen de memoria.
3. Plan gratuito de GitHub: el despliegue a producción solo lo lanza el usuario de
   `PRODUCTION_APPROVER`, a mano y sobre una etiqueta vX.Y.Z. Con GitHub Pro se suma la aprobación
   nativa del ambiente `produccion`.
4. Depósito de copias: Backblaze B2 recomendado (cualquiera compatible con S3 sirve). Si queda
   fuera de Colombia, se declara la transmisión internacional.
5. pgBackRest con tres juegos: 30 días a cualquier minuto, mensual por 12 meses y anual por 10
   años.
6. Exportación masiva: más de 500 registros, o siempre la auditoría y los datos personales de un
   titular. La regla vive en un solo lugar (el registro de auditoría): cubre todas las exportaciones
   actuales y futuras que registren su número de filas.
7. Mensajería de las alertas: Telegram.
8. ~~Dependencia nueva `@sentry/node`~~ → **ajustada:** el SDK hoy trae OpenTelemetry y complementos
   de empaquetado. GlitchTip acepta un envío HTTP sencillo, así que se escribió un remitente propio
   de unas 120 líneas (`platform/ops/error-reporter.ts`), **sin dependencias nuevas**.
9. Sin servidores todavía: todo se ensaya en GitHub; el ensayo real de alertas queda como lista de
   pasos para hacerlo juntos.
10. Un pull request, commits pequeños; los archivos sueltos del propietario no se tocaron.

Otras decisiones técnicas de la construcción:

- Las copias de los archivos toman primero una **instantánea de los metadatos de Garage** y copian
  esa instantánea (no la base viva, que podría estar a medio escribir).
- Los temporizadores de las copias son de **systemd en el servidor** (no un contenedor con acceso a
  Docker, que sería un riesgo de seguridad).
- El ensayo de GitHub guarda las copias en una carpeta local (pgBackRest no habla S3 sin cifrado);
  la conexión real con el depósito se comprueba el primer día con `backup.sh status`.
- En producción `app.`, `clientes.` y `www.` sirven la misma web; la raíz de `app.` abre `/app` y la
  de `clientes.` abre `/portal`.

## Qué quedó pendiente

| Pendiente                                                                                                     | Responsable                      | Cuándo                                     |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| Contratar servidor de producción, servidor de vigilancia, depósito de copias y dominio                        | Director General                 | Antes de salir a producción                |
| Certificado real de la empresa para el sello de los PDF (viene de B43)                                        | Director General                 | Antes de salir a producción                |
| **Ensayo real de todas las alertas** (criterio parcial, decisión 9): los 10 pasos de `atencion-de-alertas.md` | Director General con Claude Code | Con los servidores listos                  |
| Primer ensayo de restauración con datos reales (FT-TEC-005)                                                   | Responsable técnico              | Primer lunes del mes siguiente a la salida |
| Botón para «cerrar todas las sesiones de la empresa» (la API ya lo tiene; la guía da un camino provisional)   | Claude Code                      | Bloque que se acuerde                      |
| Procedimiento para rotar `FIELD_ENCRYPTION_KEY` volviendo a cifrar los campos                                 | Claude Code                      | Bloque que se acuerde                      |
| Errores de la web (Next.js) a GlitchTip: hoy llegan los de la API y el worker                                 | Claude Code                      | Bloque que se acuerde                      |
| Actualizar el numeral 10.3 del manual por ADR-026 (FT-SGC-001)                                                | Director General                 | Próxima revisión del manual                |
| Revisión externa del bloque crítico                                                                           | Tercero                          | Antes de salir a producción                |
