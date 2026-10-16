# Cierre del bloque B16: Notificaciones, correo, comentarios y adjuntos

- Fecha: 16/10/2026
- Rama: `feat/b16-notificaciones-correo-comentar`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, ARZA ONE **avisa**: a quien le asignan o le escalan una tarea, a quien mencionan
en un comentario y, ante una alerta de seguridad, a Administración y Dirección. Los avisos llegan a
la campanita y, según la preferencia de cada persona, también por correo. Fuera de la jornada,
**esperan** al inicio de la siguiente (Protocolo de Desconexión Laboral PT-GTH-001, Ley 2191 de
2022). Además, cualquier registro puede tener **comentarios con menciones y adjuntos**. Usted aprobó
el plan con las seis recomendaciones; las decisiones están al final.

| Pieza                       | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bandeja de salida publicada | Cada 15 segundos el worker toma los eventos pendientes (por ejemplo «se asignó una tarea») y los convierte en avisos. Cada evento se guarda con sus avisos **todo o nada**: si el worker se apaga a mitad, nada queda a medias y el evento se procesa en la siguiente pasada, **una sola vez** |
| Campanita                   | En la barra superior, con la cifra de avisos sin leer y los cinco más recientes. Al abrir uno, queda leído y lleva a la tarea, el tercero o el trámite                                                                                                                                         |
| Centro de avisos            | Página **Avisos** con todos, el filtro «Sin leer» y «Marcar todos como leídos»                                                                                                                                                                                                                 |
| Envío diferido              | Un aviso a un colaborador fuera de la jornada (horario laboral y festivos de la empresa) se entrega al inicio de la siguiente: **uno del sábado llega el lunes a las 8:00 a. m.**, y si el lunes es festivo, el martes                                                                         |
| Avisos urgentes             | La excepción: cada plantilla tiene la marca **«Urgente»**. Un aviso urgente llega al instante, de día o de noche, y siempre por correo. Al empezar solo la **alerta de seguridad** es urgente                                                                                                  |
| Correo institucional        | El correo lleva el texto de la plantilla, un botón **«Abrir en ARZA ONE»** y la firma de ARZA TECH. Si el servidor de correo falla, se reintenta a los 1, 5, 15 y 60 minutos; al quinto fallo queda «fallido»                                                                                  |
| Plantillas                  | **Administración › Plantillas de aviso**: el asunto y el texto de cada tipo de aviso, con los datos que puede usar (por ejemplo `{{tarea}}`). Cada cambio guarda una **versión nueva**                                                                                                         |
| Preferencias                | **Mi perfil › Preferencias de aviso**: cada persona decide qué avisos quiere también por correo. Los urgentes no se pueden apagar                                                                                                                                                              |
| Comentarios y adjuntos      | Pestaña **«Comentarios y adjuntos»** en la ficha del tercero, y la misma sección al final de cada trámite. Se menciona a un colega **escribiendo su correo**, como al delegar una tarea; el mencionado recibe un aviso                                                                         |

**Tablas nuevas** (todas separadas por empresa con la seguridad por fila): `ntf_templates`,
`ntf_notifications`, `ntf_deliveries`, `ntf_preferences`, `core_comments` y `core_attachments`.
Diccionario en [`ntf.md`](../manual/datos/ntf.md). Un comentario **no se puede editar**, ni
siquiera desde la base de datos; solo retirar.

**Permisos:** no se creó ninguno. Las plantillas usan el que ya existía, «Administrar plantillas de
avisos» (`ntf.template.manage`, del Administrador de plataforma).

## Cómo se probó

| Prueba                                      | Qué demuestra                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sábado → lunes 8:00 (criterio del bloque)   | Un aviso de una tarea generado el sábado queda para el lunes a las 8:00 a. m., en la aplicación y en el correo, y antes de esa hora no aparece. Del viernes en la noche salta el festivo del lunes al martes      |
| Dentro de la jornada                        | Se entrega de inmediato, con la plantilla aplicada y el enlace a la tarea                                                                                                                                         |
| El worker se reinicia (criterio del bloque) | Se simula que el worker se apaga justo antes de guardar: no queda ningún aviso y el evento sigue pendiente; la siguiente pasada lo publica una vez, y repetirla no duplica. Dos pasadas a la vez tampoco duplican |
| Eventos dañados                             | Un evento con datos incorrectos se reintenta sin detener a los demás y al quinto intento se deja                                                                                                                  |
| Correo                                      | Llega de verdad a Mailpit con el marco institucional y el enlace; dos pasadas a la vez lo envían una sola vez; si falla, espera y reintenta, y al quinto intento queda fallido                                    |
| Urgentes y preferencias                     | La alerta de seguridad llega al instante a Administración y Dirección, aun en sábado y aunque hayan apagado el correo; quien apaga el correo de un tipo lo sigue viendo en la campanita                           |
| Plantillas                                  | Cada cambio es una versión nueva; una versión vieja responde «otra persona cambió…»; un dato que el aviso no tiene (`{{monto}}`) se rechaza con un mensaje claro                                                  |
| Comentarios y adjuntos                      | Se comenta un tercero y un trámite; la mención produce el aviso; solo se adjunta un archivo propio que ya pasó el antivirus; quien ve el registro descarga; solo el autor retira                                  |
| Pantallas                                   | 18 pruebas de pantalla nuevas (campanita, centro de avisos, preferencias, plantillas, comentarios y adjuntos) y las páginas nuevas en un navegador real, sin fallas de accesibilidad en modo claro y oscuro       |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** nadie ve ni marca los avisos de otra persona. Sin el permiso no se ven ni
  editan las plantillas. Quien no tiene permiso sobre el registro no lee sus comentarios (403);
  quien no lo ve recibe «no existe» (404). El Auditor y Dirección leen comentarios pero no
  escriben. Solo el autor retira su comentario o su adjunto.
- **Aislamiento:** la empresa B no ve avisos, plantillas, comentarios ni adjuntos de la empresa A,
  ni los descarga o retira; no se puede mencionar a alguien de otra empresa.
- **Auditoría:** las 9 rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una. La pantalla de Auditoría los muestra en español («Comentó un registro», «Cambió una
  plantilla de aviso», «Leyó un aviso»…).

### Resultado de `pnpm check`

En verde el 16/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                                                                              |
| Estilo y tipos          | Sin problemas                                                                                                                                                    |
| Fronteras entre módulos | Sin problemas: `ntf` usa `iam`, `core`, `doc`, `party` y `wf` solo por sus índices; el worker, por `@arza/api/ntf`                                               |
| Código sin usar (knip)  | Sin problemas                                                                                                                                                    |
| Pruebas unitarias       | API 290, web 296, contratos 81, worker 38, interfaz 19, configuración 24, guiones 140, plantillas 4                                                              |
| Pruebas de integración  | API 548 en 59 archivos (8 nuevos de avisos), worker 20 (uno nuevo de avisos de principio a fin con Mailpit)                                                      |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la API en integración: 85,22 %, mínimo 85 %)                                                                 |
| Pruebas en navegador    | Todas, incluidas 8 nuevas de avisos y la pestaña nueva del tercero, en modo claro y oscuro                                                                       |
| Búsqueda de secretos    | Ninguno                                                                                                                                                          |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo; y **sobre la versión anterior** en mi base local, que ya tenía las 9 migraciones de antes |

**Cosas que debe saber de esta verificación:**

1. **Las mismas carpetas ajenas de B14 y B15** (`apps/api/.agents`, `.claude`, `.windsurf`) no son
   del proyecto; revisé el formato y el estilo sin ellas, y corrí las pruebas un paquete a la vez.
2. **Tres fallas que ya existían y que salieron a la luz con las pruebas nuevas**, corregidas en su
   causa (ninguna prueba se debilitó):
   - Cargar el catálogo de permisos desde dos lugares a la vez podía fallar por «escribió sin
     auditoría». Ahora el intento queda auditado (`access-seed.ts`).
   - El historial de papeles de un tercero salía en desorden cuando dos papeles eran del mismo día.
     Ahora se ordena también por la hora de registro; usted lo vería igual en la pantalla.
   - Tres ayudas de las pruebas ordenaban la auditoría por la hora, y dos eventos del mismo
     milisegundo salían al azar. Ahora usan el orden de la cadena de auditoría (`seq`).
3. **Las pruebas de integración de la API corren de a cuatro archivos a la vez** (antes, siete en
   este equipo de ocho núcleos). Con los 8 archivos nuevos, las conexiones a la base se agotaban al
   preparar los datos. Las pruebas son las mismas; tardan unos 7 minutos.
4. **knip** pedía declarar el índice de `ntf` como punto de entrada, igual que el de `wf`, porque el
   worker lo usa por el paquete.

## Cómo lo prueba usted, paso a paso

Necesita las cuentas de los cierres anteriores: **Ana** (Administrador de plataforma y Dirección),
**Finanzas Uno** y **Finanzas Dos** (Administrativo y financiero).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido), uno por uno:

```bash
git switch feat/b16-notificaciones-correo-comentar
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

El segundo conecta el paquete de plantillas de correo; el tercero crea las tablas nuevas; el
cuarto carga las plantillas de aviso de cada empresa. Si `pnpm dev` estaba encendido, deténgalo
con Ctrl + C y vuelva a escribir `pnpm dev` (así arranca también el worker nuevo).

**Importante sobre la hora:** si prueba fuera de la jornada (antes de las 8:00, de 12:00 a 1:00,
después de las 5:00 p. m., en fin de semana o festivo), los avisos **no aparecen hasta la próxima
jornada**: es justo el comportamiento pedido. Para verlos ya, haga primero el paso 2.

### 2. Plantillas y la marca «urgente»

1. Entre con **Ana** en http://localhost:3000. En **Administración** aparece **Plantillas de
   aviso**. Ábrala: hay cuatro, y la «Alerta de seguridad» dice **Urgente**.
2. En «Le asignaron una tarea», escriba en el texto `{{monto}}` y guarde: sale el mensaje de que ese
   dato no existe. Quítelo.
3. Si está fuera de la jornada, marque **«Urgente»** en «Le asignaron una tarea» y pulse **«Guardar
   versión nueva»** (dice «Versión 2»). Al terminar las pruebas, desmárquela de nuevo.

### 3. Un aviso de tarea, en la campanita y en el correo

1. Con Ana, en **Administración › Flujos**, inicie un trámite de prueba: «Compra de sillas», monto
   `1000000`.
2. En **Mis tareas**, abra «Borrador: Compra de sillas» y, en **«Delegar la tarea»**, escriba el
   correo de **Finanzas Uno** y pulse **«Delegar»**.
3. Salga y entre con **Finanzas Uno**. En unos 15 segundos la **campanita** muestra un **1**. Ábrala:
   «Nueva tarea: Borrador: Compra de sillas». Púlsela: lo lleva a la tarea y el aviso queda leído.
4. Abra http://localhost:8025 (Mailpit): está el correo «Nueva tarea…», con el botón **«Abrir en
   ARZA ONE»** y la firma de ARZA TECH.

### 4. Centro de avisos y preferencias

1. Con Finanzas Uno, en la campanita pulse **«Ver todos los avisos»**: ahí están todos, con el
   filtro **«Sin leer»** y **«Marcar todos como leídos»**.
2. Pulse **«Preferencias»** (o **Mi perfil › Preferencias de aviso**). Desmarque «Le asignaron una
   tarea» y guarde. La «Alerta de seguridad» no tiene casilla: siempre llega por correo.
3. Con Ana, delegue otra tarea a Finanzas Uno (como en el paso 3): Finanzas Uno ve el aviso en la
   campanita, pero **en Mailpit no llega correo**.

### 5. Comentarios y adjuntos en un tercero

1. Con **Finanzas Uno**, en **Archivos**, suba un PDF cualquiera y espere a que diga **Disponible**.
2. Vaya a **Terceros**, abra uno y la pestaña **«Comentarios y adjuntos»**.
3. Escriba un comentario y, en **«Mencionar»**, el correo de **Finanzas Dos**. Pulse **«Comentar»**.
4. En **Adjuntos**, elija el PDF, escriba qué es (por ejemplo «RUT 2026») y pulse **«Adjuntar»**.
5. Entre con **Finanzas Dos**: en la campanita, «… lo mencionó en el tercero «…»». En la ficha del
   tercero puede **descargar** el adjunto, pero no tiene los botones para retirar lo que escribió
   Finanzas Uno.
6. Con Ana abra el mismo tercero: ve los comentarios, pero no el formulario para comentar (Dirección
   no edita terceros).

### 6. Una alerta de seguridad (urgente)

1. Cierre la sesión e intente entrar **cinco veces** con el correo de Finanzas Dos y una contraseña
   equivocada: la cuenta se bloquea.
2. Entre con Ana: en la campanita, **«Alerta de seguridad en ARZA ONE: una cuenta se bloqueó por
   intentos fallidos»**, y el correo en Mailpit, aunque sea de noche o fin de semana. El enlace lleva
   a **Auditoría › Seguridad**. (Desbloquee luego a Finanzas Dos en **Administración › Usuarios**.)

### 7. La auditoría

Con Ana, en **Auditoría**: «Cambió una plantilla de aviso», «Comentó un registro», «Adjuntó un
archivo a un registro», «Leyó un aviso» y «Cambió sus preferencias de aviso».

**Lo que no se puede ver a simple vista** (lo prueban las pruebas automáticas): el aviso del sábado
que aparece el lunes a las 8:00 y que ningún evento se pierde si el worker se reinicia.

## Pendientes

- **Horario personal de desconexión** (`quiet_hours` del numeral 12.3): por ahora todos usan el
  horario laboral de la empresa, como usted aprobó.
- **Comentarios visibles al cliente:** la columna `visibility` ya existe; la opción llega con el
  portal del cliente.
- **Otros eventos del numeral 13.3** (cotización aceptada, factura emitida, PQRSF recibida…): cada
  módulo agregará su aviso cuando exista.
- **Subir un archivo desde la ficha:** hoy se sube en **Archivos** y luego se adjunta; subirlo
  directo desde la pestaña es una mejora de comodidad.
- **Correos con diseño complejo (React Email):** no se necesitó; ver la decisión 1.
- **Tablero de inicio:** la tarjeta de avisos del Inicio sigue siendo informativa; el acceso es la
  campanita.

## Decisiones tomadas

Las seis que usted aprobó:

1. **Plantillas sin «React Email»:** texto con datos variables dentro de un marco HTML institucional
   hecho en el proyecto (`packages/templates`), sin bibliotecas nuevas. Todo el texto se escapa:
   lo que alguien escriba en un comentario no puede inyectar contenido en el correo.
2. **El aviso en la aplicación siempre llega; lo que se apaga es el correo.** Los urgentes no se
   apagan.
3. **Horario de la empresa para todos;** el horario personal queda pendiente.
4. **Alertas de seguridad** a quienes tienen rol Administrador de plataforma o Dirección, como
   urgentes.
5. **Comentarios:** lee quien ve el registro; no se editan; el autor los retira; por ahora son
   internos.
6. **Módulo `ntf`** con las tablas `core_comments` y `core_attachments` del manual.

Y estas, que tomé durante la construcción y le pido revisar:

7. **Para escribir hace falta poder trabajar en el registro**, no solo verlo: en un tercero, crear o
   editar terceros; en un trámite, atender tareas. Así el **Auditor**, que solo lee, no comenta, y
   tampoco **Dirección** en los terceros. Si prefiere que Dirección comente terceros, es un cambio
   de una línea.
8. **Menciones por correo**, no eligiendo de una lista: así nadie necesita ver el directorio de
   usuarios (igual que al delegar una tarea en B15).
9. **Mis avisos y mis preferencias van bajo `/v1/me/...`** (no `/v1/notifications` como sugiere el
   numeral 14.3): son de la cuenta propia y la plataforma solo permite las rutas «de la cuenta
   propia» bajo `/v1/me`.
10. **Una regla de acceso nueva, «según el registro»** (`@RequireRecordAccess()`), solo para
    `/v1/comments` y `/v1/attachments`: el tipo de registro llega en la petición, así que el permiso
    lo decide el módulo dueño. Una prueba impide usarla en otras rutas.
11. **La entrega de avisos no deja un evento de auditoría por cada aviso:** lo que se avisa ya quedó
    en la auditoría al ocurrir, y cada correo queda en `ntf_deliveries`. Quedó documentado como
    escritura técnica, igual que la última actividad de una sesión.
12. **El worker revisa cada 15 segundos** la bandeja de salida y los correos pendientes.
