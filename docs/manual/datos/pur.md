# Compras, proveedores y viajes (M11) — datos

> Bloque B33. Ficha 17.12 del Manual Maestro. Los activos (`ast_`) están en [`ast.md`](ast.md) (B34).

Importes en `numeric(18,2)`; columnas de control, RLS por `tenant_id` y acceso sin `DELETE` (quitar
una cotización o un gasto de viaje marca `deleted_at`). Los centros de costo y los topes se leen
por la interfaz pública de Núcleo; los proveedores y su conocimiento del tercero, por la de
Terceros; los archivos, por la de Documentos. Ningún otro módulo lee las tablas `pur_`.

## Topes de aprobación (parámetro `purchase.approval_tiers`)

Parámetro con vigencia de Núcleo (Administración › Parámetros). Valores sembrados **de ejemplo**,
pendientes de validar contra PR-ADM-001:

| Tramo | Valor de la compra | Cotizaciones mínimas | Quién aprueba |
| --- | --- | --- | --- |
| Bajo | Hasta $ 1.000.000 | 1 | Administrativo y financiero o Dirección |
| Medio | Hasta $ 10.000.000 | 2 | Administrativo y financiero o Dirección |
| Alto | Más de $ 10.000.000 | 3 | Solo la Dirección |

El valor que manda es el de la cotización elegida o, si aún no hay, el estimado. El tope de cada
tramo queda incluido en el tramo de abajo.

## Tablas

| Tabla | Datos y reglas principales |
| --- | --- |
| `pur_requests` | Solicitud con código `SC-AAAA-NNNN`, solicitante, centro de costo, descripción y valor estimado. Estados: `draft` → `in_approval` → `approved` → `quoted` → `ordered` → `received` → `closed`, o `rejected` (con motivo). Guarda el valor con que se aprobó (`approved_amount`). Solo su autor la edita y la envía, y solo en borrador. **Quien solicita no aprueba**: lo impiden la API y la restricción `pur_requests_segregation_check`. |
| `pur_quotes` | Cotización de un proveedor vigente para una solicitud aprobada: valor, días de entrega (0 a 365) y archivo obligatorio. Una vigente por proveedor y solicitud, y una sola elegida (`selected`), ambas por índice único parcial. Elegir exige las cotizaciones mínimas del tramo del valor elegido; si ese tramo es mayor que el aprobado, la solicitud vuelve a `in_approval` (decisión 5). La elegida no se quita. |
| `pur_orders` | Orden con código `OC-AAAA-NNNN`, proveedor y total de la cotización elegida. `issued` → `received` → `closed`. Una por solicitud. **No se emite a un proveedor sin conocimiento del tercero vigente** (último aprobado y sin vencer). `document_id` queda vacío: el PDF de la orden está pendiente (decisión 9). |
| `pur_receipts` | Recepción de una orden: fecha (ni futura ni anterior a la orden), quién recibe, si llegó conforme y la novedad (obligatoria si no). **Quien pidió la compra no la recibe.** Una sola conforme por orden; las no conformes quedan como novedades (RE-ADM-002) y la orden sigue abierta. |
| `pur_supplier_evaluations` | Selección o reevaluación de un proveedor en un periodo (`AAAA`, `AAAA-1` o `AAAA-2`): cuatro criterios de 1 a 5 (`quality`, `compliance`, `price`, `service`), puntaje promedio y resultado: 4 o más `approved`; de 3 a menos de 4 `conditional`; menos de 3 `rejected`. Una por proveedor, tipo y periodo; no se edita. Un resultado «no aprobado» no bloquea órdenes (decisión 6). |
| `pur_travel_requests` | Viaje con código `SV-AAAA-NNNN`, viajero, destino, motivo, fechas y anticipo (puede ser cero). `draft` → `in_approval` → `approved` o `rejected` → `legalized`. **El viajero no aprueba su viaje** (API y restricción `pur_travel_requests_segregation_check`). |
| `pur_travel_expenses` | Gasto de la legalización: concepto, valor y soporte obligatorio. Solo el viajero los registra y quita, con el viaje aprobado y desde el día de salida. Legalizar exige al menos un gasto. El saldo (anticipo menos gastos) se calcula; no crea movimientos en Finanzas (decisión 7). |

Criterios y cortes de la evaluación son **provisionales** hasta validarlos contra RE-ADM-001.

## API

| Recurso | Puntos |
| --- | --- |
| Solicitudes | `GET /v1/purchase-requests` · `GET …/mine` · `GET …/options` · `POST` · `PUT …/{id}` · `POST …/{id}/submission` · `…/approval` · `…/rejection` |
| Cotizaciones | `POST /v1/purchase-requests/{id}/quotes` · `DELETE /v1/purchase-quotes/{id}` · `POST /v1/purchase-quotes/{id}/selection` |
| Órdenes | `GET /v1/purchase-orders` · `POST /v1/purchase-requests/{id}/order` · `POST /v1/purchase-orders/{id}/receipts` · `…/closure` |
| Evaluaciones | `GET /v1/supplier-evaluations` · `POST` |
| Viajes | `GET /v1/travel-requests` · `GET …/mine` · `POST` · `PUT …/{id}` · `POST …/{id}/submission` · `…/approval` · `…/rejection` · `…/expenses` · `…/legalization` · `DELETE /v1/travel-expenses/{id}` |

Las transiciones usan el estilo de sustantivo ya adoptado en Finanzas (`…/approval`) en lugar de
`actions/approve` que nombra el capítulo 14. Las escrituras sobre un registro existente llevan
`If-Match` con su versión; las creaciones de solicitud, viaje, recepción y gasto de viaje llevan
`Idempotency-Key`.

## Auditoría y eventos

`purchase.request.create|update|submit|approve|reject`, `purchase.quote.add|remove|select`,
`purchase.order.issue|receive|close`, `purchase.supplier.evaluate`,
`purchase.travel.create|update|submit|approve|reject|legalize` y
`purchase.travel.expense.add|remove`. Bandeja de salida: `pur.request.*`, `pur.quote.*`,
`pur.order.*`, `pur.supplier.evaluated` y `pur.travel.*`.

## Permisos

Los siete del anexo G (`purchase.request.create`, `purchase.request.approve`,
`purchase.order.issue`, `purchase.order.receive`, `purchase.supplier.evaluate`,
`purchase.travel.request`, `purchase.travel.approve`) y dos nuevos:

- `purchase.read` — «Ver compras, proveedores y viajes»: Dirección, Calidad, Administrativo y
  financiero, Contador y Auditor (letra L o C de la matriz 15.3). Quien solo pide lo suyo usa las
  rutas `…/mine`.
- `purchase.request.approve_high` — «Aprobar compras del tramo alto»: solo Dirección (permiso
  restringido).

Las cotizaciones y la orden las gestiona quien tiene `purchase.order.issue`.

## Pendientes

Validar topes y criterios contra los documentos PR-ADM y RE-ADM; aprobaciones en «Mis tareas»
(motor de flujos); PDF de la orden de compra; movimientos de anticipo y legalización en Finanzas;
revisión de la legalización por un tercero; activos (B34).
