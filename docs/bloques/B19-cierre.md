# Cierre del bloque B19: Control documental del SGC y carga inicial

- Fecha: 17/10/2026
- Rama: `feat/b19-control-documental-del-sgc-y-c`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, **ningún documento del SGC cambia sin una Solicitud de Acción Documental
aprobada**, cada versión pasa por **revisión, aprobación y publicación con tareas**, publicar
**pide la lectura a los cargos** y la plataforma tiene el **Listado Maestro en línea**, con un
comando para **cargar el RE-SGC-001 con sus archivos**. Usted aprobó el plan con las cinco
recomendaciones; las decisiones están al final.

| Pieza                          | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solicitud de Acción Documental | Nuevo menú en Documentos › **Solicitudes**. Cualquiera con permiso pide **crear**, **modificar** o **eliminar** un documento del SGC, con su justificación. Recibe el código `SAD-2026-0001` y pasa por: radicada → en análisis → aprobada o rechazada → ejecutada                                          |
| Quién decide                   | **Calidad** analiza y decide. **Quien pidió la solicitud nunca la decide**: ni desde la pantalla, ni desde «Mis tareas», ni por delegación; la base de datos también lo impide. Al decidirse, a quien la pidió le llega un aviso                                                                            |
| Cambios con solicitud          | Crear un documento del SGC, crear una versión nueva o declarar obsoleto un documento **exige elegir una solicitud aprobada** que pida exactamente eso. Al publicar (o declarar obsoleto) la solicitud queda **ejecutada**                                                                                   |
| Trámite de la versión          | Cada versión tiene su trámite: quien la elabora la envía, **Calidad la revisa**, **Dirección la aprueba** y **Calidad la publica**. Cada persona recibe su tarea y su aviso. Se puede atender desde la ficha del documento o desde «Mis tareas»                                                             |
| Quien elabora no aprueba       | Se mantiene en tres lugares: la pantalla, la API (incluso desde «Mis tareas») y la base de datos (criterio del bloque)                                                                                                                                                                                      |
| Publicar avisa                 | Publicar deja **obsoleta la versión anterior** y **pide la lectura** a cada persona de los cargos vinculados al documento con «Aplica a»; a cada una le llega el aviso «Lea el documento…» (criterio del bloque)                                                                                            |
| Constancia de lectura          | Nueva pestaña **Lectura** en la ficha del documento: el botón «Confirmo que leí este documento» y, para Calidad, quién confirmó y quién falta, **cargo por cargo**, y «Solicitar constancia de lectura» para volver a pedirla                                                                               |
| Listado Maestro                | Documentos › **Listado Maestro**: código, nombre, tipo, proceso, versión, fecha, estado y responsable, con filtros y el botón **Exportar** (un archivo que abre Excel). Se arma con los documentos mismos: siempre está al día                                                                              |
| Carga inicial                  | El comando `pnpm doc:importar-listado` lee el RE-SGC-001 guardado como CSV y una carpeta con los archivos. Primero **solo revisa** y explica cada fila con problemas; con `--aplicar` carga, pasa cada archivo por el antivirus, lo convierte a PDF y lo deja vigente con la versión y la fecha del listado |
| RIT-001                        | El Reglamento Interno de Trabajo es un documento del SGC **sin proceso**: su código es `RIT-001`. Se agregó el tipo «RIT» al catálogo                                                                                                                                                                       |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `doc_change_requests` (las
solicitudes) y `doc_acknowledgements` (las constancias). `doc_versions` ahora dice su origen
(plataforma o carga inicial), su solicitud y su trámite. Diccionario en
[`doc.md`](../manual/datos/doc.md), con las columnas del archivo de la carga inicial.

**Rutas nuevas de la API:** 8 (solicitudes, sus pasos, Listado Maestro, exportación y constancia
de lectura), en [`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`.

**Decisión de arquitectura nueva:** [ADR-023](../adr/023-seguimiento-de-tramites-en-la-transaccion.md),
**pendiente de su aprobación**. Dice que cuando alguien aprueba desde «Mis tareas», el módulo de
documentos se entera en la misma operación, para que el trámite y el documento nunca queden en
desacuerdo.

## Cómo se probó

| Prueba                                    | Qué demuestra                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listado Maestro = RE-SGC-001 (criterio)   | Un listado ficticio de **251 documentos** (250 de los 10 procesos y el RIT-001, unos en PDF y otros en Word) se carga y la plataforma queda **sin diferencias**: mismos códigos, nombres, versiones y fechas. Una segunda corrida no duplica nada y la exportación trae las mismas 251 filas |
| Quien elabora no aprueba (criterio)       | Desde la ficha y **desde «Mis tareas»** la aprobación propia responde «Quien elabora una versión no puede aprobarla» y la versión no se mueve                                                                                                                                                |
| Publicar deja obsoleta y avisa (criterio) | Publicar la 01 deja obsoleta la 00; las personas de los cargos destinatarios quedan pendientes y el aviso les llega con el código y la versión                                                                                                                                               |
| Solicitud                                 | Ciclo completo; quien pide no decide (también en la base de datos); rechazar exige el motivo; crear, versionar y declarar obsoleto exigen la solicitud correcta, y una ya usada no sirve otra vez                                                                                            |
| Trámite                                   | Revisar y aprobar desde «Mis tareas» mueve la versión al instante; Dirección no puede revisar por Calidad                                                                                                                                                                                    |
| Carga inicial                             | Revisar sin aplicar no cambia nada y explica cada problema (archivo que falta, cargo que no existe, proceso que no existe, fila obsoleta); enlaza responsable y destinatarios; el siguiente documento nuevo sigue después del número cargado (`PL-TEC-017` → `PL-TEC-018`)                   |
| Casos del trámite                         | Dirección devuelve con su motivo; publicar con una fecha elegida la deja como fecha de vigencia; un Word sin su PDF no se envía ni desde «Mis tareas»                                                                                                                                        |
| Pantallas                                 | 14 pruebas nuevas de pantalla y las tres pantallas nuevas en un navegador real, sin fallas de accesibilidad en modo claro y oscuro                                                                                                                                                           |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin rol o desde el portal no hay solicitudes, Listado Maestro, exportación
  ni constancias. Comercial radica solicitudes pero no las decide ni pide lecturas; exportar exige
  el permiso de exportar documentos. El Colaborador solo ve las solicitudes que él pidió.
- **Aislamiento:** la empresa B no ve ni decide las solicitudes de la A, no ve su Listado Maestro
  ni sus constancias, y cada empresa lleva su propio consecutivo `SAD`.
- **Auditoría:** las 5 rutas nuevas que escriben están en el recorrido de B11 (que exige un evento
  por cada una). Cada paso de la solicitud, cada revisión, cada constancia, la exportación y cada
  corrida de la carga inicial dejan su evento.

### Resultado de `pnpm check`

En verde el 17/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas                                                                                   |
| Estilo y tipos          | Sin problemas                                                                                   |
| Fronteras entre módulos | Sin problemas: documentos usa el motor de flujos, el núcleo e identidad solo por sus índices    |
| Código sin usar (knip)  | Sin problemas (nota 3)                                                                          |
| Pruebas unitarias       | Todas: API 320, web 350, worker 39, contratos 108 y demás paquetes                              |
| Pruebas de integración  | API 694 en 79 archivos (11 archivos nuevos del control documental), worker 21                   |
| Cobertura               | Sobre lo que exige el capítulo 21 (ramas de la API en integración: 85,07 %; de la web: 85,46 %) |
| Pruebas en navegador    | 167, incluidas 6 nuevas del control documental en modo claro y oscuro                           |
| Búsqueda de secretos    | Ninguno                                                                                         |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo                           |

**Cosas que debe saber de esta verificación:**

1. **Pruebas un paquete a la vez** (`turbo --concurrency=1`), como en B14 a B18. Con todos los
   paquetes a la vez el equipo se quedó con menos de 1 GB de memoria libre y varias pruebas que no
   tienen que ver con este bloque (arranque de la API, segundo factor, delegaciones) se agotaron por
   tiempo; en cada corrida fallaba una distinta y todas pasaron solas y en la corrida en orden.
2. **La primera corrida en navegador** justo después de compilar se quedó en «Verificando su
   sesión…» en 4 pruebas (el servidor recién encendido); las mismas pasaron al repetirlas.
3. **Dos ajustes que salieron de la verificación:** knip encontró un archivo del comando sin
   registrar y tres ayudas exportadas sin uso fuera de su archivo; y la cobertura de ramas de la API
   quedó en 84,82 % (mínimo 85 %). Agregué pruebas reales de casos que faltaban (Dirección devuelve
   una versión, publicar con una fecha de vigencia elegida, enviar desde «Mis tareas» un Word que
   aún no tiene su PDF) sin bajar el umbral.
4. **Migración sobre la versión anterior:** agrega dos tablas y tres columnas con valor por
   defecto, amplía reglas y reemplaza el disparador de versiones conservando todo lo de B18. Las
   versiones que ya estaban «en revisión» antes de B19 no tienen trámite (ver Pendientes).

## Cómo lo prueba usted, paso a paso

Necesita **tres personas** de la empresa de demostración, porque quien pide no decide y quien
elabora no aprueba: **Ana** (Calidad, elabora), **Carlos** (Calidad, revisa y publica) y una
persona de **Dirección** (aprueba). Use solo datos de prueba.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b19-control-documental-del-sgc-y-c
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La segunda crea las tablas nuevas; la tercera publica los dos flujos nuevos y agrega el tipo RIT.
Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. Las tres personas

Si aún no tiene a Carlos o a la persona de Dirección, invítelas (acepte desde Mailpit,
http://localhost:8025) y deles el rol:

```bash
pnpm iam:invitar --empresa demo-uno --correo direccion@demo-uno.test --nombre "Laura Díaz"
```

```bash
pnpm iam:asignar-rol --correo direccion@demo-uno.test --rol DIRECCION
```

(Ana y Carlos con el rol `CALIDAD`, como en el cierre de B18.)

### 3. Pedir un documento nuevo (Solicitud de Acción Documental)

1. Entre con **Ana** en http://localhost:3000 → **Documentos** → botón **«Solicitudes»** →
   **«Nueva solicitud»**.
2. Qué pide: **Creación**; tipo **PR · Procedimiento**; proceso **SGC**; un nombre; escriba la
   justificación y pulse **«Radicar»**. Se abre la ficha con el código `SAD-2026-…`, «Radicada».
3. Note que Ana **no tiene botones** para decidirla: quien pide no decide.
4. Entre con **Carlos** → la misma solicitud → **«Empezar el análisis»** → **«Aprobar»**. Con Ana
   verá el aviso «Su solicitud documental … fue aprobada».

### 4. Crear el documento y llevarlo a vigente

1. Con **Ana**, en la ficha de la solicitud pulse **«Crear el documento»**. Elija tipo PR, proceso
   SGC y, en **«Solicitud de Acción Documental aprobada»**, la que acaba de aprobar Carlos. Suba un
   PDF o Word de prueba y pulse **«Crear documento»**.
2. Pestaña **Versiones** → **«Enviar a revisión»**. El paso dice «Revisión de Calidad».
3. Con **Carlos**: **«Mis tareas»** muestra la revisión. Apruébela (desde la tarea o desde la
   ficha). El paso pasa a «Aprobación de Dirección».
4. Con **Dirección**: apruebe. Con **Carlos**: **«Publicar»**. Queda **Vigente** y la solicitud
   queda **Ejecutada**.
5. Pruebe el criterio: si Ana intenta aprobar su propia versión (por ejemplo, si también tuviera la
   tarea), el sistema responde que quien elabora no la aprueba.

### 5. Pedir la lectura (constancia por cargo)

1. Antes de publicar (o en un documento ya vigente), en la pestaña **Vínculos** vincule un **Cargo**
   con la relación **«Aplica a»** que tenga personas (Administración › Cargos y personas).
2. Al publicar, a esas personas les llega el aviso «Lea el documento …». Pestaña **Lectura**: cada
   persona ve **«Confirmo que leí este documento»**; Calidad ve quién confirmó y quién falta, por
   cargo, y puede pulsar **«Solicitar constancia de lectura»** para recordarles.

### 6. Cambiar o retirar un documento vigente

En la ficha de un documento vigente están **«Solicitar modificación»** y **«Solicitar
eliminación»**. Sin una solicitud aprobada, **«Nueva versión»** y **«Declarar obsoleta»** no dejan
continuar. Publicar la versión 01 deja la 00 **Obsoleta** (pestaña Versiones).

### 7. Listado Maestro

Documentos → **«Listado Maestro»**: filtre por proceso, tipo o estado, busque por código y pulse
**«Exportar»** para descargar el archivo que abre Excel.

### 8. Carga inicial del RE-SGC-001 (cuando tenga el listado real)

1. Abra su RE-SGC-001 en Excel y deje las columnas como dice
   [`doc.md`](../manual/datos/doc.md#carga-inicial-del-listado-maestro-re-sgc-001) (Código, Nombre,
   Versión, Fecha; y si quiere Responsable, Destinatarios y Clasificación). Guárdelo con
   **Archivo › Guardar como › CSV UTF-8**.
2. Ponga en una carpeta el archivo de cada documento; su nombre debe **empezar por el código**
   (por ejemplo `PR-SGC-001 Control de documentos.docx`).
3. **Primero solo revise** (no cambia nada):

```bash
pnpm doc:importar-listado --correo ana@demo-uno.test --listado C:\carga\listado.csv --archivos C:\carga\archivos
```

4. Lea el informe: dice cada fila con problemas. Corrija el listado o la carpeta y repita.
5. Cuando no haya problemas, cargue de verdad (con `pnpm dev` encendido, para que el worker
   analice y convierta los archivos):

```bash
pnpm doc:importar-listado --correo ana@demo-uno.test --listado C:\carga\listado.csv --archivos C:\carga\archivos --aplicar
```

6. Al final debe decir **«Conciliación: SIN DIFERENCIAS»** y dejar el informe
   `informe-carga-listado-maestro-….csv` junto a su listado: es la evidencia del capítulo 18.
   Si queda algo esperando, repita el mismo comando: continúa donde quedó.

## Pendientes

- **ADR-023 por aprobar:** la decisión de arquitectura que conecta el motor de flujos con los
  módulos. Si no la aprueba, hay que cambiar cómo los documentos siguen sus trámites.
- **Formato FT-SGC-002 (Lista de Verificación Documental) al revisar** y el **pie «copia no
  controlada»** en el PDF: con los formatos digitales y el motor de plantillas de **B20**.
- **Retención (RE-SGC-005) y disposición final:** **B21**.
- **Comparación de versiones** (ficha 17.4): no estaba en los entregables de B19; queda propuesta.
- **Elegir la solicitud desde su ficha:** hoy, al crear el documento o la versión, se elige la
  solicitud en una lista (solo aparecen las aprobadas que sirven); no viene preseleccionada.
- **Los documentos de B18 ya en borrador** reciben su trámite al enviarlos a revisión; los que ya
  estaban «en revisión» antes de este bloque no tienen tarea: hay que devolverlos y enviarlos otra
  vez (en datos de prueba).
- **Carga del listado desde la pantalla:** se hizo con un comando, como se acordó.

## Decisiones tomadas

1. **El CSV de la carga** con columnas fijas (las de `doc.md`), sin biblioteca nueva para leer
   Excel (recomendación 1).
2. **Se conserva la versión del listado** (por ejemplo 03), no 00 (recomendación 2).
3. **Crear un documento del SGC también exige solicitud** (recomendación 3). Los documentos de
   expediente no la necesitan.
4. **Revisa Calidad, aprueba Dirección, publica Calidad**; la solicitud la analiza y decide Calidad
   y nunca quien la pidió (recomendación 4). Son datos del motor: se cambian en Administración ›
   Flujos sin programar, siempre que se conserven los nombres de los pasos.
5. **La carga inicial no pide lecturas** (recomendación 5): Calidad las pide después con
   «Solicitar constancia de lectura».
6. **Destinatarios = cargos vinculados con «Aplica a»** (sin tabla nueva).
7. **Los documentos importados** quedan vigentes sin aprobador en la plataforma (se aprobaron en
   papel), con la fecha del listado como fecha de aprobación, sin solicitud ni trámite.
8. **Los consecutivos siguen después del número cargado**, para que no se repita un código.
9. **La exportación del Listado Maestro es un POST** con el código antifalsificación, como la de la
   auditoría, porque deja un evento.
10. **Los avisos nuevos** («Lea el documento…» y «Su solicitud documental … fue …») tienen su
    plantilla editable en Administración › Plantillas.

## Commits

| Commit    | Qué hizo                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------- |
| `24d48be` | Tablas de solicitudes y constancias, origen de la versión, RIT sin proceso y dos avisos nuevos |
| `0e11585` | Contratos de solicitudes, Listado Maestro y constancias                                        |
| `f1fcc6c` | API: solicitudes, trámite de versiones, lectura, Listado Maestro y ADR-023                     |
| `b84638a` | Pruebas: criterios del bloque, permisos, aislamiento, auditoría y avisos                       |
| `e63b4f0` | Carga inicial del RE-SGC-001 con sus archivos (prueba de 251 documentos)                       |
| `98afa58` | Exportación del Listado Maestro como POST                                                      |
| `391e41f` | Pantallas: Listado Maestro, solicitudes y pestaña Lectura                                      |
| `4bb8942` | Diccionario de datos y guía de la API                                                          |
| `33465f1` | Pruebas de casos del trámite y ajustes de knip                                                 |
| `(este)`  | Cierre del bloque                                                                              |
