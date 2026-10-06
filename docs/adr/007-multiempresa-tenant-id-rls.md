# ADR-007: Aislamiento multiempresa con tenant_id y seguridad por fila

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

La plataforma debe impedir que una empresa vea datos de otra, incluso si el código tiene un error.

## Decisión

Toda tabla de negocio lleva `tenant_id` y política RLS. Cada transacción fija `app.tenant_id` con `SET LOCAL`.

## Alternativas consideradas

- Una base de datos por empresa · aislamiento físico · operación y migraciones multiplicadas · descartado.
- Filtro solo en el código · simple · un error expone datos · descartado.

## Consecuencias

La base de datos protege aunque el código falle. Toda funcionalidad necesita pruebas de aislamiento.

## Cumplimiento

Pruebas de aislamiento entre empresas en cada bloque desde B03.
