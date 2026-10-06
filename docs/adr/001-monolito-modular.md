# ADR-001: Monolito modular con fronteras verificadas automáticamente

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

ARZA ONE tiene más de veinte módulos y lo construye y opera un equipo pequeño. Se necesita orden interno sin el costo de operar muchos servicios (capítulo 8.1).

## Decisión

Una sola aplicación de servidor dividida en módulos (`apps/api/src/modules/<modulo>`) con capas interface → application → domain → infrastructure. Un módulo usa a otro solo por su `index.ts` o por eventos de dominio.

## Alternativas consideradas

- Microservicios · escalan por separado · exigen operar, desplegar y monitorear muchas piezas · desproporcionado para el equipo.
- Monolito sin fronteras · simple al inicio · se vuelve inmantenible · no permite separar módulos en el futuro.

## Consecuencias

Un solo despliegue y una sola base de datos. Cada módulo se puede entender y probar por separado. Se acepta el costo de mantener las reglas de fronteras.

## Cumplimiento

`pnpm boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`): reglas `no-module-internals`, `no-core-to-business` y de dirección de capas. Pruebas en `packages/config/test/boundaries.test.ts`.
