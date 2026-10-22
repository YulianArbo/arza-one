# ADR-018: GitHub y GitHub Actions para código, revisión y despliegue

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Se necesita alojar el código, revisar cambios y verificar cada cambio automáticamente sin costo inicial.

## Decisión

El código vive en GitHub; las verificaciones y despliegues corren en GitHub Actions.

## Alternativas consideradas

- GitLab u otro servicio · equivalentes · sin ventaja para el equipo · descartado.

## Consecuencias

Gratuito dentro de la cuota. Las pruebas largas se pueden ejecutar en el equipo local.

## Cumplimiento

Flujos en `.github/workflows/`; bloque B05. Plantilla de pull request creada en B01. Qué tareas
corren en cada cambio: ADR-024.
