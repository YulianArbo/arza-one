# Cierre del bloque B21: Retención, disposición y búsqueda

- Fecha: 21/10/2026
- Rama: `feat/b21-retencion-disposicion-y-busque`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, **cada documento tiene su regla de retención** (Tabla de Retención RE-SGC-005),
**cada mes la plataforma propone** los documentos cuya retención venció, **nada se elimina sin regla
vencida y sin la aprobación de Dirección**, y queda **el acta de disposición en PDF**. Además, la
plataforma tiene **búsqueda de texto completo en español** (también dentro del contenido de los
PDF, sin importar las tildes) y la **búsqueda global de la barra superior** (Ctrl K) funciona. Usted
aprobó el plan con las siete recomendaciones; las decisiones están al final.

| Pieza                      | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabla de retención         | Nuevo botón en Documentos › **Tabla de retención** (solo Calidad). Cada serie dice a qué tipo de documento o proceso se aplica, cuántos años se guarda en gestión y en el archivo central, y qué pasa al vencer: **Eliminar** o **Conservación total**. Muestra cuántos documentos **no tienen regla** (debe quedar en cero) |
| La regla de cada documento | Cada documento toma la regla de su tipo y su proceso (la más específica gana). En la ficha del documento, la pestaña nueva **Retención** dice su regla, desde cuándo corre el plazo y cuándo vence. Calidad puede darle otra regla como **excepción**                                                                        |
| Cuándo corre el plazo      | Un documento del SGC, desde que queda **obsoleto** (uno vigente nunca vence). Un documento de expediente (contratos, soportes), desde su **publicación**                                                                                                                                                                     |
| Propuesta mensual          | Cada día, a las 6:10 a. m., la plataforma revisa: si aún no existe la propuesta del mes y hay documentos vencidos, la crea (código `DIS-2026-0001`). Calidad también puede pulsar **«Generar la propuesta del mes»**. Crear la propuesta **no elimina nada**                                                                 |
| Revisión y aprobación      | La propuesta le llega a Calidad en «Mis tareas». Calidad puede **conservar** un documento (con su motivo) y la **envía**; a Dirección le llega para **aprobar o rechazar** (con motivo). **Quien envía no aprueba**                                                                                                          |
| Ejecución y acta           | Aprobada, en un minuto la plataforma **borra para siempre el contenido** (los archivos) de los documentos marcados «Eliminar», deja su ficha con código y nombre como evidencia, y genera el **Acta de disposición en PDF** con el encabezado institucional (RE-SGC-005)                                                     |
| Búsqueda de documentos     | Busca en el código, el título y **el texto del PDF vigente**, en español y sin tildes («gestion» encuentra «gestión»; «audit» encuentra «auditoría»). Muestra un fragmento con lo encontrado resaltado                                                                                                                       |
| Búsqueda global (Ctrl K)   | La ventana de la barra superior busca a la vez en **documentos** y **terceros**, solo en lo que la persona puede ver                                                                                                                                                                                                         |
| Carga del RE-SGC-005       | El comando `pnpm doc:importar-retencion` lee el RE-SGC-005 guardado como CSV. Primero **solo revisa** y explica cada fila con problemas; con `--aplicar` crea todas las reglas o ninguna                                                                                                                                     |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `doc_retention_rules` (reglas),
`doc_disposition_proposals` (propuestas), `doc_dispositions` (sus documentos) y
`doc_version_texts` (el texto de los PDF para la búsqueda). Diccionario en
[`doc.md`](../manual/datos/doc.md#retención-disposición-y-búsqueda-b21), con las columnas del CSV
del RE-SGC-005.

**Rutas nuevas de la API:** 14, en [`apps/api/README.md`](../../apps/api/README.md) y en
`apps/api/openapi.json`.

**Trabajos nuevos del worker:** la propuesta del mes (cada día), la ejecución de las aprobadas y la
lectura del texto de los PDF (cada minuto).

## Cómo se probó

| Prueba                                                         | Qué demuestra                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nada se elimina sin regla vencida y aprobación (criterio)      | Solo se proponen los vencidos con regla de eliminar (no los vigentes del SGC, ni los que no vencieron, ni los de conservación total). Sin aprobación, o con la regla cambiada, no se elimina. **La base de datos también lo impide**: aunque alguien lo intente directo en la base, la rechaza |
| La búsqueda nunca devuelve lo que no se puede abrir (criterio) | No aparecen: borradores ajenos, documentos de otro proceso para el Colaborador, restringidos sin su permiso (y con permiso, sin fragmento), eliminados ni documentos de otra empresa                                                                                                           |
| Revisión y aprobación                                          | Conservar exige el motivo; después de enviar ya no se cambian los documentos; quien envía no aprueba, ni desde la ficha ni desde «Mis tareas»; rechazar exige el motivo y lo rechazado se vuelve a proponer el mes siguiente                                                                   |
| Ejecución                                                      | El documento queda «Eliminado por disposición», sus archivos se borran del almacenamiento, el texto de búsqueda se borra, el acta se descarga con su huella verificada; repetir no cambia nada                                                                                                 |
| Acta en PDF (worker, con Gotenberg real)                       | El acta trae el encabezado institucional (RE-SGC-005), el código `DIS-…`, el mes y los documentos eliminados                                                                                                                                                                                   |
| Texto de los PDF                                               | Un PDF real se lee y se encuentra sin tildes; uno sin texto se busca solo por código y título; lo que escribe la persona nunca se toma como operador de búsqueda                                                                                                                               |
| Carga del RE-SGC-005                                           | Revisar no cambia nada; con una fila mala no se carga ninguna; repetir no duplica                                                                                                                                                                                                              |
| Pantallas                                                      | 15 pruebas nuevas de pantalla y, en un navegador real, las tres pantallas nuevas y la búsqueda sin fallas de accesibilidad en modo claro y oscuro                                                                                                                                              |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin rol, desde el portal, el Colaborador y Comercial no ven ni tocan la
  tabla de retención ni la disposición. Dirección ve y decide las propuestas, pero no administra la
  tabla ni las prepara. Sin permiso de ver documentos no hay búsqueda.
- **Aislamiento:** otra empresa no ve, cambia ni decide las reglas, propuestas ni documentos de
  esta; su propuesta nunca toma documentos de esta; la búsqueda no los encuentra; la carga del
  RE-SGC-005 queda solo en la empresa de quien la hace.
- **Auditoría:** las 8 rutas nuevas que escriben están en el recorrido de B11 (que exige un evento
  por cada una). Cada regla, excepción, propuesta, decisión, envío, aprobación, rechazo, ejecución,
  descarga del acta, documento eliminado y texto leído deja su evento.

### Resultado de `pnpm check`

En verde el 21/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas                                                                                   |
| Estilo y tipos          | Sin problemas                                                                                   |
| Fronteras entre módulos | Sin problemas: documentos usa el núcleo, identidad y el motor de flujos solo por sus índices    |
| Código sin usar (knip)  | Sin problemas (nota 3)                                                                          |
| Pruebas unitarias       | Todas: API 334, web 396, worker 41, contratos 123, plantillas 18 y demás paquetes               |
| Pruebas de integración  | API 802 en 92 archivos (7 archivos nuevos de este bloque), worker 25 (uno nuevo, con Gotenberg) |
| Cobertura               | Sobre lo que exige el capítulo 21 (ramas de la API en integración: 85,24 %; de la web: 85,02 %) |
| Pruebas en navegador    | 190, incluidas 8 nuevas de este bloque en modo claro y oscuro                                   |
| Búsqueda de secretos    | Ninguno                                                                                         |
| Migraciones             | Desde cero en la prueba de integración y sobre una base con B20, sin diferencias con el modelo  |

**Cosas que debe saber de esta verificación:**

1. **Pruebas un paquete a la vez** (`turbo --concurrency=1`), como en B14 a B20, por la memoria del
   equipo.
2. **Para correr la integración y el navegador en este equipo** se arrancó Docker a mano, Garage con
   una configuración local sin IPv6 (el equipo no tiene IPv6) y el navegador de pruebas enlazado al
   que trae el equipo, como en B20. Nada de eso se guardó en el proyecto.
3. **Ajustes que salieron de la verificación, sin bajar ningún control:** knip encontró seis ayudas
   exportadas sin uso fuera de su archivo; la cobertura de ramas de la API quedó en 84,67 % (mínimo
   85 %) y agregué pruebas reales de casos que faltaban (una propuesta en la que todo se conserva,
   un acta alterada, la lista por páginas, el trabajo diario, los datos de demostración, un PDF sin
   texto) y quité dos ramas que nunca podían ocurrir.
4. **Un error real que encontraron las pruebas:** al eliminar un **contrato de expediente** (que se
   elimina estando vigente), el trabajo de B20 que genera la copia de consulta intentaba leer su PDF
   ya borrado y se reintentaba sin fin. Ahora solo toma versiones con su PDF disponible; hay una
   prueba que falla sin la corrección y pasa con ella.
5. **Migración sobre la versión anterior:** agrega cuatro tablas, dos columnas opcionales en
   `doc_documents`, la extensión `unaccent` y la configuración de búsqueda `doc_spanish`; amplía dos
   reglas (estados del documento y del archivo) y reemplaza dos disparadores y una función de B20
   conservando todo lo anterior. No cambia datos existentes. También probé `pnpm db:seed:demo` dos
   veces (no duplica) y el comando `pnpm doc:importar-retencion` con un CSV de ejemplo.

## Cómo lo prueba usted, paso a paso

Necesita a **Ana** (Calidad) y a **Laura Díaz** (Dirección), como en los cierres de B19 y B20.
Use solo datos de prueba.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b21-retencion-disposicion-y-busque
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

La tercera crea las tablas nuevas; la cuarta publica el trámite de la disposición y, solo en las
empresas de demostración, crea una regla ficticia (**DEMO-CT**) y **dos contratos ficticios
publicados en 2015**, cuya retención ya venció, para que pueda ver una propuesta. Si `pnpm dev`
estaba encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. La tabla de retención

1. Entre con **Ana** en http://localhost:3000 → **Documentos** → botón **«Tabla de retención»**.
2. Verá la regla **DEMO-CT**. Arriba dice cuántos documentos **no tienen regla**; ábralo para ver
   cuáles.
3. Pulse **«Agregar una regla»**: por ejemplo código `PR-01`, serie «Procedimientos del SGC», tipo
   **PR**, 1 año en gestión, 4 en el archivo central, **Eliminar**, fundamento «PR-SGC-001». Guarde.
   El número de documentos sin regla baja.

### 3. La retención en la ficha de un documento

1. Abra un documento cualquiera → pestaña **Retención**: su regla, desde cuándo corre el plazo y
   cuándo vence. Un procedimiento vigente dice «Todavía no corre».
2. Con Ana, **«Cambiar la regla»** le da otra regla solo a ese documento (excepción).

### 4. La propuesta del mes

1. Documentos → **«Disposición final»** → **«Generar la propuesta del mes»**. Se abre la propuesta
   `DIS-2026-…` con los dos contratos ficticios.
2. En uno pulse **«Conservar»** y escriba el motivo (por ejemplo «Lo pide el cliente»).
3. Pulse **«Enviar a aprobación»** y confirme. Note que Ana ya no puede aprobarla.

### 5. Aprobar y ver el acta

1. Entre con **Laura Díaz**: en «Mis tareas» está la propuesta; ábrala desde Documentos ›
   Disposición final. Pulse **«Aprobar»** y confirme (o «Rechazar» con el motivo, y no se elimina
   nada).
2. Espere un minuto y recargue: queda **«Ejecutada»** y aparece **«Descargar el acta»**. El PDF
   lista el contrato eliminado y el conservado con su motivo.
3. Abra el contrato eliminado: dice **«Eliminado por disposición»** y ya no tiene contenido; el
   conservado sigue igual.

### 6. La búsqueda

1. Publique un documento con un PDF que tenga texto (como en B18 y B19) y espere un minuto.
2. Pulse **Ctrl K** (o «Buscar en todo…» arriba) y escriba una palabra que esté **dentro** del PDF,
   sin tildes. Aparece el documento con la palabra resaltada. Escriba también un código, como
   `PR-SGC`, o el nombre de un tercero.

### 7. Cargar el RE-SGC-005 real (cuando lo tenga)

1. Abra su RE-SGC-005 en Excel con las columnas de
   [`doc.md`](../manual/datos/doc.md#carga-del-re-sgc-005) (Código, Serie, Tipo, Proceso, Años
   gestión, Años central, Disposición, Fundamento) y guárdelo con **Archivo › Guardar como › CSV
   UTF-8**.
2. **Primero solo revise** (no cambia nada):

```bash
pnpm doc:importar-retencion --correo ana@demo-uno.test --tabla C:\carga\retencion.csv
```

3. Lea el informe: dice cada fila con problemas. Corrija y repita. Cuando no haya problemas:

```bash
pnpm doc:importar-retencion --correo ana@demo-uno.test --tabla C:\carga\retencion.csv --aplicar
```

## Pendientes

- **El RE-SGC-005 real:** no está en el repositorio. Las pruebas usan series ficticias; cárguelo con
  el comando del paso 7.
- **Versiones obsoletas de un documento vigente** (por ejemplo la 00 cuando la 01 está vigente):
  quedan para después, como acordamos (recomendación 5). Hoy se dispone de documentos completos.
- **Documentos escaneados (OCR):** se encuentran por código y título, no por su contenido
  (recomendación 6).
- **Registros diligenciados (B20) y datos de otros módulos:** la retención de este bloque es de los
  documentos. La de los registros de cada módulo (por ejemplo, candidatos no seleccionados en B35)
  llega con su módulo.
- **Los contratos ficticios de demostración** no tienen archivo en el almacenamiento (la semilla
  solo escribe en la base de datos): su visor no muestra el PDF.
- **`pg_trgm`:** el plan lo mencionaba junto a `unaccent`; no hizo falta (la búsqueda por el comienzo
  del código usa el índice del texto). No se activó para no dejar una extensión sin uso.

## Decisiones tomadas

1. **El plazo corre** desde que un documento del SGC queda obsoleto y desde la publicación de uno de
   expediente; un documento vigente del SGC nunca se propone (recomendación 1).
2. **Eliminar** borra para siempre los archivos (fuente, PDF y copia de consulta) y el texto de
   búsqueda; la ficha con código y nombre queda como evidencia del acta (recomendación 2).
3. **Calidad prepara y envía; Dirección aprueba.** Quien envía no aprueba; lo revisan la pantalla,
   la API (también desde «Mis tareas») y la base de datos (recomendación 3). Son datos del motor:
   se cambian en Administración › Flujos sin programar.
4. **Carga del RE-SGC-005 con un comando** y un CSV, como B19 (recomendación 4).
5. **Solo documentos completos** en este bloque (recomendación 5); **sin OCR** (recomendación 6).
6. **La propuesta se revisa cada día** y se crea una vez al mes (la del mes en curso), en lugar de
   solo el día 1: si el trabajo no corre ese día, no se pierde el mes.
7. **«Conservar» es para siempre:** un documento que Calidad decidió conservar no se vuelve a
   proponer (selección documental). Lo **rechazado** sí vuelve a proponerse el mes siguiente.
8. **Antes de aprobar se revisa otra vez** que cada documento siga vencido con su regla de
   eliminar; si la regla cambió, hay que rechazar la propuesta.
9. **Una sola definición de la retención** en la base de datos (tres funciones), que usan la API, el
   worker y las protecciones; así nunca pueden discrepar.
10. **La búsqueda** ordena con PostgreSQL y después filtra con la **misma regla de acceso** del resto
    del módulo. Lo restringido aparece solo a quien tiene su permiso nominal y **sin fragmento**.
11. **pdfjs-dist** pasa de solo pruebas (B20) a uso real para leer el texto de los PDF, con los
    formularios XFA y las fuentes desactivados. Licencia Apache 2.0, mantenido por Mozilla.
12. **Datos de demostración** para probar la disposición: solo con `db:seed:demo`, nunca en
    producción.

## Commits

| Commit    | Qué hizo                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| `633645d` | Tablas de reglas, propuestas, sus documentos y textos; protecciones de la base de datos |
| `af04ccd` | Contratos de retención, disposición y búsqueda                                          |
| `a45a09b` | API: reglas, propuesta mensual con su trámite, ejecución con el acta y búsqueda         |
| `a93385d` | Pruebas: criterios del bloque, permisos, aislamiento, auditoría y worker con Gotenberg  |
| `e461a2c` | Pantallas: tabla de retención, disposición final, pestaña Retención y búsqueda Ctrl K   |
| `1673744` | Comando `pnpm doc:importar-retencion` para el RE-SGC-005                                |
| `5097e71` | Pruebas en navegador de las pantallas nuevas                                            |
| `ef83a13` | Diccionario de datos y guías de la API y del worker                                     |
| `eee05a6` | Ajustes de knip                                                                         |
| `6610793` | Pruebas de casos, datos de demostración y avisos de pdfjs fuera de los registros        |
| `b82c2b9` | Corrección: sin copia de consulta para un PDF eliminado                                 |
| `d6d063c` | Dato nuevo en la prueba en navegador de la ficha del documento                          |
| `(este)`  | Cierre del bloque                                                                       |
