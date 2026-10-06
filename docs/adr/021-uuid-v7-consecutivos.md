# ADR-021: Identificadores UUID versión 7 y consecutivos de negocio separados

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Los identificadores internos no deben ser adivinables; las personas necesitan códigos legibles.

## Decisión

Identificadores internos UUID v7. Los códigos de negocio (PREFIJO-AAAA-NNNN) los entrega el servicio de consecutivos.

## Alternativas consideradas

- Números autoincrementales · legibles · adivinables y revelan volumen · descartado.
- UUID v4 · no adivinables · no ordenables por tiempo · descartado.

## Consecuencias

Identificadores seguros y ordenables, y códigos legibles sin saltos ni duplicados.

## Cumplimiento

Pruebas de los bloques B03 y B12.
