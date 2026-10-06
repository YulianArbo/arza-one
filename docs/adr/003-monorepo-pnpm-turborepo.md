# ADR-003: Monorepo con pnpm y Turborepo

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

La API, el worker, la web y los paquetes compartidos cambian juntos con frecuencia.

## Decisión

Un solo repositorio gestionado con pnpm (espacios de trabajo) y Turborepo (orquestación y caché de tareas).

## Alternativas consideradas

- Un repositorio por aplicación · independencia · cambios no atómicos y versiones desalineadas · descartado.
- npm o Yarn · conocidos · pnpm es más estricto con dependencias no declaradas y más rápido · descartado.

## Consecuencias

Cambios atómicos y una sola versión. Cada paquete declara sus dependencias explícitamente.

## Cumplimiento

`pnpm-workspace.yaml`, `turbo.json` y `knip` (detecta dependencias no declaradas o sin uso).
