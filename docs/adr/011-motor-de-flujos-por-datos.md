# ADR-011: Motor de flujos definido por datos

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Los procesos del SGC cambian y no debería hacer falta programar para ajustarlos.

## Decisión

Los estados, transiciones y aprobaciones se definen como datos que interpreta un motor único.

## Alternativas consideradas

- Flujos programados en cada módulo · directo · cada cambio exige desarrollo · descartado.
- Motor externo de procesos · potente · más piezas y complejidad · descartado.

## Consecuencias

Cambiar un proceso no exige reprogramar. El motor debe probarse con rigor.

## Cumplimiento

Pruebas del bloque B15.
