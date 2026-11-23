# Cierre del bloque B42 — Privacidad completa

- Módulo: M18 · Fase F8 · Depende de B41 · **Bloque crítico: requiere revisión externa**
- Construido por Claude Code el 23/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b42-privacidad-completa`, desde `a776f34` (`main` con B41 ya fusionado).
- Documentación del módulo: `docs/manual/datos/prv.md` y la sección «Privacidad completa (B42)» de `apps/api/README.md`.

## Qué se construyó

- **Solicitudes de los titulares** (la persona dueña de los datos pide conocerlos, corregirlos, suprimirlos o retirar su autorización).
  - Llegan por cuatro caminos: el formulario «Sus derechos sobre sus datos» del sitio público (`/derechos-del-titular`), el portal del cliente (Mis datos), el registro que hace el Oficial (correo, teléfono, en persona o por escrito) y el traslado automático de una PQRSF de datos personales.
  - Cada una recibe un código (`PRV-2026-0001`) y su **fecha límite legal en días hábiles**, con los festivos de Colombia: consultas 10 días, reclamos 15.
  - El Oficial de Protección de Datos recibe una **tarea en Mis tareas** con esa misma fecha límite.
  - La persona recibe por correo la constancia y puede consultar el estado en el sitio con su código y su correo.
  - El Oficial verifica la identidad (relaciona la solicitud con la persona en Terceros y anota cómo la comprobó), puede pedir que complete un reclamo incompleto (el plazo se detiene), puede ampliar el plazo una vez (5 o 8 días hábiles más), responde y cierra. Cada paso queda en la historia; los que le interesan al titular le llegan por correo.
  - Si un reclamo incompleto pasa dos meses sin respuesta, se cierra solo como desistido y se le avisa al titular.
- **Entrega de los datos.** Desde una solicitud verificada, «Preparar la entrega de sus datos» reúne lo que guarda cada módulo (Terceros, autorizaciones, solicitudes, cuentas, Comercial, Servicio al cliente, Sitio web, Talento humano, Facturación, Contratos y firmas). En segundos queda un **PDF legible** con el marco institucional y, además, una copia en formato de datos.
- **Supresión de los datos.** Solo cuando el titular pidió suprimir. Vuelve anónimos los datos que se pueden borrar, revoca sus autorizaciones y **bloquea con su motivo legal** lo que se debe conservar (facturas y contratos 10 años, firmas, historia laboral). El resultado se ve módulo por módulo. Con una cuenta activa en el portal no se puede suprimir: primero se desactiva.
- **Revocar detiene las comunicaciones comerciales.** Hay una sola consulta (`mayContactCommercially`) que todo envío comercial debe hacer: si el correo se dio de baja o la autorización de «Envío de información comercial» ya no está vigente, la respuesta es no, de inmediato.
- **Incidentes con datos personales.** Registro con la fecha límite de 15 días hábiles para reportarlo a la SIC, contención, bitácora de medidas, reporte con su radicado, aviso a los titulares afectados y cierre (con el reporte hecho o con el motivo para no reportarlo).
- **Cookies.** Consulta de las elecciones de los visitantes del sitio y un resumen por categoría y por versión de la política.
- **Registros en CSV** de solicitudes y de incidentes, para Excel.
- **Avisos al Oficial**: solicitud nueva, solicitud o incidente a dos días hábiles de vencer y el día del vencimiento.
- **Retención**: las elecciones de cookies se borran a los 3 años y los formularios del sitio se vuelven anónimos a los 2 años (lo que B41 dejó pendiente).

### Criterios de aceptación

| Criterio (ficha 17.19 y bloque)                                            | Cómo se cumple                                                                                   | Dónde se prueba                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Una solicitud genera tarea con la fecha límite legal en días hábiles       | El plazo sale del calendario de días hábiles con festivos y la tarea del Oficial lleva esa fecha | `test/int/privacy/requests.int.test.ts`                           |
| La exportación entrega todos los datos del titular en formato legible      | Cada módulo presta sus datos con etiquetas en español; el worker arma el PDF                     | `personal-data.int.test.ts`, `requests-screens.test.tsx`          |
| Revocar una autorización detiene las comunicaciones comerciales            | `mayContactCommercially` responde no en cuanto se revoca la finalidad comercial                  | `personal-data.int.test.ts`                                       |
| Consultas 10 días (+5), reclamos 15 días (+8); reclamo incompleto en 5     | Reglas en los contratos y en los pasos de la solicitud                                           | `requests.test.ts` (contratos) y `requests.int.test.ts`           |
| La supresión no procede si hay deber de conservar: se bloquea y se informa | La fuente responde «bloqueado» con su motivo y la ficha queda bloqueada                          | `personal-data.int.test.ts`                                       |
| Incidentes con plazo para la SIC y bitácora                                | Estados, medidas y cierre con reporte o motivo                                                   | `incidents.int.test.ts`, `incidents-screens.test.tsx`             |
| Permiso denegado, aislamiento entre empresas y auditoría                   | Pruebas de 403 y de otra empresa; las 23 rutas nuevas que escriben dejan su evento de auditoría  | `requests-access.int.test.ts`, `write-routes-audited.int.test.ts` |

## Decisiones (aprobadas el 23/11/2026)

1. Tres canales: el formulario del sitio público, el portal del cliente y el registro interno del Oficial (además del traslado de PQRSF que ya existía desde B29).
2. El tipo depende del derecho: conocer, prueba de la autorización y uso = consulta; actualizar, corregir, suprimir, revocar y reclamar = reclamo.
3. La identidad la verifica el Oficial: relaciona la solicitud con la persona en Terceros y anota cómo lo comprobó. Sin eso no se entrega ni se suprime.
4. El plazo corre desde el día hábil siguiente; una prórroga con motivo antes de vencer; el reclamo incompleto se requiere dentro de 5 días hábiles y su plazo se detiene; a los 2 meses sin respuesta se cierra como desistido.
5. Cambio pequeño en el motor de tareas: el módulo dueño fija la fecha límite y la puede mover.
6. Entrega en PDF legible y en formato de datos (JSON), preparada en segundo plano.
7. Entregar y suprimir solo desde una solicitud verificada del mismo titular.
8. Se vuelven anónimos los datos de contacto; se bloquean con su motivo facturas, contratos, firmas e historia laboral; se conservan como prueba las autorizaciones (revocadas) y la lista de bajas; una cuenta activa del portal impide suprimir.
9. Incidentes: abierto → contenido → reportado a la SIC → cerrado; no se cierra sin reporte o sin motivo.
10. Retención: cookies 3 años y se borran; formularios del sitio anónimos a los 2 años; solicitudes e incidentes no se borran.
11. Avisos al Oficial a 2 días hábiles del vencimiento y el día del vencimiento.
12. Una rama, commits pequeños y un pull request; revisión externa.

### Decisiones técnicas tomadas durante la construcción (le pido revisarlas)

- **Cómo Privacidad reúne datos de otros módulos sin leer sus tablas**: cada módulo (Comercial, Servicio, Sitio web, Talento humano, Facturación y Contratos) registra al iniciar una «fuente» en `PersonalDataRegistry`. Terceros responde por el puerto que ya existía (`PARTY_DIRECTORY`, ampliado) e Identidad por su índice. Así no hay dependencias circulares (lo confirma la revisión de límites).
- **La ficha suprimida queda como «prospecto retirado»**: la base de datos exige documento a toda ficha que no sea prospecto; es lo mismo que ya hacía la supresión de candidatos de B35.
- **Rutas de entrega y supresión**: las del capítulo 14 (`/v1/parties/{id}/personal-data/export` y `erase`), con el código de la solicitud en el cuerpo.
- **El informe de cookies usa el permiso «Administrar avisos de privacidad»**, que es del Oficial: el de «Ver autorizaciones» también lo tiene el colaborador (solo lo propio).
- **Una PQRSF trasladada entra como «Conocer mis datos» o «Reclamar por un incumplimiento»** según la marque Servicio al cliente; su plazo cuenta desde que llegó la PQRSF.
- **Los avisos nuevos** necesitaron una segunda migración pequeña (`20261126010000_ntf_privacy_notices`) que solo amplía la lista de tipos de aviso permitidos.
- **Errores reales que encontraron las pruebas, ya corregidos**: el worker anotaba un intento fallido del PDF sin su evento de auditoría; una solicitud nacía en «versión 2» porque se guardaba dos veces; y la ficha suprimida chocaba con la regla de documento obligatorio.

## Cómo probarlo en su navegador

Antes de empezar: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed:demo` y `pnpm dev`. Use las cuentas ficticias de prueba y, como en B41, ponga temporalmente en `PUBLIC_SITE_TAX_ID` el NIT de la empresa de demostración (`900000001-1`) y reinicie `pnpm dev`.

1. **Presentar una solicitud como titular.** Abra `http://localhost:3000/derechos-del-titular` (también está en el pie del sitio: «Mis datos personales»).
   - Elija «Corregir mis datos», llene sus datos y el detalle **sin** marcar la casilla y envíe: se lo pide.
   - Marque la casilla y envíe: aparece el código `PRV-…` y la fecha límite (15 días hábiles: es un reclamo).
   - En Mailpit (`http://localhost:8025`) llega la constancia con el código y la fecha límite (tarda hasta 30 segundos).
2. **Lo que le llega al Oficial.** Entre con una cuenta con el rol Oficial de Protección de Datos.
   - En **Mis tareas** aparece «Atender la solicitud: PRV-… · su nombre» con la fecha límite.
   - En **Privacidad › Solicitudes de titulares** está la solicitud con su fecha límite.
3. **Pedir que complete el reclamo.** Abra la solicitud y pulse **Pedir que complete el reclamo**; escriba qué falta. La fecha límite cambia a «Plazo suspendido» y al titular le llega el correo. Pulse **Registrar lo que completó**: la fecha límite vuelve a contar desde hoy.
4. **Consultar el estado como titular.** En `http://localhost:3000/derechos-del-titular/consulta` escriba el código y el correo: ve el estado. Con otro correo dice que no existe.
5. **Verificar, ampliar y responder.**
   - **Verificar la identidad**: busque a la persona en Terceros (si no existe, créela en Terceros), elija cómo lo comprobó y escriba qué revisó.
   - **Ampliar el plazo**: escriba el motivo; la fecha se corre 8 días hábiles (5 en una consulta) y el botón ya no aparece.
   - **Responder** y luego **Cerrar la solicitud**: la tarea de Mis tareas desaparece y al titular le llega la respuesta.
6. **Entregar los datos.** Registre (con **Registrar solicitud**) otra solicitud «Conocer los datos que tienen de mí», verifíquela con una persona que tenga autorizaciones y pulse **Preparar la entrega de sus datos**. En unos segundos aparece «Lista»: pulse **Descargar PDF** y revise que trae la ficha, las autorizaciones y lo demás que tenga la persona.
7. **Suprimir los datos.** Registre una solicitud «Suprimir mis datos», verifíquela con una persona que **no** sea colaboradora y pulse **Suprimir sus datos** › **Sí, suprimir los datos**. Aparece el resultado por módulo. En Terceros, la ficha quedó como «Titular Suprimido» y retirada; en Autorizaciones, revocadas. Repita con una persona que sea colaboradora: su ficha queda **bloqueada** y el resultado dice «Historia laboral».
8. **Incidentes.** En **Privacidad › Incidentes** pulse **Registrar incidente**, llene los datos y marque los tipos de datos. En la ficha verá la fecha límite para la SIC. Registre la contención y una medida; luego **Cerrar el incidente**: si no lo reportó, le pide el motivo.
9. **Cookies.** En **Privacidad › Cookies** verá cuántos visitantes aceptaron cada categoría en el mes.
10. **Registros en CSV.** En Solicitudes y en Incidentes, **Descargar el registro (CSV)** baja el archivo para Excel.
11. **Portal del cliente.** Entre al portal con una cuenta de cliente, abra **Mis datos** y use «Sus derechos sobre sus datos»: la solicitud aparece en su lista con la fecha límite, y en la bandeja del Oficial con canal «Portal del cliente».
12. **Permisos.** Con una cuenta de Comercial o Colaborador, escriba a mano `/app/privacidad/solicitudes`: dice «No tiene acceso a esta sección».

## Cómo se probó

Verificaciones ejecutadas en este equipo el 23/11/2026 (resultados reales):

| Verificación                                                                                                                                                                                     | Resultado                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Contratos de privacidad (reglas de plazos y esquemas)                                                                                                                                            | 16/16                                                            |
| Integración de privacidad: solicitudes, exportación, supresión, incidentes, alertas diarias, permisos y aislamiento                                                                              | 60/60                                                            |
| Integración del resto de módulos (portal, flujos, accesos, notificaciones, comercial, contratos, servicio, finanzas, proyectos, documentos, núcleo, activos, compras, migraciones y aislamiento) | todo en verde, corrida por partes                                |
| Recorrido de auditoría (toda ruta que escribe deja su evento)                                                                                                                                    | ver nota abajo                                                   |
| Pantallas web (Vitest)                                                                                                                                                                           | 1011/1011, cobertura de ramas 85,34 % (umbral 85 %, sin bajarlo) |
| Trabajos del worker (colas)                                                                                                                                                                      | 20/20                                                            |
| Tipos (API, web, worker), límites entre módulos, código sin usar (knip), formato y ESLint de lo cambiado                                                                                         | en verde                                                         |
| Secretos (gitleaks, 675 commits)                                                                                                                                                                 | sin hallazgos                                                    |

Correcciones que salieron de estas corridas (sin debilitar pruebas):

- La prueba de aislamiento del portal exigía cubrir la nueva dirección `/v1/portal/me/privacy-requests`: se agregó, y el cliente A ahora presenta una solicitud para comprobar que el cliente B no la ve.
- En el recorrido de auditoría, las dos rutas públicas de solicitudes se ejecutaban después del paso que cambia el NIT de la empresa: ahora devuelven antes el NIT del sitio, igual que la PQRSF pública.

Límites de este equipo (7,4 GB de memoria): la suite de integración no corre completa de una vez porque la base de datos de pruebas se queda sin memoria; se corrió por partes y los fallos que aparecieron por eso pasaron al repetirlos. No se corrieron aquí las pruebas de navegador (versión local de Playwright distinta) ni `pnpm build` completo: los confirma la integración continua del pull request.

## Pendientes

- **Concepto jurídico** de los textos y de los correos al titular antes de producción (siguen siendo provisionales).
- **El archivo de la entrega lo envía el Oficial** por el medio que elija (por ejemplo, adjunto a su respuesta). Hoy el titular no lo descarga desde el sitio ni desde el portal.
- **La respuesta a una solicitud de «Revocar mi autorización»** no revoca sola: el Oficial la revoca en Autorizaciones y luego responde.
- **Correo de la cuenta del portal**: suprimir exige desactivarla antes (decisión 8).
- **Envíos comerciales** (boletín, campañas): cuando existan deben consultar `mayContactCommercially`.
- **Revisión externa**: es un bloque crítico.
- Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron.

## Lineamientos visuales (B22A)

Componentes de `@arza/ui`, colores de `tokens.css` y Montserrat. Los formularios muestran el mensaje junto al campo y el resumen de errores (FormSummary). Las pantallas nuevas tienen estados de carga, vacío y error, y se revisan con axe en modo claro y oscuro (`e2e/privacy-requests.spec.ts`).
