# ADR-019: Sistema de diseño con Tailwind CSS y shadcn/ui sobre Radix

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

La interfaz debe ser accesible, coherente con la marca y sin licencias de pago.

## Decisión

Tailwind CSS para los estilos y componentes shadcn/ui sobre Radix, con el código dentro del repositorio (`packages/ui`).

## Alternativas consideradas

- Biblioteca de componentes cerrada · rápida · difícil de adaptar a la marca · descartado.
- Componentes propios desde cero · control total · mucho esfuerzo de accesibilidad · descartado.

## Consecuencias

Componentes accesibles y adaptables. El equipo mantiene el código de los componentes.

## Cumplimiento

Pruebas de accesibilidad con axe-core desde B04.
