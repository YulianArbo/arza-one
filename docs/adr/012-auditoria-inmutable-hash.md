# ADR-012: Auditoría inmutable encadenada por hash en la misma transacción

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Toda operación relevante debe dejar evidencia confiable de quién, qué, cuándo y con qué autorización.

## Decisión

Cada escritura inserta su evento de auditoría en la misma transacción. Los eventos se encadenan por hash y no se pueden modificar.

## Alternativas consideradas

- Registro de auditoría asíncrono · menos carga · puede perder eventos · descartado.
- Solo registros de la aplicación · simple · no son evidencia confiable · descartado.

## Consecuencias

Evidencia verificable de cada operación. Cada escritura es un poco más costosa.

## Cumplimiento

Pruebas de auditoría en cada bloque desde B11 y verificación de la cadena (`audit.chain.verify`).
