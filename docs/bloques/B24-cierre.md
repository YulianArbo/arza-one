# Cierre del bloque B24: Contratos

- Fecha: 30/10/2026
- Rama: `feat/b24-contratos` (parte de `feat/b23-portafolio-y-cotizaciones`, que todavía espera su
  revisión en el pull request #37, que a su vez parte del #35 de la apariencia nueva)
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque la empresa **hace sus contratos en la plataforma**. Un contrato se genera desde
una de las cuatro plantillas oficiales, con los datos del cliente y, si la hay, de la cotización
aceptada. El texto sale **idéntico al modelo salvo los datos** (nombre, documento, valor, fechas…).
Si alguien cambia una cláusula, la plataforma la marca y **la Dirección debe revisarla una por una
antes de aprobar**. El contrato aprobado tiene su PDF definitivo y ya no se puede cambiar; con la
copia firmada a mano queda vigente, y la plataforma vigila su vencimiento, sus obligaciones y sus
otrosíes. Usted aprobó el plan con las diez recomendaciones; están al final.

| Pieza                        | Qué hace, en palabras sencillas                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca de cláusulas      | Contratos › **Biblioteca de cláusulas**. 28 cláusulas aprobadas (partes, objeto, valor, plazo, confidencialidad, datos personales, firma electrónica…), todas marcadas **«Por validar por el asesor jurídico»**. Solo la Dirección agrega una o crea su versión nueva  |
| Plantillas                   | **CT-COM-001** desarrollo de software, **CT-COM-002** soporte y mantenimiento, **CT-COM-003** acuerdo de confidencialidad y **OS-COM-001** orden de servicio. Cada una es una lista de cláusulas de la biblioteca; algunas se pueden quitar del contrato y otras no    |
| Asistente                    | **«Nuevo contrato»**: plantilla, cliente (de Terceros) y datos: título, objeto, valor, forma de pago, fechas, renovación y quién firma por el cliente (propone los firmantes autorizados de Terceros). Recibe el código `CTR-2026-0001` (u `OS-2026-0001` si es orden) |
| Desde la cotización aceptada | Cuando un cliente acepta una cotización, quien la hizo recibe un aviso con el enlace **«Crear el contrato»**: el asistente se abre con el cliente, el valor y lo cotizado ya llenos                                                                                    |
| Valor en letras              | El contrato dice, por ejemplo, «DIEZ MILLONES DE PESOS M/CTE. ($ 10.000.000,00)»                                                                                                                                                                                       |
| Edición del borrador         | **«Editar»** muestra los datos y el texto cláusula por cláusula. Cambiar un texto la marca **«Modificada»**; agregar una la marca **«Nueva»**; hay botones para **restaurar el texto de la biblioteca** y quitar las opcionales                                        |
| Aprobación                   | **«Pedir la revisión»**: la Dirección recibe la tarea en **Mis tareas**. Si hay cláusulas modificadas o nuevas, debe aprobar desde la ficha, **marcando cada una como revisada**; puede dejar el concepto jurídico. También puede **devolver** con un comentario       |
| PDF definitivo               | Al aprobarse, la plataforma genera el PDF con el encabezado institucional (código del formato, versión y páginas), las cláusulas numeradas (PRIMERA, SEGUNDA…) y el espacio de las firmas. Guarda su **huella digital** (prueba de que no cambió)                      |
| Firma manuscrita             | **«Registrar la firma»**: se sube el PDF aprobado, impreso, firmado por todos y escaneado, con la fecha de la última firma. El contrato queda **«Vigente»**. La firma electrónica llega con el B25                                                                     |
| Vencimiento                  | A **90, 60 y 30 días** del fin, el responsable recibe una **tarea en Mis tareas** y un aviso, y el contrato pasa a **«Por vencer»**. Si llega el fin sin prórroga, queda **«Terminado»**                                                                               |
| Obligaciones                 | Pestaña **Obligaciones**: hitos con responsable y fecha. Aviso 7 días antes; si la fecha pasa sin cumplirse, queda **«Vencida»**                                                                                                                                       |
| Otrosíes y prórrogas         | Pestaña **Otrosíes**: Comercial propone un otrosí (qué cambia, texto, fecha, nueva fecha de fin o nuevo valor); la Dirección lo aprueba; tiene su PDF y **rige al registrar su copia firmada**, que cambia el contrato. La **prórroga** la crea la Dirección           |
| Terminación                  | La Dirección puede **terminar** un contrato vigente antes de tiempo, con fecha y motivo                                                                                                                                                                                |
| Expediente contractual       | Pestaña **Expediente**: el PDF aprobado y su huella, la copia firmada, y los **comentarios y anexos** del contrato. Con el resumen, el texto, las obligaciones y los otrosíes, la ficha es el expediente completo                                                      |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `ctr_clause_library`,
`ctr_templates`, `ctr_template_clauses`, `ctr_contracts`, `ctr_contract_clauses`,
`ctr_obligations` y `ctr_amendments`. Diccionario en [`ctr.md`](../manual/datos/ctr.md).

**Rutas nuevas de la API:** 20, en [`apps/api/README.md`](../../apps/api/README.md) y en
`apps/api/openapi.json`. **Trabajos nuevos del worker:** los PDF (cada 20 segundos) y la revisión
diaria de vencimientos y obligaciones (6:15 a. m.).

**Lineamientos visuales del B22A:** las pantallas usan solo componentes de `@arza/ui`, los tokens
de color, una acción principal por pantalla («Nuevo contrato», «Generar el contrato», «Aprobar»,
«Registrar la firma»), resumen de errores en cada formulario y estados de carga, vacío y error.
Contratos dejó de decir «en construcción»; ahora lo dice Proyectos (B26).

## Cómo se probó

### Los dos criterios del bloque

**«Un contrato generado es idéntico al modelo salvo las variables».** Para cada una de las cuatro
plantillas, la prueba genera un contrato real en la base de datos y compara cada cláusula con el
modelo de la biblioteca: todo lo que no es un dato del contrato es igual, letra por letra. Otra
prueba demuestra que el comparador sí detecta un solo carácter cambiado (por ejemplo «El» en vez
de «EL») o un espacio de más.

**«Una cláusula modificada exige aprobación de la Dirección».** La prueba cambia la garantía y
agrega una cláusula penal: las dos quedan marcadas. La Dirección intenta aprobar sin revisarlas y
la plataforma se niega; marca solo una y se niega otra vez; marca las dos y aprueba. Desde Mis
tareas tampoco se puede aprobar ese contrato: hay que hacerlo desde la ficha. Comercial no puede
aprobar, y quien elaboró el contrato no lo aprueba aunque tenga el rol de Dirección.

### Lo demás

| Prueba                           | Qué demuestra                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datos del contrato               | Llena el cliente, su documento, quien firma, el código, el valor en letras y las fechas en dd/mm/aaaa; la orden de servicio lleva el código OS y el acuerdo de confidencialidad puede ir sin valor |
| Lo que el asistente no acepta    | Sin valor (salvo confidencialidad), fechas al revés, cliente, plantilla, cotización o responsable que no existen                                                                                   |
| Desde la cotización              | El asistente trae los datos de la aceptada y el contrato la cita; no usa una cotización sin aceptar ni la de otro cliente                                                                          |
| **Un aprobado no se edita**      | Tiene su PDF con huella; no cambia ni por la API ni directamente en la base de datos (la base lo rechaza), y sus cláusulas tampoco                                                                 |
| Cláusulas                        | No se quita una obligatoria, sí una opcional; restaurar el texto de la biblioteca quita la marca                                                                                                   |
| Firma manuscrita                 | Solo un PDF suyo que pasó el antivirus, con fecha entre la aprobación y hoy; queda vigente                                                                                                         |
| **Vencimiento**                  | Con el reloj adelantado: avisa a 90 días con tarea al responsable, no repite, avisa a 60 sin duplicar la tarea abierta y, pasado el fin, queda terminado                                           |
| Obligaciones                     | Aviso 7 días antes (una sola vez), vencida al pasar la fecha, cumplida con nota                                                                                                                    |
| Otrosíes, prórroga y terminación | El otrosí lo aprueba la Dirección, tiene PDF y al registrar la firmada cambia el fin y el valor; Comercial no prorroga ni termina; la Dirección sí                                                 |
| Biblioteca                       | Solo la Dirección agrega y versiona; no acepta variables desconocidas ni claves repetidas; la versión anterior se conserva                                                                         |
| Pantallas                        | 26 pruebas nuevas de pantalla y, en un navegador real, la lista, la ficha, el asistente y la biblioteca sin fallas de accesibilidad en modo claro y oscuro                                         |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el portal y el Oficial de datos no ven contratos; el Contador los lee pero
  no crea, no pide revisión ni registra obligaciones; Comercial no aprueba, no prorroga, no termina
  ni cambia la biblioteca. El **Colaborador** solo ve los contratos de los que es responsable: los
  demás, para él, «no existen».
- **Aislamiento:** otra empresa no ve, no edita, no aprueba ni registra obligaciones en los
  contratos de esta; un contrato no puede usar el cliente ni la plantilla de otra empresa.
- **Auditoría:** cada paso deja su evento (crear, guardar, pedir revisión, aprobar, devolver, PDF,
  firma, terminar, prorrogar, alertas, obligaciones, otrosíes y biblioteca). El recorrido de
  auditoría de la plataforma ya incluye las 19 rutas nuevas que escriben.

### Resultado de `pnpm check`

El 30/10/2026, paso por paso en este equipo (ver las notas). **Todo lo del B24 pasa. Quedan dos
fallas que no son de este bloque: una prueba de seguridad que el B23 dejó desactualizada y la
carga de los 251 documentos del B19, que falla igual en la versión anterior.**

| Paso                    | Resultado                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                                                                                     |
| Estilo (ESLint) y tipos | Sin problemas                                                                                                                                                           |
| Fronteras entre módulos | Sin problemas: Contratos usa núcleo, terceros, CRM, documentos, flujos e identidad solo por sus índices                                                                 |
| Código sin usar (knip)  | Sin problemas, después de corregir lo que encontró (nota 4)                                                                                                             |
| Pruebas unitarias       | Contratos 171, plantillas 22, worker 42 (cobertura 92 %), web 531 (nota 3) y API 333 de 336 (nota 2)                                                                    |
| Pruebas de integración  | Las 27 de Contratos y el recorrido de auditoría completo pasan. Las de Documentos y del worker que fallaron por memoria pasan solas, salvo la carga de los 251 (nota 2) |
| Compilación             | Sin problemas                                                                                                                                                           |
| Pruebas en navegador    | 244 de 244, incluidas las de accesibilidad de Contratos en modo claro y oscuro                                                                                          |
| Búsqueda de secretos    | Ninguno                                                                                                                                                                 |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo                                                                                                   |

**Cosas que debe saber de esta verificación:**

1. **Formato:** como en los bloques anteriores, excluí la carpeta local de herramientas `.agents/`
   y `skills-lock.json`, que no son del proyecto.
2. **Dos fallas que no son del B24:**
   - **Prueba de rutas públicas** (`apps/api/test/access.test.ts`): revisa que las únicas rutas sin
     sesión sean las de acceso, estado y archivos. El B23 agregó las del enlace de la cotización
     (`/v1/public/quotes/…`) y no actualizó esa lista, que no cambia desde antes del B23. **No la
     toqué**: ampliar la lista es aflojar un control de seguridad y es decisión suya. Mi
     recomendación es agregar esas cuatro rutas, que son públicas a propósito (decisión 8 del B23:
     el cliente acepta sin usuario, con una llave en el cuerpo de la petición).
   - **Carga de los 251 documentos del Listado Maestro (B19):** no logra abrir transacciones a
     tiempo en este equipo, como en el cierre del B23, donde se comprobó que falla igual sin ningún
     cambio. La prueba de arranque de la API (`startup.test.ts`) también falló una vez por carga,
     como en bloques anteriores.
     La integración continua de GitHub lo confirmará con el pull request, si la facturación de la
     cuenta ya está al día (en el B23 GitHub no corrió por un problema de pago).
3. **Fallas por carga que pasan solas:** la comparación del OpenAPI de la API, una prueba de pantalla de Contratos («Comercial lo edita y
   pide la revisión») y siete de integración (Documentos y worker) fallaron con el equipo lleno
   y pasan al repetirlas solas. Las pruebas unitarias del worker no arrancaron la primera vez: un
   proceso anterior dejó tomada su carpeta de cobertura; las corrí con otra carpeta y pasan.
4. **Errores reales que encontraron las pruebas y corregí:**
   - El trabajo del worker no «veía» los contratos de cada empresa: a sus funciones les faltaba el
     permiso de lectura que sí tienen las de cotizaciones. Lo agregué en la migración.
   - Quince piezas exportadas que solo se usaban en su archivo (knip), y la cobertura del worker
     bajo el 90 %: agregué la prueba que manda los trabajos de cotizaciones y contratos a sus
     procesadores (los de cotizaciones del B23 tampoco la tenían).
5. **Ajustes a pruebas existentes, sin debilitarlas:** la de «módulo en construcción» usaba
   Contratos como ejemplo y ahora usa Proyectos (B26), igual que la de accesibilidad; la del
   OpenAPI incluye las 20 rutas nuevas.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** con el rol **Comercial** y a la persona de
**Dirección** (`direccion@demo-uno.test`, Laura Díaz, del cierre del B19).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b24-contratos
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

La tercera crea las tablas nuevas; la cuarta carga la biblioteca de cláusulas, las cuatro
plantillas y las tareas de aprobación y de vencimiento. Si `pnpm dev` estaba encendido, deténgalo
con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. Mirar la biblioteca

Entre con **Ana** → **Contratos** (menú de la izquierda) → **Biblioteca de cláusulas**. Verá las
cláusulas con el aviso «Por validar por el asesor jurídico» y en qué plantillas está cada una. Ana
no puede cambiarlas.

### 3. Generar un contrato

1. Si en Terceros el cliente es una organización, agréguele un contacto marcado como **firmante
   autorizado** (así el asistente lo propone).
2. Contratos → **«Nuevo contrato»**. Elija la plantilla **CT-COM-001**, busque el cliente, y llene
   título, objeto, valor (por ejemplo `10000000`), forma de pago, fechas y quién firma (o pulse
   «Usar a …»). **«Generar el contrato»**.
3. Se abre la ficha con el código `CTR-2026-…`. En la pestaña **Texto** lea el contrato: el
   nombre del cliente, el valor «DIEZ MILLONES DE PESOS M/CTE.» y las fechas ya están puestos.

### 4. Cambiar una cláusula

1. **«Editar»**. Cambie el texto de la **Garantía** (por ejemplo, «seis meses»): aparece
   **«Modificada»** y el aviso de que la Dirección deberá revisarla. Pruebe **«Restaurar el texto
   de la biblioteca»** y vuelva a cambiarlo.
2. **«Agregar una cláusula nueva»**: escriba un título y un texto. Aparece **«Nueva»**.
3. **«Guardar el borrador»**. En la pestaña Texto verá las dos marcadas y, en la modificada,
   «Ver el texto de la biblioteca» para comparar.

### 5. La aprobación de la Dirección

1. Con Ana, **«Pedir la revisión»**. Queda **«En revisión»**.
2. Entre con la persona de **Dirección** → **Mis tareas**: está «Aprobar el contrato CTR-…». Si
   intenta aprobarlo desde la tarea, la plataforma le pide hacerlo desde la ficha. Abra el contrato
   y pulse **«Aprobar»**: verá la lista de las cláusulas modificadas o nuevas. Sin marcarlas no
   aprueba; márquelas, escriba si quiere el concepto jurídico y apruebe.
3. En unos segundos aparece **«Descargar PDF»**: ábralo y revise el encabezado, las cláusulas
   numeradas y el espacio de las firmas.

### 6. Registrar la firma

1. Imprima el PDF, fírmelo (o simplemente use cualquier PDF de prueba) y súbalo en **Archivos**.
2. Con Ana, en la ficha → **«Registrar la firma»**: elija ese PDF y la fecha de hoy. El contrato
   queda **«Vigente»** y en la pestaña **Expediente** aparece la copia firmada.

### 7. Obligaciones, otrosí y prórroga

1. Pestaña **Obligaciones** → **«Registrar una obligación»** con una fecha de dentro de 5 días.
   Mañana a las 6:15 a. m. le llegará el aviso. **«Marcar cumplida»** la cierra.
2. Pestaña **Otrosíes** → **«Proponer un otrosí»** con una nueva fecha de fin. Con la Dirección,
   **«Aprobar»**; luego **«Registrar la firma»** del otrosí: la fecha de fin del contrato cambia.
3. Con la Dirección, en la ficha → **«Prorrogar»** o **«Terminar»**.

### 8. Desde una cotización (opcional)

Haga que un cliente acepte una cotización (pasos del cierre del B23). Ana recibe el aviso «el
cliente la aceptó; ya puede crear el contrato»: al abrirlo, el asistente ya trae el cliente, el
valor y lo cotizado.

### 9. El vencimiento (opcional)

Genere un contrato que termine dentro de 80 días y regístrele la firma. Al día siguiente, a las
6:15 a. m., queda **«Por vencer»** y el responsable tiene la tarea en Mis tareas. (Las pruebas
automáticas lo comprueban adelantando el reloj, sin esperar.)

## Pendientes

- **Firma electrónica (B25):** envío a firma, enlace y código al correo, evidencia, verificación
  pública y el estado «En firma». Por ahora la firma es manuscrita digitalizada.
- **Archivar en el expediente del tercero:** el manual lo pide al completar la firma electrónica
  (evento del B25); en este bloque el expediente vive en la ficha del contrato.
- **Proponer el proyecto (B26):** el evento `contract.signed` ya queda en la bandeja de salida.
- **Contratos laborales (B35) y comodatos (B34):** usarán este mismo mecanismo.
- **Validación del asesor jurídico:** las 28 cláusulas y las cuatro plantillas son una propuesta.
  El asesor debe revisarlas antes de producción (numeral 19.4); la Dirección marca cada una como
  validada al crear su versión nueva. Si aparecen los formatos originales, se cargan igual.
- **Concepto jurídico formal:** hoy es una nota de la Dirección al aprobar.
- **Elegir otro responsable:** el asistente deja como responsable a quien crea el contrato; la API
  ya acepta otro, pero la pantalla para elegirlo llega cuando exista un buscador de colaboradores
  para Comercial.
- **Etiquetas de auditoría:** la pantalla de Auditoría muestra las acciones de Contratos con su
  nombre técnico (por ejemplo `contract.approve`), igual que las de Cotizaciones.
- **Pull requests #35 y #37:** esta rama sale de ellos. Conviene aprobarlos primero; luego este
  pull request queda solo con lo del B24.

## Decisiones tomadas

Las diez que usted aprobó el 29/10/2026:

1. **Punto de partida:** la rama del B24 sale de la del B23.
2. **Textos de las plantillas** redactados por el equipo y marcados «por validar por el asesor
   jurídico»: CT-COM-001 desarrollo de software, CT-COM-002 soporte y mantenimiento, CT-COM-003
   acuerdo de confidencialidad, OS-COM-001 orden de servicio.
3. **Todo contrato pasa por la Dirección**; las cláusulas modificadas se revisan una por una.
4. **Nadie aprueba su propio contrato** ni su propio otrosí.
5. **Firma manuscrita digitalizada** mientras llega la firma electrónica.
6. **Prorrogar** crea una prórroga que rige al registrar la firmada; la renovación automática
   nunca prorroga sola: avisa.
7. **Otrosí:** resumen, texto, fecha, nueva fecha de fin o nuevo valor; lo aprueba la Dirección,
   tiene PDF y rige con la copia firmada.
8. **Códigos:** `CTR-AAAA-NNNN`, `OS-AAAA-NNNN` y el otrosí con `-OT01`.
9. **Desde la cotización aceptada:** aviso con el enlace al asistente lleno; valor en letras.
10. **Obligaciones:** aviso 7 días antes y «Vencida» al pasar la fecha.

Y otras que tomé al construir, sin cambiar lo aprobado:

- **Tres tablas más que las del manual** (`ctr_templates`, `ctr_template_clauses` y
  `ctr_contract_clauses`): son las que permiten demostrar los dos criterios del bloque.
- **Cambiar el título de una cláusula también la marca como modificada.**
- **Un contrato con cláusulas modificadas no se aprueba desde Mis tareas**, porque allí no se
  pueden revisar una por una; se aprueba desde la ficha. Uno sin cambios sí se aprueba desde la
  tarea.
- **Al pasar su fecha de fin sin prórroga, el contrato queda «Terminado»** solo, con el motivo
  «Terminó su plazo el dd/mm/aaaa».
- **Si la tarea de vencimiento sigue abierta**, la alerta de 60 o 30 días llega como aviso y no
  duplica la tarea.
- **La copia firmada solo se registra cuando el PDF aprobado ya está listo**, y con una fecha
  entre la aprobación y hoy.
- **El motor de tareas acepta «a nombre de quién» corre un trámite** que inicia el sistema: así
  la tarea de vencimiento le llega al responsable del contrato sin que la auditoría diga que él la
  inició.
- **Los comentarios y anexos del expediente** reutilizan los de toda la plataforma (B16).
- **La biblioteca se consulta en `/v1/contract-clauses`** (el manual dice `clauses`), para no
  confundirla con la ficha de un contrato.
- **Las acciones del otrosí** van en `/v1/contracts/{id}/amendments/{id}/actions/…`, y la prórroga
  en `/v1/contracts/{id}/actions/renew`, como pide el capítulo 14.

## Commits

- `92d0c33` feat(contracts): schemas, clause text rules and expiry alerts for contracts
- `7f75726` feat(contracts): tables for clauses, templates, contracts, obligations and amendments
- `c7a3305` feat(contracts): contracts module with templates, approval, signature and amendments
- `de22f53` feat(contracts): wire contracts into the API, seed, worker jobs and notices
- `10de906` test(contracts): generation, approval, follow-up, access, isolation and audit tour
- `7f8c930` feat(web): contracts list, wizard, draft editor, case file and clause library
- `1d1ef72` fix(contracts): drop unused exports and cover the contract and quote job routes
- `42c4fe7` docs(contracts): data dictionary and API guide for contracts
- (este cierre) docs(blocks): closure of block B24
