# Cierre del bloque B41 — Sitio público, formularios, textos legales y cookies

- Módulo: M17 · Fase F8 · Depende de B22, B29 y B17 · **Bloque crítico: requiere revisión externa**
- Construido por Claude Code el 22 y 23/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b41-sitio-publico-formularios-text`, desde `896c925` (`main` con B40 ya fusionado).
- Documentación del módulo: `docs/manual/datos/web.md`.

## Qué se construyó

- **Formularios de contacto y cotización** en el inicio del sitio. Reemplazan los avisos «Disponible pronto».
  - La persona escribe sus datos y su mensaje (o el servicio, el plazo y la descripción del proyecto).
  - Puede leer el aviso de autorización que acepta. La casilla **nunca viene marcada** y sin ella no se envía nada.
  - Al enviar, ve una referencia (`FRM-2026-0001`) y en unos segundos le llega un correo de confirmación.
  - Cada envío crea un **prospecto en Comercial** con origen «Sitio web», la tarea «Contactar al prospecto» y la autorización con la versión exacta del aviso.
- **Textos legales versionados.** Términos y condiciones del sitio, términos de uso de la plataforma, política de cookies, derechos del titular, seguridad y divulgación responsable, y avisos de software de terceros.
  - Cada uno pasa por **borrador → aprobado → publicado → reemplazado**.
  - Lo aprueba y lo publica una persona distinta de quien lo redactó.
  - El sitio muestra la versión publicada con su número y desde cuándo rige. Si no hay una, dice que todavía no se ha publicado.
  - La política de tratamiento de datos sigue en Privacidad: el pie de página muestra la publicada allí.
- **Términos de la plataforma.** Cuando se publica una versión nueva, cada colaborador la lee y la acepta **en su siguiente ingreso**.
  - Hasta aceptarla, la plataforma no le deja hacer nada más; esto lo controla la API, no solo la pantalla.
  - Su aceptación queda registrada con la versión, la fecha, la dirección IP y el navegador.
- **Aviso y centro de preferencias de cookies.**
  - Aparece en la primera visita, sin tapar la lectura, con tres botones iguales: «Aceptar todas», «Rechazar las no necesarias» y «Configurar».
  - El centro de preferencias trae «Preferencias» desmarcada. Analítica y publicidad dicen «No las usamos».
  - La elección se guarda 12 meses y se vuelve a pedir si cambia la política. Se registra con la versión de la política, la fecha y la dirección IP truncada.
  - Con «Rechazar», el navegador solo guarda la cookie de la elección. El modo claro u oscuro se recuerda solo si se aceptan las preferencias.
  - El enlace **«Preferencias de cookies»** del pie de página permite cambiar la decisión.
- **Baja de comunicaciones comerciales en un clic.**
  - Cada correo de confirmación trae un enlace de baja. Basta abrirlo, sin iniciar sesión.
  - El correo queda en una lista de bajas que todo envío comercial futuro debe consultar.
- **Páginas institucionales administrables**, como «Nosotros». Se redactan, se publican y se retiran desde la plataforma, y se ven en su dirección (por ejemplo `/nosotros`). Antes de mostrarla, el servidor del sitio confirma con la API que está publicada; una dirección que no corresponde a una página publicada responde 404 (la prueba en navegador de la CI lo detectó y se corrigió).
- **Módulo «Sitio web»** en el menú (grupo Gobierno), con tres partes: Páginas, Textos legales y Formularios recibidos (que incluye las bajas).
- **Verificación pública de documentos** (B25) y **PQRSF** (B29): siguen funcionando como estaban.

### Criterios de aceptación

| Criterio                                                                  | Cómo se cumple                                                                                                         | Prueba                                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ningún formulario se envía sin la casilla, que nunca viene marcada        | La pantalla la trae sin marcar y la API rechaza el envío sin ella (422)                                                | `site.test.ts`, `forms.int.test.ts`, `site-public.test.tsx`                                                 |
| Las cookies no esenciales no se instalan antes de la aceptación           | El modo claro u oscuro solo se guarda con «Preferencias» aceptada; no hay analítica ni recursos de terceros            | `site-public.test.tsx`, `e2e/site.spec.ts`                                                                  |
| Con las cookies rechazadas, el navegador solo tiene las necesarias        | Al rechazar queda solo `arza_cookie_consent`; la de modo se borra                                                      | `e2e/site.spec.ts` (navegador real) y `site-public.test.tsx`; revisado también a mano en el navegador local |
| Cada aceptación guarda la versión del texto aceptado                      | Formularios: versión del aviso; términos: versión aceptada; cookies: versión de la política                            | `forms.int.test.ts`, `platform-terms.int.test.ts`                                                           |
| Publicar unos términos nuevos obliga a aceptarlos en el siguiente ingreso | La sesión queda esperando la aceptación (403 `TERMS_PENDING`) y la web lleva a `/aceptar-terminos`                     | `platform-terms.int.test.ts`, `session-chain.test.ts`, `accept-terms.test.tsx`, `session-provider.test.tsx` |
| El pie identifica a la empresa                                            | Razón social, NIT, domicilio, correo y teléfono (los datos reales siguen entre corchetes hasta que usted los entregue) | `site-chrome.tsx`                                                                                           |
| Accesibilidad sin violaciones graves                                      | El inicio con el aviso y los formularios se revisa con axe en modo claro y oscuro                                      | `e2e/site.spec.ts`                                                                                          |
| Permiso denegado, aislamiento entre empresas y auditoría                  | Cada parte tiene su prueba de 403 y de otra empresa; las 12 rutas nuevas que escriben dejan su evento de auditoría     | `test/int/site/*`, `write-routes-audited.int.test.ts`                                                       |

## Decisiones (aprobadas el 22/11/2026)

1. Textos del sitio en `web_legal_texts`: términos del sitio, términos de la plataforma, cookies, derechos del titular, seguridad y avisos de terceros. La política de tratamiento, el aviso de privacidad y los términos del portal siguen en Privacidad.
2. Redactan quienes tienen «Editar textos legales» (Comercial, Administrador, Oficial de datos). Aprueban y publican quienes tienen «Publicar textos legales» (Dirección, Oficial de datos). Nadie aprueba lo que redactó. El concepto del asesor jurídico se puede adjuntar al aprobar, sin ser obligatorio.
3. Los términos de la plataforma se aceptan en el siguiente ingreso y la API bloquea hasta aceptarlos. Sin versión publicada no se bloquea a nadie.
4. La tabla `prv_cookie_consents` se creó en este bloque, dentro de Privacidad. B42 quedó anotado para hacer su consulta e informes.
5. Categorías: necesarias y preferencias; analítica y publicidad aparecen como «No las usamos».
6. En el sitio público el modo claro u oscuro se guarda solo con «Preferencias» aceptada. En la plataforma y el portal no cambió.
7. Contacto y cotización crean el prospecto en Comercial, con su tarea y su autorización, y envían el acuse. La PQRSF sigue igual.
8. Contra robots: límite de envíos por minuto y un campo trampa invisible. El CAPTCHA queda para B43.
9. Baja con enlace de un solo uso en cada acuse y lista de bajas para envíos futuros.
10. Páginas en texto sencillo (títulos con «## », listas con «- »), sin librerías nuevas, en `/{dirección}`. El inicio conserva el diseño de B22A.
11. Textos iniciales provisionales «PENDIENTE DE CONCEPTO JURÍDICO»: publicados en las empresas de demostración (salvo los términos de la plataforma, que quedan en borrador para que usted pruebe su publicación) y en borrador en ARZA TECH.
12. Fuera del bloque: boletín, CAPTCHA, retención de los formularios (B42) y analítica. Los datos reales de la empresa en el pie siguen pendientes.

### Decisiones técnicas tomadas durante la construcción

- **Rutas de la API**: las del capítulo 14 (`/v1/public/pages`, `/v1/public/forms/…`, `/v1/public/legal/{clase}`, `/v1/public/cookie-consent`, `/v1/public/unsubscribe`). La administración quedó en `/v1/site/…` y la aceptación en `/v1/me/platform-terms`. La llave de baja va en el cuerpo de la petición, nunca en la dirección, como en la cotización y la encuesta.
- **Identidad no lee tablas del sitio**: pregunta por los términos pendientes mediante un puerto (`PLATFORM_TERMS_GATE`) que el módulo del sitio implementa, como ya se hace con la empresa cliente del portal.
- **Un solo control de «ruta pública»**: la prueba que limita qué rutas pueden ser públicas se amplió con las nuevas, una por una.
- **Las pruebas de navegador** traen por defecto la elección de cookies ya hecha, para que el aviso no tape las demás pantallas públicas. Las pruebas del aviso la borran.
- **Un error encontrado y corregido**: si un correo ya estaba de baja por otro enlace, abrir el segundo enlace fallaba porque no dejaba su evento de auditoría. Ahora queda la constancia de uso.

## Cómo probarlo en su navegador

Antes de empezar: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed:demo` y `pnpm dev`. Use las cuentas ficticias de prueba.

**Importante:** el sitio público muestra la empresa cuyo NIT está en `PUBLIC_SITE_TAX_ID` de su archivo `.env`. Con el NIT de la empresa semilla (`900000000-0`, ARZA TECH), los textos están en borrador y los formularios dirán «no está disponible» hasta que publique el aviso de autorización de contactos en Privacidad. Para probar todo de una vez, ponga temporalmente el NIT de la empresa de demostración `900000001-1` y reinicie `pnpm dev`.

1. **Aviso de cookies.** Abra el sitio en una ventana privada.
   - Abajo aparece «Usamos cookies» con tres botones del mismo tamaño.
   - Pulse **Rechazar las no necesarias**. Cambie el modo a oscuro y recargue: vuelve al modo del sistema, porque no se guardó.
   - Para comprobar las cookies: F12 › Aplicación › Cookies. Solo debe estar `arza_cookie_consent`.
   - En el pie, pulse **Preferencias de cookies**, marque **Preferencias** y guarde. Ahora el modo oscuro sí se recuerda al recargar.
2. **Formulario de contacto** (sección Contacto del inicio).
   - Llene sus datos y el mensaje, **sin** marcar la casilla, y envíe: debe pedirle la autorización.
   - Despliegue «Leer el aviso», marque la casilla y envíe. Aparece la referencia `FRM-…`.
   - Abra Mailpit (`http://localhost:8025`): llega el correo de confirmación con un enlace de baja.
3. **Cotización** (sección Cotización). Elija un servicio y un plazo, describa el proyecto y envíe. Aparece otra referencia.
4. **Lo que llegó a la empresa.** Entre como Comercial.
   - **Comercial › Prospectos**: están los dos prospectos con origen «Sitio web». En **Mis tareas**, la tarea «Contactar a …».
   - **Gobierno › Sitio web › Formularios recibidos**: los dos envíos, con la versión del aviso aceptado y el enlace al prospecto.
5. **Baja en un clic.** En Mailpit abra el enlace de baja del correo. La página dice que ese correo no recibirá más comunicaciones comerciales. Ábralo otra vez: dice que ya estaba de baja. En **Formularios recibidos**, abajo, aparece el correo en «Bajas de comunicaciones comerciales».
6. **Textos legales.** Entre como una persona con rol Comercial.
   - **Sitio web › Textos legales**: cada texto con sus versiones. En «Términos de uso de la plataforma» pulse **Editar borrador**, cambie algo y guarde. No aparece el botón «Aprobar».
   - Entre como Dirección: pulse **Aprobar** y luego **Publicar** en ese texto.
   - En el pie del sitio, abra «Términos de uso de la plataforma»: se ve la versión publicada con su fecha.
7. **Aceptar los términos en el siguiente ingreso.**
   - Cierre sesión y vuelva a entrar con cualquier cuenta interna. Antes de la plataforma aparece la pantalla de los términos.
   - Pulse **Aceptar y continuar** sin marcar la casilla: se lo pide. Márquela y acepte: entra a la plataforma.
   - Cierre sesión y entre otra vez: ya no se los pide.
8. **Páginas.** En **Sitio web › Páginas** está «Nosotros» de demostración. Ábrala en el sitio con `/nosotros`. Cree otra página (por ejemplo «servicios»), publíquela, véala en `/servicios` y luego **Retírela**: la dirección deja de mostrarla y responde «No encontramos esta página».
9. **Permisos.** Como Colaborador, si escribe a mano `/app/sitio-web/paginas`, la plataforma no le muestra las páginas.

## Cómo se probó

Verificaciones ejecutadas en este equipo el 22 y 23/11/2026:

- **Pruebas del sitio:** contratos 9/9; integración 25/25 en 7 archivos (textos legales, términos de la plataforma, formularios y cookies, páginas, semilla, bordes y sitio sin configurar); pantallas 22/22 del sitio y del módulo «Sitio web», más la aceptación de términos y la redirección de la sesión.
- **Recorrido de auditoría** (toda ruta que escribe deja su evento): 505/505, con las 12 rutas nuevas.
- **Integración relacionada:** identidad, privacidad, prospectos y migraciones (271/272 en la corrida conjunta; la de migraciones falló por correr junto a otras y pasó sola 5/5).
- **Pruebas unitarias de la API:** 456/456, cobertura 97 % de líneas y 92 % de ramas. Cobertura de integración del módulo nuevo: 98 % de líneas y 89 % de ramas.
- **Pruebas de pantallas completas:** 982/982; cobertura de la web 85,5 % de ramas (mínimo 85 %). Worker: 42/42.
- Las pruebas encontraron **un error real, ya corregido**: abrir un segundo enlace de baja de un correo que ya estaba de baja fallaba por no dejar su evento de auditoría.
- Tipos, límites entre módulos (0 violaciones), código sin usar (knip, 0), secretos (gitleaks en cada commit, sin hallazgos) y análisis de estilo de los archivos cambiados: en verde. El análisis de estilo de todo el repositorio se queda sin memoria en este equipo.
- Revisión de formato: en verde salvo los archivos sueltos del propietario.
- **Revisión en el navegador local:** el aviso de cookies aparece con sus tres botones iguales y, al rechazar, el navegador solo guarda `arza_cookie_consent`. El resto no se pudo revisar a mano: con la plataforma completa encendida el equipo se quedó sin memoria y la API no alcanzaba la base de datos.
- **No se ejecutaron:** las pruebas de navegador (`pnpm test:e2e`, entre ellas la de cookies rechazadas), porque el navegador de Playwright instalado no coincide con la versión pedida y descargarlo necesita su autorización. Las corre la integración continua.
- **Compilación** (`pnpm build`): la web compiló con las 7 pantallas nuevas. La API falló una vez por no encontrar un archivo que sí existe (fallo pasajero del equipo) y al repetirla compilaron la API y el worker sin errores.

## Pendientes

- **Concepto jurídico de los textos.** Los textos cargados son provisionales («PENDIENTE DE CONCEPTO JURÍDICO»). Antes de producción, el asesor jurídico debe aprobar la versión definitiva de cada uno, y el Oficial de datos o la Dirección publicarla.
- **Datos de la empresa en el pie** (NIT, teléfono, WhatsApp, correo, dirección, horario y redes): siguen entre corchetes en `apps/web/src/features/site/site-content.ts`. Los entrega usted antes de publicar el sitio.
- **CAPTCHA** de los formularios públicos: B43.
- **Retención de los formularios recibidos** y consulta de las elecciones de cookies: B42.
- **Boletín** y su suscripción: no estaba en el alcance. Cuando exista, debe consultar la lista de bajas antes de enviar.
- **Un mismo visitante que escribe dos veces** queda como dos prospectos y dos terceros. Los duplicados de terceros se pueden fusionar en Terceros.
- **Revisión externa**: es un bloque crítico.
- Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron. Son los únicos archivos que no pasan la revisión de formato en su equipo.

## Lineamientos visuales (B22A)

Componentes de `@arza/ui`, colores de `tokens.css` y Montserrat. Los formularios muestran el mensaje junto al campo y el resumen de errores (FormSummary). Lo que no funciona todavía dice «Disponible pronto». Los tres botones del aviso de cookies son iguales en tamaño y jerarquía, como exige el numeral 20.4.
