# Diccionario de datos · Finanzas (fin\_)

Tablas de Finanzas (capítulo 12.4, ficha 17.11). Se actualiza en el mismo pull request que cambia
el modelo (`apps/api/prisma/schema.prisma`). `fin_tax_parameters` se incorporó en B23. B31 agrega
facturas, líneas, notas crédito y recaudos. La cartera por edades, el deterioro y la programación
de cobros quedan pendientes de reglas aprobadas. Migraciones: `20261028000000_crm_services_quotes_and_tax_parameters`
y `20261110000000_fin_invoices_credit_notes_payments`.

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
