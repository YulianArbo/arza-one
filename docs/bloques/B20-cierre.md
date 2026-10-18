# Cierre del bloque B20: Formatos digitales y generación de documentos

- Fecha: 18/10/2026
- Rama: `feat/b20-formatos-digitales-y-generacio`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, **Calidad diseña los formatos del SGC en la plataforma, sin programar**, las
personas los **diligencian en pantalla** (con borrador), los que lo requieren **pasan por
aprobación** y cada registro terminado queda en un **PDF con el encabezado y el pie
institucionales**. Los **cinco formatos piloto** ya vienen configurados. Usted aprobó el plan con
las diez recomendaciones; las decisiones están al final.

| Pieza                           | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diseñador de formatos           | Documentos › **Formatos digitales** › **«Nuevo formato»**. Se arman secciones y campos (texto, párrafo, número, fecha, lista, sí/no, verificación con «Cumple / No cumple / No aplica» y tabla), se marcan los obligatorios y se ordenan con flechas. Se guarda en **borrador** |
| Versiones del formato           | Publicar deja el formato **fijo**: ya no se puede cambiar. Para cambiarlo se crea una **versión nueva** con el mismo código; al publicarla, la anterior queda **retirada**                                                                                                      |
| Un registro conserva su versión | Cada registro guarda **la versión del formato con que se creó** y siempre se muestra e imprime con ella, aunque después se publique otra (criterio del bloque). La base de datos lo impide cambiar                                                                              |
| Diligenciar                     | **«Diligenciar»** en la lista de formatos. Se guarda **incompleto como borrador** cuantas veces haga falta; al **«Enviar»** la plataforma exige lo obligatorio. Cada registro recibe un código como `FT-COM-002-2026-0001`                                                      |
| Aprobación                      | Los formatos que la piden van a **Dirección** o a **Calidad**, que recibe la tarea en «Mis tareas». **Aprobar** o **Devolver** (con motivo). **Quien diligenció no aprueba**                                                                                                    |
| PDF del registro                | Al terminar, la plataforma arma el PDF en unos **20 segundos**, con el encabezado institucional (logo, código, versión, página X de Y) y el pie (razón social, NIT y «copia no controlada»). Se descarga con **«Descargar PDF»** (criterio del bloque)                          |
| Plantillas de salida            | Administración › **Plantillas de salida**: si un formato necesita otra presentación del PDF, se escribe una plantilla en HTML o se sube un **Word** con marcas como `{cliente}`. Tiene borrador, vista previa con datos de ejemplo, publicación y versiones                     |
| Copia no controlada             | El PDF que se descarga de la versión **vigente** de un documento del SGC ahora lleva abajo la leyenda **«Copia no controlada»**; las versiones anteriores salen sin ella                                                                                                        |
| FT-SGC-002 al revisar           | Si el formato está publicado, **Calidad no puede aprobar la revisión de una versión sin su Lista de Verificación diligenciada y enviada**. El enlace aparece en el paso de revisión                                                                                             |
| FT-SGC-001                      | Lo **llena la plataforma** con los datos de cada Solicitud de Acción Documental (B19). En la ficha de la solicitud está **«Ver el FT-SGC-001 de esta solicitud, con su PDF»**                                                                                                   |

**Los cinco formatos piloto** (campos en borrador, para validar contra los originales):

| Formato    | Nombre                                    | Aprobación                 | Se une a                           |
| ---------- | ----------------------------------------- | -------------------------- | ---------------------------------- |
| FT-COM-002 | Acta de Revisión de Requisitos y Arranque | Dirección                  | Un tercero (cliente)               |
| FT-COM-003 | Conocimiento del Cliente                  | Dirección                  | Un tercero; **confidencial**       |
| FT-TEC-001 | Acta de Entrega y Aceptación              | Dirección (ver Pendientes) | Un tercero                         |
| FT-SGC-002 | Lista de Verificación Documental          | Termina al enviarla        | Una versión de un documento        |
| FT-SGC-001 | Solicitud de Acción Documental            | La llena la plataforma     | Una Solicitud de Acción Documental |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `doc_form_templates` (los
formatos y sus versiones), `doc_form_records` (los registros diligenciados) y
`doc_output_templates` (las plantillas de salida). `doc_versions` guarda además su copia con la
leyenda. Diccionario en [`doc.md`](../manual/datos/doc.md).

**Rutas nuevas de la API:** 19 (formatos, registros, plantillas de salida, vistas previas y descarga
del PDF), en [`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`.

**Trabajo programado nuevo** en el worker: cada 20 segundos arma los PDF pendientes (de registros
terminados y copias de versiones vigentes). Ver [`apps/worker/README.md`](../../apps/worker/README.md).

## Cómo se probó

| Prueba                                     | Qué demuestra                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encabezado y pie en el PDF (criterio)      | Se genera un PDF real con Gotenberg de un registro de **varias páginas** y se lee su texto: **cada página** trae el código, la versión, «Página X de Y», la razón social, el NIT y «Copia no controlada»    |
| El registro conserva su versión (criterio) | Un registro creado con la versión 1 sigue mostrando y validando con sus campos después de publicar la versión 2; un registro nuevo usa la 2. La base de datos rechaza cambiarle la versión                  |
| Copia no controlada                        | La descarga de la versión vigente es la copia con la leyenda; las versiones anteriores salen sin ella                                                                                                       |
| Aprobación                                 | Enviar exige lo obligatorio; quien diligenció no aprueba (ni desde «Mis tareas»); devolver exige el motivo y vuelve a borrador; aprobar termina y pide el PDF                                               |
| FT-SGC-002 y FT-SGC-001                    | Aprobar la revisión de una versión sin la lista enviada responde que falta; con ella, pasa. Cada solicitud tiene un solo FT-SGC-001, con sus datos                                                          |
| Plantillas de salida                       | HTML con error de sintaxis se rechaza con el detalle; Word con marcas se llena; publicada queda fija; un formato no se publica con una plantilla en borrador                                                |
| Pantallas                                  | Pruebas de pantalla del diseñador, el diligenciamiento, la ficha, las plantillas y la lista de verificación, y las pantallas nuevas en un navegador real sin fallas de accesibilidad en modo claro y oscuro |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin rol o desde el portal no hay formatos ni registros. Quien solo consulta
  documentos no diseña ni diligencia; diseñar y las plantillas de salida exigen
  `doc.form_template.manage`; aprobar exige `doc.form_record.approve`. El Colaborador solo ve sus
  propios registros y **el FT-COM-003 (confidencial) solo lo ve quien debe**.
- **Aislamiento:** la empresa B no ve, no diligencia, no aprueba ni descarga los formatos, registros
  o plantillas de la A, y cada empresa lleva sus propios consecutivos `FT-…`.
- **Auditoría:** las rutas nuevas que escriben están en el recorrido de B11 (que exige un evento por
  cada una). Cada diseño, publicación, retiro, registro, envío, aprobación, devolución y descarga de
  PDF deja su evento, con su nombre en español en la pantalla de auditoría.

### Resultado de `pnpm check`

La verificación completa está en curso; aquí quedará su resultado paso a paso.

## Cómo lo prueba usted, paso a paso

Necesita **tres personas** de la empresa de demostración, porque quien diligencia no aprueba:
**Ana** y **Carlos** (Calidad) y **Laura Díaz** (Dirección), como en el cierre de B19. Use solo
datos de prueba.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b20-formatos-digitales-y-generacio
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

La tercera crea las tablas nuevas; la cuarta configura los cinco formatos piloto y sus dos flujos de
aprobación. Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`.

Si aún no tiene a Laura Díaz, invítela (acepte desde Mailpit, http://localhost:8025) y dele el rol:

```bash
pnpm iam:invitar --empresa demo-uno --correo direccion@demo-uno.test --nombre "Laura Díaz"
```

```bash
pnpm iam:asignar-rol --correo direccion@demo-uno.test --rol DIRECCION
```

### 2. Diligenciar y aprobar un acta (FT-COM-002)

1. Entre con **Ana** en http://localhost:3000 → **Documentos** → botón **«Formatos digitales»**.
   Verá los cinco formatos piloto.
2. En **FT-COM-002** pulse **«Diligenciar»**. Elija un tercero de prueba, llene algunos campos y
   pulse **«Guardar borrador»**: se guarda aunque falten datos.
3. Pulse **«Enviar»** sin llenar lo obligatorio: la pantalla le dice qué falta. Complételo y envíe.
4. Entre con **Laura Díaz** → **«Mis tareas»** (o Documentos › Formatos digitales › **«Registros
   diligenciados»**) → el registro → **«Aprobar»**. Note que **Ana no tiene ese botón**: quien
   diligencia no aprueba.
5. Espere unos 20 segundos y recargue la ficha: pulse **«Descargar PDF»**. Revise que **cada
   página** tenga el encabezado (logo, código, versión, «Página X de Y») y el pie (razón social,
   NIT y «Copia no controlada»).
6. Pruebe **«Devolver»** en otro registro: pide el motivo y el registro vuelve al borrador de Ana.

### 3. Una versión nueva del formato no cambia los registros viejos

1. Con **Ana**, abra **FT-COM-002** → **«Nueva versión»**. Agregue un campo (por ejemplo
   «Observaciones adicionales») → **«Guardar borrador»** → **«Publicar»**.
2. Abra el registro del paso 2: sigue con **los campos de la versión 1** y su PDF no cambia.
3. Diligencie uno nuevo: ya trae el campo agregado.

### 4. Diseñar un formato propio

Formatos digitales → **«Nuevo formato»**: escriba un código (por ejemplo `FT-SGC-099`), un nombre,
agregue una sección y campos de distintos tipos, pulse **«Guardar borrador»**, luego **«Vista
previa»** para ver cómo quedará la hoja y por último **«Publicar»**.

### 5. Lista de Verificación al revisar una versión (FT-SGC-002)

1. Lleve una versión de un documento hasta **«Revisión de Calidad»**, como en el cierre de B19.
2. Con **Carlos**, en la pestaña **Versiones** verá **«Diligenciar la Lista de Verificación
   (FT-SGC-002)»**. Si intenta aprobar la revisión antes, la plataforma le dice que falta.
3. Diligénciela, envíela y apruebe la revisión.

### 6. FT-SGC-001 de una solicitud

Abra cualquier Solicitud de Acción Documental (Documentos › Solicitudes) y pulse **«Ver el FT-SGC-001
de esta solicitud, con su PDF»**: la plataforma ya lo llenó con los datos de la solicitud.

### 7. Copia no controlada

En la ficha de un documento **vigente**, descargue el PDF: abajo de cada página dice **«Copia no
controlada»**. (Si el documento se publicó antes de este bloque, la copia se arma en los primeros
20 segundos con `pnpm dev` encendido.)

### 8. Plantillas de salida

Administración → **Plantillas de salida** → **«Nueva plantilla»**. Escriba un código, un nombre y un
HTML sencillo como `<p>Cliente: {{cliente}}</p>`, guarde, pulse **«Vista previa»** y **«Publicar»**.
Si escribe algo mal (por ejemplo `{{#if}}` sin cerrar) le dice el error. También puede elegir el tipo
**Word** y subir un `.docx` con marcas como `{cliente}`.

### 9. Confidencial (FT-COM-003)

Diligencie un **FT-COM-003** con Ana. Entre con una persona sin permiso sobre lo confidencial (por
ejemplo un Colaborador): **no lo ve** en la lista de registros.

## Pendientes

- **Validar los campos de los cinco formatos y el encabezado contra los originales.** Los armé con
  lo que dice el manual; quedan marcados como borrador para que Calidad los compare con los
  formatos en papel y los ajuste desde el diseñador (sin programar).
- **Logo único:** todas las empresas usan el logo de ARZA del manual. El logo por empresa queda
  para cuando se pida.
- **FT-TEC-001 lo aprueba Dirección, no el Líder Técnico:** la matriz de permisos del capítulo 15.3
  no le da al Líder Técnico el permiso de aprobar registros. Si quiere que lo apruebe él, hay que
  cambiar la matriz (decisión suya).
- **FT-COM-002 unido a la oportunidad comercial:** cuando exista el CRM (**B22**). Hoy se une al
  tercero.
- **Firma del FT-TEC-001 por el cliente:** con la firma electrónica y el portal (**B25/B27**).
- **FT-COM-003 unido a la debida diligencia:** cuando exista ese módulo; hoy se une al tercero.
- **Vista previa de las plantillas Word:** muestra la lista de marcas que encontró, no la hoja
  armada.
- **Los PDF protegidos con contraseña** que suba alguien no reciben la leyenda «Copia no
  controlada»; se descargan como están.
- **Quien pidió una solicitud** (si solo ve lo propio) no ve el FT-SGC-001 que llenó la
  plataforma; Calidad sí.
- **En el diseñador no se elige el documento del Listado Maestro** al que pertenece el formato; los
  pilotos ya vienen unidos.

## Decisiones tomadas

1. **Campos de los formatos sacados del manual**, marcados como borrador para validar
   (recomendación 1).
2. **FT-SGC-001 es la salida de la Solicitud de Acción Documental de B19**: no se duplica como un
   formato que la gente llena; lo llena la plataforma, uno por solicitud (recomendación 2).
3. **Encabezado del SGC con el logo de ARZA y pie con razón social, NIT y «Copia no controlada»**
   (recomendaciones 3 y 8). La leyenda se pone con Gotenberg, sin bibliotecas nuevas.
4. **FT-SGC-002 obligatorio antes de aprobar la revisión**, solo si el formato está publicado
   (recomendación 4); así se puede retirar sin bloquear las revisiones.
5. **Aprobadores:** FT-COM-002 y FT-COM-003 Dirección; FT-TEC-001 también Dirección por la matriz
   (ver Pendientes) (recomendación 5).
6. **pdfjs-dist solo para las pruebas** que leen el texto del PDF (recomendación 6). Licencia
   Apache 2.0, mantenido por Mozilla. Para las plantillas se usan Handlebars y docxtemplater con
   PizZip (licencias MIT, mantenidos).
7. **FT-COM-003 confidencial** (recomendación 7).
8. **Las plantillas de salida las maneja quien diseña formatos** (`doc.form_template.manage`)
   (recomendación 9).
9. **El PDF se arma con un trabajo programado cada 20 segundos**, no en el momento: aprobar responde
   al instante y, si Gotenberg falla, se reintenta solo.
10. **Nombres internos reservados:** los campos no pueden llamarse como los datos que la plataforma
    pone en la plantilla (código, empresa, fecha…), para que nunca se confundan.

## Commits

| Commit    | Qué hizo                                                                             |
| --------- | ------------------------------------------------------------------------------------ |
| `8a1256f` | Tablas de formatos, registros y plantillas de salida                                 |
| `e7cefdf` | Contratos de formatos, registros y plantillas de salida                              |
| `79c4076` | Encabezado y pie institucionales, hoja del formato y motores HTML y Word             |
| `09699a5` | Nombres internos reservados                                                          |
| `f25f26d` | Vista previa en pantalla y encabezado legible por los lectores de PDF                |
| `270cc09` | API: formatos, registros con aprobación, plantillas de salida y PDF                  |
| `7376d88` | Pruebas: criterios, aprobación, permisos, aislamiento y auditoría                    |
| `8dc22a4` | Worker: PDF de los registros y copias con la leyenda                                 |
| `14d4fcc` | Pantallas: diseñador, diligenciamiento, registros, aprobación y plantillas de salida |
| `895223c` | Nombres en español de los eventos de auditoría                                       |
| `8c23972` | Diccionario de datos y guías de la API y del worker                                  |
| `(este)`  | Cierre del bloque                                                                    |
