# ADR-006: PostgreSQL como única base de datos, con Prisma

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Se necesitan transacciones, búsqueda de texto y seguridad por fila con una operación sencilla.

## Decisión

PostgreSQL 17 o superior como única base de datos. Prisma para el modelo, las consultas tipadas y las migraciones.

## Alternativas consideradas

- Varias bases especializadas · optimización por caso · más piezas que operar · descartado.
- Otro ORM o SQL manual · más control · menos seguridad de tipos y más errores · descartado.

## Consecuencias

Un solo motor que respaldar y vigilar. Se acepta depender de las capacidades de Prisma.

## Cumplimiento

Migraciones aplicadas desde cero y sobre la versión anterior (capítulo 11.4, paso 7). Se implementa en B03.
