# ADR-004: NestJS para la API y el worker

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

El backend necesita módulos, inyección de dependencias y una cadena de petición uniforme (capítulo 13.1).

## Decisión

La API y el worker se construyen con NestJS. El worker reutiliza los módulos de la API por su interfaz pública.

## Alternativas consideradas

- Express o Fastify sin marco · ligeros · cada equipo inventa su estructura · descartado.
- Otro lenguaje para el backend · contradice ADR-002 · descartado.

## Consecuencias

Convenciones claras y comprobables. Se acepta la curva de aprendizaje del marco.

## Cumplimiento

Regla `no-worker-to-module-internals` de dependency-cruiser. El esqueleto se construye en B02.
