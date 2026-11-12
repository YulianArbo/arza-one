# Cierre del bloque B31: Facturación, cartera y recaudo

- Fecha: 10/11/2026; última verificación y correcciones finales: 11/11/2026
- Rama: `feat/b31-facturacion-cartera-y-recaudo` (sale del HEAD del B30, que aún no está unido a `main`)
- Estado: en revisión. No es un bloque crítico: basta con la aprobación del Director General.
- Pendiente principal: la suite completa de integración no cierra en una sola corrida en este
  equipo por saturación de PostgreSQL; el resto de la cadena está en verde (ver «Resultado de las
  verificaciones»).

## Qué se construyó

La **primera parte de Finanzas (M10)**: solicitar una factura desde un hito ya aceptado, aprobarla,
registrar el documento fiscal que se emitió por fuera de ARZA ONE (número, valores y archivo),
corregir con **nota crédito** y registrar **recaudos** aplicados a la factura. El cliente ve sus
facturas y notas crédito emitidas en el portal y las descarga con un enlace auditado.

ARZA ONE **no calcula ni transmite impuestos**: subtotal, impuestos, retenciones y total se
transcriben del documento emitido. Tampoco admite notas débito: toda corrección de una factura
emitida se hace con nota crédito.

| Pieza                         | Qué hace, en palabras sencillas                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablas                        | `fin_invoices`, `fin_invoice_items`, `fin_credit_notes` y `fin_payments`, con `numeric(18,2)`, RLS por empresa, auditoría y outbox. Migraciones `20261110000000_fin_invoices_credit_notes_payments` y `20261111000000_fin_invoices_release_voided_milestone`. |
| Solicitar factura             | Desde un **hito facturable** (aceptado y facturable) del proyecto. Nace en estado `requested` con el valor solicitado.                                                                                                                                        |
| Aprobar                       | Un revisor con permiso aprueba la solicitud. Queda en `approved`, lista para transcribir el documento fiscal.                                                                                                                                                 |
| Registrar el documento fiscal | Se digita fecha de emisión y de vencimiento, subtotal, impuestos, retenciones, total, número fiscal, identificador fiscal opcional y el archivo del soporte. Pasa a `issued`.                                                                                 |
| Nota crédito                  | Corrige una factura emitida: motivo, importe, fecha, número e identificador fiscal y archivo. No puede superar el **saldo pendiente** (total menos recaudos y notas crédito anteriores). No existen notas débito.                                             |
| Recaudo                       | Registra un pago con fecha, importe, medio, referencia y soporte opcional. La factura pasa a `partially_paid` o `paid` según el saldo.                                                                                                                        |
| Anular                        | Anula una solicitud **antes** de emitirla, con motivo, y **libera el hito** para volver a solicitar su factura. Una factura ya emitida se corrige con nota crédito, no se anula.                                                                              |
| Portal del cliente            | **Facturas** lista las facturas emitidas de su empresa con número fiscal, estado, saldo y sus notas crédito, y permite descargar cada documento con un enlace temporal auditado.                                                                              |
| Interfaz interna              | **Finanzas → Facturas y recaudos** (`/app/finanzas/facturas`): solicitudes pendientes por hito, lista de facturas y los formularios de aprobación, registro fiscal, nota crédito, recaudo y anulación.                                                        |
| Permisos                      | Ver facturas, solicitar, aprobar, registrar documento fiscal emitido, anular, registrar pagos y ver/descargar facturas en el portal. El rol de contabilidad conserva «Registrar documento fiscal emitido» (antes «Registrar facturas ante la DIAN»).          |
| Auditoría y eventos           | Cada escritura deja su evento de auditoría y su salida al outbox; los hitos se leen por la interfaz pública de Proyectos (nunca tablas internas).                                                                                                             |

## Criterios de aceptación

| Criterio                                                                  | Estado                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Los criterios de la ficha 17.11 que aplican dentro del alcance confirmado | Cubiertos para facturas, notas crédito, recaudos y consulta/descarga en el portal; el resto depende de reglas pendientes |
| Una factura emitida solo se corrige con nota crédito                      | Cumplido y probado                                                                                                       |
| `pnpm check` en verde                                                     | **Pendiente**: se corrió por partes y la cadena completa no cerró en este equipo                                         |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría       | Cumplido                                                                                                                 |
| Documentación y cierre del bloque escritos                                | Cumplido (este documento, `docs/manual/datos/fin.md` y `docs/manual/datos/permisos-por-rol.md`)                          |

## Cómo se probó

Recorridos dirigidos, todos en verde:

| Verificación                                                                 | Resultado                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos de facturación (`packages/contracts/src/finance/invoices.test.ts`) | 4 de 4                                                                                                                                                                                                                                                                          |
| Pantallas de Finanzas y facturas (web)                                       | 7 de 7 (`finance-screens.test.tsx` y `invoices-panel.test.tsx`)                                                                                                                                                                                                                 |
| Portal web                                                                   | 37 de 37 (secciones del portal, incluida Facturas)                                                                                                                                                                                                                              |
| Recorrido de integración de facturación                                      | Solicitar, aprobar, registrar documento fiscal externo, nota crédito, recaudo, auditoría, permisos, aislamiento entre empresas y consulta/descargas en el portal (1 de 1, repetido el 11/11/2026)                                                                               |
| Reglas de facturación (`invoice-rules.int.test.ts`, 11/11/2026)              | 4 de 4: el hito queda libre al anular la solicitud; se rechazan los pasos fuera de orden y la anulación de una factura emitida; no se recauda ni se acredita más que el saldo; un recaudo repetido no se duplica; de dos recaudos simultáneos por el mismo saldo solo entra uno |
| Pantalla de facturas en el navegador (`e2e/finance.spec.ts`, 11/11/2026)     | 12 de 12: lista, estado vacío y los formularios de solicitud, recaudo, nota crédito y anulación, sin violaciones de accesibilidad en modo claro y oscuro                                                                                                                        |
| Aislamiento del portal con las rutas de facturas                             | 4 de 4                                                                                                                                                                                                                                                                          |
| Recorrido de auditoría de escrituras                                         | 305 de 305 (incluye las seis rutas de Finanzas del B31)                                                                                                                                                                                                                         |
| Estilo de los archivos tocados (ESLint), tipos y límites entre módulos       | En verde (`typecheck`, `boundaries`, `unused`)                                                                                                                                                                                                                                  |
| Compilación (`build`)                                                        | En verde                                                                                                                                                                                                                                                                        |
| Búsqueda de secretos (`secrets`)                                             | Sin hallazgos                                                                                                                                                                                                                                                                   |
| Pruebas unitarias de la API                                                  | 406 de 406, con cobertura 97,43 % líneas, 92,01 % ramas, 96,11 % funciones                                                                                                                                                                                                      |
| Suite completa de integración (última corrida, 11/11/2026)                   | 138 de 151 archivos y 1240 de 1262 pruebas; 13 archivos fallan por saturación de PostgreSQL, no por comprobaciones (ver abajo)                                                                                                                                                  |

### Resultado de las verificaciones

En este equipo la cadena completa de `pnpm check` no cerró de una sola vez. Primero se atribuyó a
la carga de un `pnpm dev` en ejecución; el 11/11/2026 se detuvo todo proceso de Node y se repitió
la suite de integración con 4, 2 y 1 worker. El resultado siguió siendo sensible a los recursos del
equipo: con más paralelismo fallan más archivos, y aun en serie unos pocos agotan la espera de
conexión o de transacción de PostgreSQL. No se quitó ni debilitó ninguna comprobación.

- `format:check`, `build:types`, `typecheck`, `boundaries`, `unused`, `build` y `secrets`: en verde.
- Estilo: en verde para `apps/api`, `apps/web`, `packages` e infraestructura; la orden global
  `eslint .` no terminó en una sola pasada en este equipo.
- Pruebas unitarias de la API: en verde (406) con la configuración ajustada a `maxWorkers: 4`;
  con los 58 procesos que abría antes, los equipos de este tamaño agotaban el tiempo de arranque.
- Pruebas unitarias de la web: 701 de 710. Los 9 fallos fueron **esperas** en archivos no
  relacionados con el B31; al correrlos solos pasan (p. ej. `privacy-forms.test.tsx`, 5 de 5).
- Integración dirigida: el recorrido del B31 y las guardas del portal y de auditoría pasan.
- Integración completa (11/11/2026, 1 worker, 83 min): **138 de 151 archivos y 1240 de 1262
  pruebas**. Los 13 archivos que fallan lo hacen por `timeout exceeded when trying to connect`,
  «no se pudo iniciar una transacción a tiempo» o un 500 en una prueba de concurrencia; cada uno
  pasa al correrlo solo sobre una base recién levantada.

Ajustes a la infraestructura de pruebas hechos aquí, sin cambiar el comportamiento de producción:

- `maxWorkers` de las unitarias de la API, espera de arranque de la prueba del proceso real y
  traslado de la cobertura de Finanzas (B31) y del portal (B30) a integración.
- Cierre de los clientes de base de datos al terminar cada archivo de integración
  (`test/int/support/database-teardown.ts` y `preparationDatabase`), tope de conexiones del
  contenedor (`max_connections=300`) y esperas de conexión/transacción más holgadas solo para
  pruebas.
- `DatabaseService` acepta opcionales `poolSize`, `connectTimeoutMs` y límites de transacción;
  los valores de producción no cambian (2 s de conexión y límites por defecto de Prisma). Las
  pruebas los activan por configuración (`DATABASE_CONNECT_TIMEOUT_MS`,
  `DATABASE_TRANSACTION_MAX_WAIT_MS` y `DATABASE_TRANSACTION_TIMEOUT_MS`).

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita un **hito facturable** de un proyecto (entregable aceptado por el
cliente, como en el B27/B30).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b31-facturacion-cartera-y-recaudo
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

### 2. Solicitar la factura (interno)

1. Entre a **http://localhost:3000/app** con una persona con permiso de Finanzas.
2. Vaya a **Finanzas → Facturas y recaudos**.
3. En **Solicitar factura**, elija el hito facturable y solicítela. Aparece en estado **Solicitada**.

### 3. Aprobar y registrar el documento fiscal (interno)

1. Con una persona que apruebe facturas, pulse **Aprobar** sobre la solicitud.
2. Registre el **documento fiscal emitido**: fechas, subtotal, impuestos, retenciones, total, número
   e identificador fiscal y el archivo del soporte. La factura queda **Emitida**.

### 4. Nota crédito y recaudo (interno)

1. Registre una **nota crédito** sobre una factura emitida (motivo, importe, fecha, número y
   archivo). Queda listada dentro de la factura.
2. Registre un **recaudo** con fecha, importe, medio, referencia y soporte. El estado pasa a **Pago
   parcial** o **Pagada** según el saldo.
3. Compruebe que una solicitud **no** emitida se puede **anular** con motivo, y que una factura ya
   emitida solo se corrige con nota crédito.

### 5. Verlo desde el portal del cliente

1. Entre al portal con una cuenta de administrador del cliente (http://localhost:3000/portal).
2. Abra **Facturas**: verá las facturas de su empresa, su estado, sus notas crédito y el saldo.
3. Pulse **Descargar** en una factura y en una nota crédito: se abre/descarga el soporte con un
   enlace temporal, y la descarga queda auditada.

## Pendientes

- **`pnpm check` completo**: correrlo en CI o en un equipo con más CPU/RAM. El 11/11/2026, sin
  `pnpm dev`, la integración completa llegó a 138/151 archivos y 1240/1262 pruebas; los 13 fallos
  restantes son esperas de PostgreSQL por saturación, no fallos de lógica. En este equipo no cierra
  en una sola corrida.
- **Cartera por edades, deterioro y programación de cobros**: fuera del alcance confirmado; quedan
  para cuando el propietario apruebe sus reglas. El estado del bloque en `B31.md` sigue con esas
  tareas abiertas.
- **Notas débito**: fuera de alcance por decisión del propietario.
- **Devolución de dinero ya recaudado**: una nota crédito no puede superar el saldo pendiente. El
  caso de devolver dinero al cliente (saldo a favor) queda para cuando se aprueben las reglas de
  cartera.
- **Revisión externa**: no aplica al B31 (no es crítico), pero el B30 que lo precede sigue esperando
  revisión externa antes de integrarse.
- **Adaptación de datos en producción**: la migración del B31 se probó desde cero en base
  desechable; no se tocó ninguna base persistente.

## Decisiones tomadas durante la construcción

- **ARZA ONE no calcula impuestos**: los valores se transcriben del documento emitido; la tarifa de
  la línea es opcional y no se usa para calcular.
- **Una factura emitida no se anula**: se corrige con nota crédito. La anulación queda solo para
  solicitudes no emitidas.
- **Una solicitud anulada libera su hito** (corrección del 11/11/2026): antes el hito quedaba
  bloqueado para siempre. Ahora la regla «una factura por hito» cuenta solo las facturas vigentes.
- **La nota crédito se limita al saldo pendiente** (decisión del propietario, 11/11/2026): la suma
  de recaudos y notas crédito nunca supera el total de la factura.
- **El portal solo muestra documentos emitidos** (`issued`, `partially_paid`, `paid`) de la empresa
  de la persona autenticada; las solicitudes y anuladas no se exponen.
- **Los hitos se leen por la interfaz pública de Proyectos**: el módulo de Finanzas no consulta
  tablas internas de Proyectos, y `FinModule` dejó de reexportarse para no arrastrar controladores
  ni crear ciclos entre Finanzas, Proyectos y Contratos.
- **El permiso «Registrar facturas ante la DIAN» se renombró** a «Registrar documento fiscal
  emitido», porque ARZA ONE no transmite ante la DIAN: solo registra lo que ya se emitió.
- **Ajustes de la infraestructura de pruebas** (ver arriba): límite de procesos, espera de arranque,
  cierre de clientes por archivo, tope de conexiones y límites de transacción configurables. No
  cambian ninguna comprobación ni el comportamiento por defecto de producción.
