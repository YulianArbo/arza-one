# ADR-010: Contratos de datos con Zod compartidos y OpenAPI generado

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

El frontend y el backend deben validar exactamente lo mismo y no desalinearse.

## Decisión

Los esquemas Zod, tipos y permisos viven en `packages/contracts` y los usan la API y la web. El OpenAPI se genera desde ellos.

## Alternativas consideradas

- Tipos duplicados en cada lado · independencia · se desalinean · descartado.
- Escribir el OpenAPI a mano · estándar · se desactualiza · descartado.

## Consecuencias

Un cambio de contrato se ve en ambos lados al compilar.

## Cumplimiento

Paquete `@arza/contracts` creado en B01; pruebas de contrato desde B02.
