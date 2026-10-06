# ADR-014: Trabajos asíncronos con BullMQ sobre Valkey

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Correos, PDF, análisis antivirus y recordatorios no deben bloquear las peticiones de los usuarios.

## Decisión

Los trabajos en segundo plano se ejecutan en el worker con BullMQ sobre Valkey, con reintentos y programación.

## Alternativas consideradas

- Ejecutar todo dentro de la petición · simple · lento y frágil · descartado.
- Colas en la base de datos · menos piezas · menor rendimiento y menos funciones · descartado.

## Consecuencias

Tareas lentas aisladas y con reintentos. Los trabajos deben ser idempotentes.

## Cumplimiento

Pruebas del bloque B06 (el trabajo de ejemplo se reintenta al fallar).
