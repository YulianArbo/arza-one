# Cierre del bloque B29: PQRSF, encuestas y base de conocimiento

- Fecha: 07/11/2026
- Rama: `feat/b29-pqrsf-encuestas-y-base-de-cono` (sale de la rama del B28, que aún no está unida a
  `main`)
- Estado: en revisión. No es un bloque crítico.

## Qué se construyó

El módulo **Servicio** (ficha 17.9) ya atiende **PQRSF** (peticiones, quejas, reclamos, sugerencias
y felicitaciones) con radicado y plazo en días hábiles, envía una **encuesta de satisfacción** al
resolver cada tiquete y calcula el **NPS**, y tiene una **base de conocimiento** para el equipo y
los clientes. Usted aprobó el plan con las trece recomendaciones; están al final.

| Pieza                 | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radicar en el sitio   | Página pública **/pqrsf** (enlazada desde la vitrina y el pie de página). La persona elige el tipo, escribe sus datos y lo que pasó, y acepta el tratamiento de sus datos. Al enviar ve en pantalla su **radicado** (`PQRSF-2026-0001`) y la **fecha límite**; en minutos le llega el **acuse por correo** con lo mismo                                    |
| Consultar el estado   | Página pública **/pqrsf/consulta**: con el radicado **y** el correo con que se radicó (los dos deben coincidir) ve el estado y, si ya se respondió, la respuesta                                                                                                                                                                                           |
| Plazo en días hábiles | Cuenta desde el día hábil siguiente al radicado, sin fines de semana ni festivos. Petición, queja y reclamo: 15 días; sugerencia y felicitación: 30; consulta sobre datos personales: 10; reclamo sobre datos personales: 15. Se cambian en **Administración → Parámetros → Plazos de respuesta de PQRSF**                                                 |
| Bandeja de PQRSF      | **Servicio → PQRSF**. Vistas: abiertas, mías, por clasificar, **por aprobar**, **por vencer**, **vencidas**, respondidas y cerradas. La que vence primero, arriba                                                                                                                                                                                          |
| Registro interno      | **«Registrar una PQRSF»** para lo que llegó por teléfono, correo o en persona. Pide un correo o un teléfono                                                                                                                                                                                                                                                |
| Recorrido             | Radicada → clasificada → en trámite → respondida → cerrada. **Clasificar** (tipo, si trata de datos personales y responsable), **redactar la respuesta**, **enviarla a aprobación**, **aprobarla** o **devolverla con un motivo**, y cerrar. **Nadie aprueba la respuesta que redactó**                                                                    |
| Al aprobar            | La respuesta sale **por correo** a quien presentó la PQRSF                                                                                                                                                                                                                                                                                                 |
| Datos personales      | Si al clasificar se marca que trata de datos personales, toma el plazo de la Ley 1581, queda **«Trasladada a Privacidad»** y se avisa al **Oficial de protección de datos**, que ahora puede abrir las PQRSF                                                                                                                                               |
| No conformidad        | Al redactar una queja o un reclamo hay que decir si es **procedente**; si lo es, al aprobar se avisa a **Calidad** para que registre la no conformidad                                                                                                                                                                                                     |
| Avisos de plazo       | Cuando faltan **dos días hábiles** y cuando **vence**, el responsable y el líder de Servicio reciben un aviso. No son urgentes: llegan en horario laboral                                                                                                                                                                                                  |
| Encuesta al resolver  | Al resolver un tiquete, quien lo pidió recibe por correo un **enlace personal** (vale 30 días, se responde una vez) con dos preguntas: recomendación de 0 a 10 y satisfacción de 1 a 5, más un comentario opcional. Si el tiquete no tiene correo, la ficha dice «Sin correo para enviarla». El tiquete ahora tiene el campo **«Correo de quien reporta»** |
| Encuestas y NPS       | **Servicio → Encuestas y NPS**: el **NPS** (de -100 a 100), el promedio de satisfacción, cuántas se enviaron y respondieron, y cada respuesta, por periodo. Servicio puede **cambiar los textos** de las preguntas o **apagar** la encuesta                                                                                                                |
| Base de conocimiento  | **Servicio → Base de conocimiento**: artículos con tema y público (equipo interno o clientes). Servicio los escribe (nacen en borrador), los publica y los archiva. **Todo el equipo interno** los lee publicados, aunque no trabaje en Servicio. Los de clientes se verán en el portal (B30)                                                              |

## Cómo se probó

### Los criterios del bloque

| Criterio                                                                         | Prueba                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radicar una PQRSF en el sitio entrega el radicado en pantalla y por correo       | `pqrsf.int.test.ts` (radicado y fecha límite en la respuesta), `care-mail.int.test.ts` (el acuse con radicado y fecha), `care-site.test.tsx` y `care.spec.ts` (en pantalla) |
| El plazo se calcula en días hábiles                                              | `pqrsf.int.test.ts`: crea un festivo el día hábil siguiente y comprueba que la fecha límite lo salta; `pqrsf-rules.test.ts` (plazo por tipo y por Ley 1581)                 |
| Un tiquete que supera el 80 % de su plazo alerta al responsable y al líder       | Del B28 (`ticket-clock.int.test.ts`), sigue en verde. Para PQRSF, el aviso de «por vencer» y «vencida» en `care-mail.int.test.ts`                                           |
| Al resolver un tiquete se envía la encuesta y la respuesta alimenta el indicador | `care-mail.int.test.ts`: llega al correo, se responde una vez, aparece en el NPS; deja el evento `service.survey.answered` para el indicador del B39                        |
| Respuesta aprobada                                                               | `pqrsf.int.test.ts`: quien redactó no aprueba (también lo impide la base de datos); otra persona devuelve con motivo y luego aprueba                                        |
| Traslado a privacidad o a calidad                                                | `pqrsf.int.test.ts`: aviso al Oficial de datos con el plazo de la Ley 1581; aviso a Calidad con la queja procedente                                                         |

### Permiso denegado, aislamiento entre empresas y auditoría

- `care-access.int.test.ts`: Comercial lee y no clasifica; el colaborador y el Contador no entran;
  el Líder técnico no aprueba ni cambia la encuesta; los resultados no son para el colaborador;
  Servicio de otra empresa no ve ni toca PQRSF ni resultados de encuestas.
- `knowledge.int.test.ts`: todo rol interno lee lo publicado y solo Servicio escribe; un borrador
  no existe para quien no administra; otra empresa no ve los artículos.
- La ronda de auditoría (`write-routes-audited.int.test.ts`) recorre las 17 rutas nuevas que
  escriben, incluidas las públicas, y exige su evento de auditoría.

### Resultado de las verificaciones

Corrí cada paso de `pnpm check` en este equipo (07/11/2026). Todos los pasos quedaron en verde,
con dos salvedades del equipo, no del código, que explico abajo.

| Paso                                     | Resultado                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Formato                                  | Sin problemas en los archivos del repositorio (ver salvedad 1)                                                                    |
| Tipos, análisis de código, límites, knip | Sin errores                                                                                                                       |
| Pruebas unitarias                        | Contratos 188 · web 669 · API 406 · worker 42 · interfaz 44 · plantillas 25 · infraestructura 177 · configuración 24: todas pasan |
| Cobertura unitaria                       | Web 95,6 % de líneas y 85,3 % de ramas; API 94,5 % y 87,7 %; worker 93,5 % y 88,9 % (umbral: 90 % y 85 %)                         |
| Pruebas con base de datos                | API 1217 pruebas en 145 archivos y worker 25: todas pasan (ver salvedad 2). Las 48 de Servicio, juntas y en verde                 |
| Ronda de auditoría                       | Las 282 rutas que escriben dejan su evento, incluidas las 17 nuevas                                                               |
| Compilación                              | Sin errores                                                                                                                       |
| Navegador (accesibilidad y recorridos)   | 304 pruebas en verde, incluidas las 19 nuevas (cada pantalla nueva en modo claro y oscuro, sin violaciones WCAG 2.2 AA)           |
| Secretos                                 | Ninguno                                                                                                                           |

**Salvedad 1.** El paso de formato revisa también la carpeta local `.agents/`, que no es del
repositorio (herramientas de asistencia, sin seguimiento en git); por eso ahí falla en este equipo.
En la integración continua esa carpeta no existe.

**Salvedad 2.** Este equipo tiene 7,6 GB de memoria. Al correr todas las pruebas con base de datos a
la vez, fallan al azar archivos distintos en cada intento (por tiempo agotado o «no se pudo iniciar
la transacción»), siempre de módulos que este bloque no toca, y todos pasan al repetirlos. Por la
misma razón, la cobertura de las pruebas con base de datos no alcanzó a imprimirse aquí: la medirá la
integración continua del pull request. Lo mismo pasó una vez con la prueba de arranque de la API,
que pasa sola.

Las pruebas encontraron y corregí, antes de cerrar: nombres de eventos que la base de datos no
acepta (sin guion bajo), un paso de la encuesta que no dejaba su rastro en la auditoría, un índice
de la firma que el modelo de Prisma no declaraba desde el B27, y la cuenta del catálogo de permisos,
que el B28 no había actualizado.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita **dos personas con el rol «Servicio al cliente»** (por ejemplo
**Sofía** y **Mateo** del B28), una con **«Oficial de protección de datos»** y una con **«Calidad»**.
Los correos no salen a internet: en su equipo llegan al buzón de prueba **Mailpit**, que se abre en
el navegador en **http://localhost:8026**.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b29-pqrsf-encuestas-y-base-de-cono
```

```bash
pnpm infra:up
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

La cuarta crea las tablas nuevas; la quinta carga los plazos de PQRSF, la encuesta de fábrica y los
permisos nuevos. Su archivo `.env` ya tiene la línea `PUBLIC_SITE_TAX_ID=900000000-0` (el NIT de
prueba de ARZA TECH): así el formulario público sabe a qué empresa llegan las PQRSF.

> Si `pnpm infra:up` termina con «Falló pnpm db:seed:demo» y más arriba dice «violates check
> constraint» (o si `pnpm db:migrate` dice que una migración «fue modificada»), su base de datos
> local quedó con un borrador anterior de una migración que cambié mientras construía. Escriba
> `pnpm infra:reset` y repita los pasos: borra solo los datos de prueba locales, no los reales.

### 2. Radicar una PQRSF como cualquier persona

1. Sin iniciar sesión, abra **http://localhost:3000/pqrsf** (o en la vitrina, «Radicar o consultar
   una PQRSF»).
2. Pulse «Radicar» sin llenar nada: le dice qué falta, incluida la autorización de datos.
3. Elija **Queja**, escriba un nombre, un correo inventado (por ejemplo `ana@ejemplo.test`), un
   asunto y la descripción; marque la autorización y pulse «Radicar».
4. Debe ver el **radicado** y la **fecha límite**. Cuente los días: 15 hábiles desde mañana, sin
   sábados, domingos ni festivos.
5. Abra **Mailpit** (http://localhost:8026): en menos de un minuto llega el **acuse** con el mismo
   radicado y fecha.

### 3. Clasificar, responder y aprobar

1. Entre como **Sofía** → **Servicio** → **PQRSF**. La suya aparece en «Por clasificar».
2. Ábrala → **«Clasificar»**: elija a Sofía como responsable. → **«Redactar la respuesta»**: escriba
   la respuesta y diga si la queja es **procedente** (elija «Sí»). → **«Enviar a aprobación»**.
3. Note que Sofía **no** ve el botón «Aprobar y enviar»: no puede aprobar lo que redactó.
4. Entre como **Mateo**: en la vista «Por aprobar» está la PQRSF. Pruebe **«Devolver»** con un
   motivo; entre como Sofía, verá el motivo en amarillo; corrija y envíe de nuevo.
5. Como **Mateo**, **«Aprobar y enviar»**. En Mailpit llega la **respuesta**. La persona de
   **Calidad** tiene un aviso (campana) de la no conformidad.

### 4. Consultar el estado

1. Sin sesión, abra **http://localhost:3000/pqrsf/consulta**. Escriba el radicado y el correo: ve
   «Respondida» y la respuesta.
2. Cambie una letra del correo: le dice que no encontró una PQRSF con esos datos.

### 5. Datos personales

1. Radique otra en el sitio, de tipo **Petición**. Como Sofía, clasifíquela marcando **«Consulta
   sobre datos personales»**.
2. El plazo cambia a **10 días hábiles** y aparece «Trasladada a Privacidad». La persona con rol
   **Oficial de protección de datos** recibe el aviso y puede abrir la PQRSF.

### 6. Encuesta al resolver un tiquete

1. Como Sofía, **Servicio → Nuevo tiquete**: llene lo básico y en **«Correo de quien reporta»**
   escriba un correo inventado. Asígnelo, empiécelo y **resuélvalo**.
2. En Mailpit llega «¿Cómo le fue con su solicitud…?». Abra el enlace: elija un número de 0 a 10 y
   otro de 1 a 5, escriba un comentario y envíe. Vuelva a abrir el enlace: dice que ya se respondió.
3. **Servicio → Encuestas y NPS**: aparece la respuesta y el NPS. En la ficha del tiquete, pestaña
   **Datos**, «Encuesta de satisfacción» dice «Respondida» con las calificaciones.
4. En la misma pantalla, **«Cambiar la encuesta»** permite cambiar las preguntas o apagarla.

### 7. Base de conocimiento

1. Como Sofía, **Servicio → Base de conocimiento → «Escribir un artículo»**. Separe párrafos con una
   línea en blanco y haga una lista empezando líneas con «- ». Guarde: queda en **borrador**.
2. Entre con una persona de otro rol (por ejemplo **Ana**, Comercial): no ve el borrador.
3. Como Sofía, **«Publicar»**. Ana ya lo ve y puede buscarlo; no ve «Editar» ni «Archivar».

### 8. Cambiar los plazos

**Administración → Parámetros → Plazos de respuesta de PQRSF → «Programar un cambio»**. El cambio
rige desde la fecha que elija; las PQRSF ya radicadas conservan su plazo.

## Pendientes

- **Vincular un tercero desde la pantalla**: la API ya lo permite al clasificar (`party_id`), pero
  la ficha aún no tiene el buscador de Terceros; hoy se conserva el que traiga la PQRSF.
- **Privacidad completa (B42)**: la PQRSF trasladada se sigue respondiendo desde Servicio; el B42
  recogerá el evento `service.pqrsf.transferred` para llevarla a sus solicitudes de titulares.
- **No conformidades (B38)** e **indicador de satisfacción (B39)**: los eventos
  `service.pqrsf.nonconforming` y `service.survey.answered` ya quedan listos para esos bloques.
- **Portal del cliente (B30)**: radicar PQRSF y leer los artículos «para clientes» desde el portal.
- **Sitio público completo (B41)**: las páginas de PQRSF ya funcionan; el B41 las integrará al
  diseño final del sitio. Sin CAPTCHA por ahora (B43).
- **En producción** hay que poner en `PUBLIC_SITE_TAX_ID` el NIT real registrado en Administración;
  sin esa línea el formulario público responde que no está disponible (anotado en
  `docs/runbooks/servidor-de-pruebas.md`).

## Decisiones aprobadas (06/11/2026)

1. La rama sale de la del B28 (pull request apilado).
2. Plazos por tipo: petición, queja y reclamo 15; sugerencia y felicitación 30; datos personales:
   consulta 10 y reclamo 15 días hábiles, desde el día hábil siguiente. Son un parámetro editable.
3. La empresa del formulario público se define con el NIT en la configuración
   (`PUBLIC_SITE_TAX_ID`).
4. La consulta de estado pide radicado y correo.
5. Datos personales: plazo de la Ley 1581, «Trasladada a Privacidad», aviso al Oficial de datos y
   evento para el B42; se responde desde la PQRSF mientras tanto.
6. Queja o reclamo procedente: aviso a Calidad y evento para el B38.
7. Aprueba otra persona con el permiso «Aprobar respuestas de PQRSF», nunca quien redactó; devolver
   exige motivo.
8. La encuesta va al correo del usuario que pidió el tiquete o al nuevo «Correo de quien reporta»;
   sin correo, «Sin correo»; el enlace vale 30 días y se responde una vez; si el tiquete se reabre
   y se resuelve otra vez, sale un enlace nuevo.
9. Encuesta fija (0 a 10, 1 a 5 y comentario) con textos editables y encendido; NPS = % promotores
   menos % detractores.
10. Base de conocimiento en texto sencillo; permiso nuevo «Leer la base de conocimiento» para todos
    los roles internos.
11. Avisos de PQRSF a dos días hábiles del vencimiento y al vencer; no urgentes.
12. La aceptación del aviso de privacidad queda en la PQRSF; campo trampa y límite de envíos, sin
    CAPTCHA.
13. Fuera de este bloque: portal (B30), sitio completo (B41), privacidad completa (B42), calidad
    (B38), indicadores (B39) y correo entrante.

Además, como lo anuncié en el plan: el radicado, el correo y la llave de la encuesta viajan dentro
de la petición y no en la dirección web (el capítulo 14 los ponía en la dirección), para que no
queden en los registros del servidor.

## Decisiones tomadas durante la construcción

- **El Oficial de protección de datos puede ver las PQRSF** (permiso «Ver PQRSF»): sin él no podría
  abrir las que se le trasladan (decisión 5). Ve todas, no solo las de datos personales, hasta que
  llegue el B42. Si prefiere otra cosa, dígamelo.
- **La consulta pública y la apertura de la encuesta quedan en la auditoría**, como cuando un
  cliente abre una cotización: así se sabe quién consultó qué y cuándo.
- **El código de Servicio se mide ahora con las pruebas contra la base de datos**, como el de los
  demás módulos (en el B28 quedó por fuera de esa lista).
- **El trabajo automático del B28 y del B29 se puede pasar por una empresa a la vez.** El
  programado sigue recorriendo todas; las pruebas usan una sola, porque antes una prueba con el reloj
  adelantado alteraba los tiquetes de otra y fallaba a veces.
