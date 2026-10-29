# Diccionario de datos · Finanzas (fin\_)

Tablas de Finanzas (capítulo 12.4, ficha 17.11). Se actualiza en el mismo pull request que cambia
el modelo (`apps/api/prisma/schema.prisma`). En B23 solo llega `fin_tax_parameters`, porque las
cotizaciones calculan el impuesto con ella; el resto de Finanzas llega en B31 y B32. Migración:
`20261028000000_crm_services_quotes_and_tax_parameters`.

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
