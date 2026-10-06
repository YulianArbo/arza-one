# ADR-022: Inteligencia artificial solo mediante pasarela con control de permisos y registro

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

La inteligencia artificial no debe saltarse la autorización ni recibir datos sin evaluación.

## Decisión

Toda llamada a un modelo de IA pasa por una pasarela que verifica permisos, filtra datos y registra la operación.

## Alternativas consideradas

- Llamadas directas desde cada módulo · simples · sin control ni registro · descartado.

## Consecuencias

La IA respeta los mismos permisos que las personas. Se agrega una capa que mantener.

## Cumplimiento

Pruebas y revisión externa del bloque B47.
