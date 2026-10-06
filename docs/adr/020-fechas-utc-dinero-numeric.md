# ADR-020: Fechas en UTC y zona America/Bogota en la interfaz; dinero en numeric(18,2)

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Los errores de zona horaria y de redondeo en dinero son frecuentes y costosos.

## Decisión

Las fechas se guardan en UTC y se muestran en America/Bogota. El dinero se guarda en `numeric(18,2)` y se calcula con decimal.js; nunca con números de punto flotante.

## Alternativas consideradas

- Guardar la hora local · simple · errores al cambiar de zona · descartado.
- Dinero en números de punto flotante · nativo · errores de redondeo · descartado.

## Consecuencias

Cálculos exactos y horas consistentes. Toda pantalla debe convertir la zona al mostrar.

## Cumplimiento

`PLATFORM_DEFAULTS` en `@arza/contracts` (B01) y pruebas de dinero y fechas desde B03.
