# ADR-017: Despliegue con Docker Compose en un servidor por ambiente

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Se necesita un despliegue reproducible y económico, operable por un equipo pequeño.

## Decisión

Cada ambiente (pruebas y producción) es un servidor con Docker Compose.

## Alternativas consideradas

- Kubernetes · escalable · complejo y costoso de operar · descartado.
- Instalación manual · sin contenedores · no reproducible · descartado.

## Consecuencias

Despliegues reproducibles y baratos. La escala está limitada a un servidor por ambiente.

## Cumplimiento

Archivos en `infra/compose/`; bloques B06, B07 y B44.
