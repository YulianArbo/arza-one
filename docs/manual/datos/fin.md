# Diccionario de datos · Finanzas (fin\_)

Tablas de Finanzas (capítulo 12.4, ficha 17.11). Se actualiza en el mismo pull request que cambia
el modelo (`apps/api/prisma/schema.prisma`). `fin_tax_parameters` se incorporó en B23. B31 agrega
facturas, líneas, notas crédito y recaudos; B32 agrega presupuesto, gastos, caja menor,
conciliación bancaria, certificación de costos, cierre de periodo y exportación contable. La cartera
por edades, el deterioro y la programación de cobros quedan pendientes de reglas aprobadas. Migraciones: `20261028000000_crm_services_quotes_and_tax_parameters`
`20261110000000_fin_invoices_credit_notes_payments`, `20261111000000_fin_invoices_release_voided_milestone`
y `20261112000000_fin_budget_expenses_petty_cash_exports`.

## Reglas comunes

- **Columnas de control**, **seguridad por fila** (`core_current_tenant_id()`) y permisos de
  `app_user` (`SELECT`, `INSERT`, `UPDATE`; sin `DELETE`) como en las demás tablas de negocio.
- **Auditoría**: `finance.tax_parameter.update` (con la tarifa anterior y la nueva) y
  `finance.tax_parameter.seed`. Bandeja de salida: `fin.tax.parameter.changed`.
- **Permiso**: `finance.tax_parameter.manage` (Contador y Administrativo y financiero).

## fin_tax_parameters · Parámetros tributarios vigentes

| Columna       | Tipo         | Nulo | Regla                                                             |
| ------------- | ------------ | ---- | ----------------------------------------------------------------- |
| `id`          | uuid         | No   | Llave primaria (UUID v7)                                          |
| `tenant_id`   | uuid         | No   | Empresa                                                           |
| `key`         | text         | No   | Clave en mayúsculas, como `IVA_GENERAL`; con `valid_from`, única |
| `label`       | text         | No   | Nombre: 3 a 120 letras                                            |
| `rate`        | numeric(5,2) | No   | Tarifa en porcentaje, de 0 a 100                                  |
| `valid_from`  | date         | No   | Primer día de la vigencia                                         |
| `valid_to`    | date         | Sí   | Último día; vacío si sigue. No antes de `valid_from`              |
| `legal_basis` | text         | No   | Fundamento legal: 5 a 500 letras                                  |
| control       |              |      | Columnas de control                                               |

Una tarifa nueva empieza hoy o más adelante, después de la última, y cierra la anterior el día
antes: el pasado nunca se reescribe. La semilla crea `IVA_GENERAL` (19 %, Estatuto Tributario art.
468) e `IVA_EXENTO` (0 %, arts. 476 y 477), ambas marcadas «Por validar por el Contador».

## Facturación y recaudos (B31)

Todos los importes monetarios se almacenan como `numeric(18,2)`. Las tablas aplican columnas de
control, RLS por `tenant_id` y acceso sin `DELETE`. Los valores fiscales se transcriben del
documento emitido en el sistema fiscal; ARZA ONE no calcula ni transmite impuestos.

| Tabla | Datos y reglas principales |
| --- | --- |
| `fin_invoices` | Solicitud asociada a un hito facturable, cliente y contrato opcional; estados `requested`, `approved`, `issued`, `partially_paid`, `paid` y `voided`; valores fiscales emitidos, número/UUID y archivo fiscal. Una sola factura vigente por hito (una solicitud anulada libera el hito para volver a facturarlo) y un número fiscal único dentro de la empresa. |
| `fin_invoice_items` | Líneas de la factura; cantidad, valor unitario, total de línea y tarifa transcrita opcional. Posición única por factura. La tarifa no se usa para calcular impuestos. |
| `fin_credit_notes` | Nota crédito externa vinculada a la factura, con motivo, importe, fecha, identificación fiscal y archivo. No puede superar el saldo pendiente (total menos recaudos y notas crédito anteriores). No admite notas débito. |
| `fin_payments` | Recaudo aplicado a una factura, con fecha, importe, medio, referencia y soporte opcional. |

Las escrituras de factura, aprobación, emisión, nota crédito y recaudo registran auditoría. Los hitos
se leen mediante la interfaz pública de Proyectos; el portal solo lista documentos emitidos para la
empresa de la persona autenticada y entrega enlaces auditados a facturas y notas crédito.

## Presupuesto, gastos, caja menor, conciliación, certificación, cierre y exportación (B32)

Importes en `numeric(18,2)`; columnas de control, RLS por `tenant_id` y acceso sin `DELETE`. Los
centros de costo, los proveedores y las horas de proyecto se leen por las interfaces públicas de
Núcleo, Terceros y Proyectos. El rubro es una opción del catálogo administrable
`fin_expense_categories` (semilla ficticia: software, servicios profesionales, transporte,
papelería, servicios públicos, alimentación y otros).

| Tabla | Datos y reglas principales |
| --- | --- |
| `fin_budgets` | Un presupuesto por año; `draft` → `approved`. Lo aprueba una persona distinta de quien lo creó; aprobado ya no se edita. |
| `fin_budget_lines` | Centro de costo, rubro, mes (1 a 12) y valor planeado (> 0). Una línea vigente por centro, rubro y mes (índice único parcial); al reemplazar las líneas, las anteriores quedan marcadas como borradas. Lo ejecutado no se guarda: se calcula con los gastos aprobados y los vales de caja menor del año (decisión de no duplicar el dato; el manual nombraba la columna `executed`). |
| `fin_expenses` | Gasto con código `GAS-AAAA-NNNN`, fecha, valor, rubro, centro de costo, proveedor opcional, descripción y soporte obligatorio; `pending` → `approved` o `rejected` (con motivo). Lo decide una persona distinta de quien lo registró. La fecha no puede ser posterior a hoy. |
| `fin_petty_cash` | Libro de la caja menor (una por empresa): `opening` (una sola vez, fija el fondo), `voucher` (resta; lleva centro de costo y rubro) y `replenishment` (suma). Guarda el saldo tras cada movimiento; nunca negativo ni mayor que el fondo, y en orden de fecha. Código `CM-AAAA-NNNN`. En lugar de `voucher_record_id` se guarda `support_file_id` opcional; el arqueo queda pendiente. |
| `fin_bank_reconciliations` | Cuenta por nombre corto (sin el número completo, dato restringido), mes `AAAA-MM`, saldo en libros, saldo del banco y partidas (`differences`, arreglo JSON de descripción y valor con signo). `draft` → `reconciled` solo si libros + partidas = banco. Una por cuenta y mes. |
| `fin_cost_certifications` | Proyecto, mes, horas aprobadas (copiadas de Proyectos al certificar), valor digitado y fase (`research`, `development`, `innovation`). Una por proyecto y mes; código `CCD-AAAA-NNNN`. `form_record_id` no se usa todavía. |
| `fin_periods` | Solo existen filas de meses cerrados (`status = closed`, quién y cuándo). Sin `UPDATE`: un mes no se reabre (decisión 3 del B32). |
| `fin_export_batches` | Lote exportado: mes, tipo (`preliminary` o `definitive`), filas, totales por tipo de movimiento, huella SHA-256 y nombre del archivo. Un solo lote definitivo por mes. `file_id` queda vacío: el archivo se genera en el acto (decisión 8). |

**Periodo cerrado.** El disparador `fin_reject_closed_period` rechaza crear o cambiar filas de
`fin_expenses`, `fin_petty_cash`, `fin_bank_reconciliations`, `fin_cost_certifications`,
`fin_payments` y `fin_credit_notes` cuya fecha contable cae en un mes cerrado, y el registro del
documento fiscal de `fin_invoices` (cambio de `issue_date`). La API lo revisa antes con un mensaje
claro y serializa el cierre con las escrituras mediante un candado por empresa y mes.

**Archivo contable** (decisión 1, pendiente de validación del Contador): CSV UTF-8 con BOM, separado
por punto y coma y con coma decimal. Columnas `fecha;tipo;numero;nit_tercero;tercero;centro_costo;rubro;valor;referencia`.
Tipos: `FACTURA` (total de la factura emitida en el mes), `NOTA_CREDITO`, `RECAUDO`, `GASTO`
(aprobados) y `CAJA_MENOR` (aperturas, vales y reembolsos). Las celdas que empiezan por `=`, `+`,
`-` o `@` llevan apóstrofo para que no se tomen como fórmula.

**Auditoría y eventos.** `finance.budget.create|update|approve`, `finance.expense.create|approve|reject`,
`finance.petty_cash.register`, `finance.reconciliation.create|update|close`,
`finance.cost_certification.create`, `finance.period.close`, `finance.export.create|download`. Bandeja
de salida: `fin.budget.*`, `fin.expense.*`, `fin.pettycash.registered`, `fin.reconciliation.*`,
`fin.costcertification.created`, `fin.period.closed`, `fin.export.*`.

**Permisos.** Nuevos: `finance.ledger.read` (ver gastos, caja menor, conciliaciones y cierre:
Administrativo y financiero, Contador, Dirección y Auditor), `finance.cost_certification.manage`
(Administrativo y financiero) y `finance.period.close` (Administrativo y financiero y Contador).
