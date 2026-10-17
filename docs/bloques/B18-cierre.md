# Cierre del bloque B18: Documentos, versiones y expedientes

- Fecha: 17/10/2026
- Rama: `feat/b18-documentos-versiones-y-expedie`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, ARZA ONE **guarda los documentos con su código, sus versiones y su PDF**, y los
organiza en un **explorador de expedientes**. Usted aprobó el plan con las diez recomendaciones
(MP = Mapa, DC = Documento descriptivo); las decisiones están al final.

| Pieza                     | Qué hace, en palabras sencillas                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código de PR-SGC-001      | Al crear un documento del SGC, el sistema le pone el código **TIPO-PROCESO-NNN** (por ejemplo `PR-SGC-001`), sin saltos: un consecutivo por cada tipo y proceso. Un soporte de expediente recibe `DOC-2026-0001` |
| Versiones                 | Cada documento nace con su **versión 00 en borrador**. Una versión pasa por: borrador → en revisión → aprobada → vigente → obsoleta. Desde «en revisión» se puede **devolver** con el motivo                     |
| Una sola vigente          | Al **publicar** una versión, la vigente anterior pasa sola a **obsoleta**. La base de datos misma impide que haya dos vigentes (criterio del bloque)                                                             |
| Lo vigente no se modifica | Una versión en revisión, aprobada, vigente u obsoleta **no se puede cambiar**, ni por la pantalla ni directamente en la base de datos. Para cambiar algo se crea una **versión nueva** (criterio del bloque)     |
| Quien elabora no aprueba  | La persona que elaboró una versión no puede aprobarla ni devolverla; la base de datos también lo impide                                                                                                          |
| Conversión a PDF          | Si sube un **Word o un Excel**, el trabajador de segundo plano lo convierte a PDF con Gotenberg. Mientras se convierte, la versión dice «Convirtiendo a PDF…» y no se puede enviar a revisión                    |
| Visor PDF                 | La ficha del documento muestra el PDF dentro de la página, con «Descargar PDF» y, para quien edita documentos, «Descargar archivo fuente»                                                                        |
| Huella al descargar       | Antes de entregar un archivo, la plataforma **recalcula su huella**. Si alguien lo alteró en el almacenamiento, no lo entrega y deja una **alerta de seguridad** (pendiente de B14, ya resuelto)                 |
| Clasificación             | Público, interno, **confidencial** (cada descarga queda en el registro de accesos) y **restringido** (además del rol exige un permiso por persona y cada consulta queda registrada)                              |
| Explorador de expedientes | Nuevo menú **Documentos**: a la izquierda el árbol de carpetas; a la derecha los documentos de la carpeta elegida, con búsqueda por código o título y páginas                                                    |
| Carpetas iniciales        | En cada empresa: «Sistema de Gestión de Calidad» con una carpeta por proceso (10), y «Expedientes». Puede crear más carpetas y el **expediente de un tercero** (uno por tercero)                                 |
| Vínculos                  | Un documento se puede vincular con un **cargo** (por ejemplo, un manual de funciones), un **proceso** o un **tercero**                                                                                           |
| Qué ve el Colaborador     | Solo los documentos **vigentes de su proceso** y los que él mismo creó; nunca borradores ajenos ni el archivo fuente                                                                                             |

**Tablas nuevas** (todas separadas por empresa con la seguridad por fila): `doc_folders`,
`doc_documents`, `doc_versions`, `doc_links` y `doc_access_log`. Además, `core_sequences` admite
consecutivos **sin año** y el núcleo carga el catálogo **Tipos de documento** (MN, PR, PL, PT, IN,
MP, DC, PVE, FT, RE, CT, OS, AN). Diccionario en [`doc.md`](../manual/datos/doc.md) y
[`core.md`](../manual/datos/core.md).

**Rutas nuevas de la API:** 14 (carpetas, documentos, versiones con sus cinco pasos, descarga y
vínculos), en [`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`.

## Cómo se probó

| Prueba                       | Qué demuestra                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código sin saltos            | Dos procedimientos seguidos reciben números consecutivos; un plan del mismo proceso lleva su propio consecutivo; un tipo inválido no gasta número                                                                                      |
| Ciclo completo               | Borrador → revisión → aprobada → vigente, con quién aprobó y desde cuándo rige; devolver deja el motivo y el borrador editable                                                                                                         |
| Una sola vigente (criterio)  | Publicar la 01 deja obsoleta la 00; un intento de crear a la fuerza una segunda vigente en la base de datos es rechazado                                                                                                               |
| Vigente inmutable (criterio) | La API responde 409 al intentar editar la vigente; la base de datos rechaza cambiar su contenido y los datos del documento publicado                                                                                                   |
| Quien elabora no aprueba     | Aprobar o devolver la propia versión responde «Quien elabora una versión no puede aprobarla ni devolverla»                                                                                                                             |
| Conversión                   | Un Word queda «convirtiendo» y no se envía a revisión; con Gotenberg **real**, un Word armado en la prueba se convierte a PDF con su huella                                                                                            |
| Huella alterada (ficha 17.4) | Se cambia el archivo en el almacenamiento: la descarga falla con `DOC_INTEGRITY_FAILED` y queda la alerta de seguridad de severidad alta                                                                                               |
| Expedientes y vínculos       | Un tercero tiene un solo expediente; un expediente no va dentro de otro; vincular, retirar y volver a vincular                                                                                                                         |
| Pantallas                    | 23 pruebas de pantalla (explorador, documento nuevo con la subida del archivo, ficha, visor, pasos, vínculos y versión nueva) y las dos pantallas principales en un navegador real, sin fallas de accesibilidad en modo claro y oscuro |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin rol o desde el portal no se ven documentos, carpetas ni versiones, ni se
  obtienen enlaces. Dirección y Colaborador no crean documentos ni carpetas. Comercial crea y envía
  a revisión, pero no aprueba ni publica. El Colaborador ve solo los vigentes de su proceso, sin
  borradores ajenos ni archivo fuente. Un documento restringido no lo ve ni Dirección sin el
  permiso nominal.
- **Aislamiento:** la empresa B no ve, no lista, no descarga ni crea documentos en las carpetas de
  la empresa A, y cada empresa lleva su propio consecutivo `PR-SGC`.
- **Auditoría:** las 13 rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una; otra prueba revisa los eventos del ciclo completo. La descarga de un documento
  confidencial y la consulta de uno restringido quedan en `doc_access_log`. La pantalla de
  Auditoría muestra las acciones nuevas en español.

### Resultado de `pnpm check`

En verde el 17/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                  |
| Estilo y tipos          | Sin problemas                                                                                        |
| Fronteras entre módulos | Sin problemas: documentos usa el núcleo e identidad por sus índices, y terceros por un puerto        |
| Código sin usar (knip)  | Sin problemas (nota 3)                                                                               |
| Pruebas unitarias       | Todas: API 40 archivos, web 336 pruebas, worker 39, contratos 15 archivos y demás paquetes           |
| Pruebas de integración  | API 643 en 70 archivos (8 archivos nuevos de documentos), worker 21 (1 nueva con Gotenberg real)     |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la API en integración: 85,58 %; de la web: 86 %) |
| Pruebas en navegador    | 161, incluidas 5 nuevas de documentos en modo claro y oscuro                                         |
| Búsqueda de secretos    | Ninguno                                                                                              |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo                                |

**Cosas que debe saber de esta verificación:**

1. **Las mismas carpetas ajenas de B14 a B17** (`apps/api/.agents`, `apps/api/.claude`,
   `apps/api/.windsurf`, `apps/api/skills-lock.json` y `.claude/worktrees/…`) hacen que el paso de
   formato marque 112 archivos. No las toqué ni están en el pull request. Revisé el formato del
   proyecto sin ellas (todo bien) y corrí los demás pasos uno por uno; ESLint, excluyendo solo esas
   carpetas. En un commit las había agregado por error; lo detecté antes de que quedara y las saqué.
2. **Pruebas un paquete a la vez** (`turbo --concurrency=1`), como en B14 a B17, por la memoria del
   equipo. Una corrida de las pruebas de documentos falló al arrancar por carga y pasó al repetirla
   sin cambios.
3. **Dos ajustes que salieron de la verificación:** la cobertura de ramas de la API quedó en 84,25 %
   (mínimo 85 %); agregué pruebas reales de casos que faltaban (filtros y páginas de la lista,
   referencias inválidas, una conversión que llega tarde y las respuestas de Gotenberg), sin bajar
   el umbral. Y knip encontró ayudas exportadas que solo usaba su propio archivo.
4. **Migración sobre la versión anterior:** solo agrega tablas, una columna con valor por defecto y
   amplía dos reglas de `core_sequences`; la versión anterior de la API sigue funcionando con ella.

## Cómo lo prueba usted, paso a paso

Necesita dos cuentas de la empresa de demostración, porque **quien elabora no puede aprobar**: Ana
(de los cierres anteriores) y una segunda persona.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b18-documentos-versiones-y-expedie
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La segunda crea las tablas nuevas; la tercera carga el catálogo de tipos de documento y las
carpetas iniciales. Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y vuelva a escribir
`pnpm dev` (el worker ahora usa Gotenberg, que ya está en su entorno local).

### 2. Dar el rol de Calidad a las dos personas

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol CALIDAD
```

Si aún no tiene una segunda persona, invítela y acepte la invitación desde Mailpit
(http://localhost:8025), como en B08:

```bash
pnpm iam:invitar --empresa demo-uno --correo carlos@demo-uno.test --nombre "Carlos Ruiz"
```

```bash
pnpm iam:asignar-rol --correo carlos@demo-uno.test --rol CALIDAD
```

### 3. Crear un documento (con Ana)

1. Entre en http://localhost:3000 con Ana. En el menú aparece **Documentos**.
2. Verá el árbol: «Sistema de Gestión de Calidad» con una carpeta por proceso, y «Expedientes».
   Elija «Gestión de la Calidad» y pulse **«Nuevo documento»**.
3. Tipo: **PR · Procedimiento**; deje marcado «Documento controlado del SGC»; Proceso: **SGC ·
   Gestión de la Calidad**; escriba un título.
4. En «Archivo fuente», elija un **Word (.docx)** de prueba (no use documentos reales) y pulse
   **«Subir archivo»**. Espere a que diga **«Disponible»** (el antivirus lo revisa).
5. Escriba qué cambia («Creación del documento») y pulse **«Crear documento»**.
6. Se abre la ficha con el código **PR-SGC-001** (o el siguiente número) y «Sin publicar». En unos
   segundos el visor muestra el **PDF convertido** desde el Word.

### 4. Llevarlo a vigente (criterios del bloque)

1. Con Ana, pestaña **Versiones** → **«Enviar a revisión»** → confirme.
2. Intente usted misma **«Aprobar»**: no aparece el botón, porque quien elabora no aprueba.
3. Entre con **Carlos**, abra el documento → Versiones → **«Aprobar»** → confirme. Luego
   **«Publicar»** (deje la fecha vacía: rige desde hoy). El documento queda **Vigente**.
4. Ahora la versión 00 **no tiene «Editar borrador»**: lo vigente no se modifica.
5. Con Ana, pulse **«Nueva versión»**, suba otro archivo, escriba qué cambia y guarde. Envíela a
   revisión; con Carlos, apruébela y publíquela.
6. En **Versiones** verá la **01 Vigente** y la **00 Obsoleta**: nunca hay dos vigentes.

### 5. Devolver una versión

Cree otra versión con Ana y envíela a revisión. Con Carlos, pulse **«Devolver»**, escriba el
motivo y confirme. Con Ana verá la versión de nuevo en borrador con «Devuelta: …».

### 6. Expediente de un tercero y vínculos

1. En el explorador, pulse **«Nuevo expediente»**, busque un tercero de demostración y créelo. Si
   intenta crear otro expediente para el mismo tercero, se lo impide.
2. En la ficha de un documento, pestaña **Vínculos** → **«Vincular»** → por ejemplo, Proceso «COM ·
   Gestión Comercial».

### 7. Quién ve qué

- Una persona con solo el rol **Colaborador** (y un cargo en el proceso SGC) ve en el explorador
  solo los documentos **vigentes** de su proceso, sin borradores ni archivo fuente.
- Si marca un documento como **Confidencial** y lo descarga, la descarga queda en el registro de
  accesos. En **Auditoría** verá «Pidió el enlace de descarga de una versión», «Publicó una
  versión», etc.

## Pendientes

- **Solicitud de Acción Documental, flujo de aprobación con tareas, avisos y constancia de
  lectura:** llegan en **B19**. Hoy los pasos son botones directos con los permisos de cada rol.
- **Pie «copia no controlada»** con código, versión y fecha en el PDF descargado: con el motor de
  plantillas de **B20**, como se acordó.
- **Importador del Listado Maestro RE-SGC-001** y el **RIT-001** (que no lleva proceso): **B19**.
- **Expedientes de contratos, proyectos y colaboradores:** cuando existan esos módulos. Hoy los
  expedientes son de terceros y se crean a mano.
- **Permiso nominal de restringidos:** se da creando en Administración › Roles un rol propio con
  «Ver documentos restringidos» y asignándolo a la persona. No hay todavía una pantalla especial.
- **Mover documentos de carpeta** y **descartar un borrador:** no se incluyeron; la base de datos
  hoy no deja mover un documento.

## Decisiones tomadas

1. **Pasos directos en B18** (opción recomendada): enviar, devolver, aprobar, publicar y declarar
   obsoleta, con los permisos que ya existían. Quien elabora no aprueba desde ya.
2. **Códigos:** `TIPO-PROCESO-NNN` de tres dígitos con un consecutivo **sin año** por tipo y
   proceso, del servicio de consecutivos del núcleo; los soportes de expediente usan
   `DOC-AAAA-NNNN`. Los consecutivos sin año no aparecen en Administración › Consecutivos porque
   su prefijo forma parte del código.
3. **Tipos de documento** como catálogo del núcleo, con MP = Mapa y DC = Documento descriptivo.
4. **Cuatro clasificaciones**; lo restringido exige el permiso nominal además del rol.
5. **El Colaborador** ve los vigentes de su proceso y lo que él creó.
6. **Datos del documento:** mientras nunca se ha publicado, se corrigen con el borrador; después,
   solo con una versión nueva que los trae y los aplica al publicarse.
7. **Carpetas iniciales** por proceso y «Expedientes»; un expediente por tercero.
8. **Visor del navegador** dentro de la ficha (sin bibliotecas nuevas).
9. **Archivo fuente:** PDF, Word o Excel; Word y Excel se convierten con Gotenberg.
10. **Pie «copia no controlada»** para B20.
11. **Terceros sin dependencia circular:** documentos pide los terceros por un «puerto» que
    implementa el módulo de terceros, igual que privacidad en B17.
12. **Huella al pedir el enlace:** se recalcula antes de entregar el enlace, no al descargar, para
    poder responder con un mensaje claro y dejar la alerta.

## Commits

| Commit    | Qué hizo                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `abc0a1d` | Tablas de carpetas, documentos, versiones, vínculos y accesos; consecutivo sin año y tipos de documento |
| `e959df2` | Contratos de carpetas, documentos, versiones y vínculos                                                 |
| `f0c2d5d` | API: carpetas, documentos, versiones, descarga con huella y vínculos, con sus pruebas                   |
| `3771f0c` | Worker: conversión a PDF con Gotenberg                                                                  |
| `fe9243e` | Pantallas: explorador, documento nuevo, ficha con visor, versiones y vínculos                           |
| `adf6074` | Accesibilidad de las pantallas en un navegador real                                                     |
| `61a7d0c` | Diccionario de datos y guía de la API                                                                   |
| `c7caa95` | Pruebas de casos límite y ayudas privadas (knip)                                                        |
| `(este)`  | Cierre del bloque                                                                                       |
