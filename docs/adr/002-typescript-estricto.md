# ADR-002: TypeScript estricto en backend, frontend y contratos compartidos

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Un solo equipo escribe backend, frontend y contratos. Los errores de tipos deben detectarse antes de ejecutar.

## Decisión

Todo el código en TypeScript con `strict` y opciones adicionales (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, entre otras) definidas en `tsconfig.base.json`. Prohibido `any`.

## Alternativas consideradas

- JavaScript sin tipos · menos configuración · errores en ejecución · descartado.
- Lenguajes distintos por capa · especialización · duplica contratos y conocimiento · descartado.

## Consecuencias

Más rigor al escribir, menos errores en producción. Los contratos se comparten sin duplicar tipos.

## Cumplimiento

`pnpm typecheck` y la regla `@typescript-eslint/no-explicit-any` en `pnpm lint`.
