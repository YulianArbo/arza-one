# @arza/ui

Sistema de diseño de ARZA ONE (numeral 16.2, ADR-019): tokens de marca, componentes base de
shadcn/ui sobre Radix y los estados de pantalla del numeral 16.5. Lo usan las tres superficies de
`apps/web`. Se construyó en el bloque B04.

## Tokens

`src/styles/tokens.css` define cada valor **una sola vez**, con su versión clara y oscura
(`light-dark()`). La web lo importa con `@import '@arza/ui/styles.css'`.

| Token                                          | Claro                              | Oscuro           | Uso                                        |
| ---------------------------------------------- | ---------------------------------- | ---------------- | ------------------------------------------ |
| `primary`                                      | `#005AFE`                          | `#7FB2FF`        | Acción principal, enlaces, elemento activo |
| `brand-navy` / `sidebar`                       | `#0D1B2A`                          | `#0D1B2A`        | Menú lateral, encabezados                  |
| `brand-accent`                                 | `#7FB2FF`                          | `#7FB2FF`        | Resaltados, módulo activo en el menú       |
| `background`                                   | `#F5F7FB`                          | `#0A1420`        | Fondo de la aplicación                     |
| `card`                                         | `#FFFFFF`                          | `#12243A`        | Tarjetas, campos y menús                   |
| `success` · `warning` · `destructive` · `info` | verde · ámbar · rojo · azul        | versiones claras | Estados; siempre con texto o icono         |
| `font-heading` · `font-sans`                   | Montserrat 600/700 · Inter 400/500 |                  | Títulos · texto                            |
| Radio · sombra                                 | 8 px · una sombra suave            |                  | Tarjetas, campos y botones                 |

- **La paleta por defecto de Tailwind está anulada** (`--color-*: initial`): un color fuera de la
  marca no existe, así que no se puede usar por descuido.
- El espaciado de Tailwind ya avanza de 4 en 4 px.
- En modo oscuro el primario pasa a `#7FB2FF`, porque `#005AFE` sobre fondo oscuro no alcanza el
  contraste mínimo de 4,5:1. Los contrastes se verifican con axe-core en las pruebas de la web.

## Componentes

| Archivo                            | Componentes                                                              |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `button.tsx`                       | `Button` (primario, secundario, contorno, fantasma, destructivo, enlace) |
| `input.tsx`, `label.tsx`           | Campo de texto y etiqueta visible                                        |
| `card.tsx`                         | Tarjeta con título, descripción y contenido                              |
| `badge.tsx`, `alert.tsx`           | Etiqueta de estado y mensaje destacado                                   |
| `table.tsx`                        | Tabla con desplazamiento horizontal en pantallas pequeñas                |
| `breadcrumb.tsx`                   | Ruta de navegación                                                       |
| `dialog.tsx`, `sheet.tsx`          | Ventana modal y panel lateral (menú en celular)                          |
| `alert-dialog.tsx`                 | Confirmación de acciones irreversibles                                   |
| `dropdown-menu.tsx`, `tooltip.tsx` | Menú desplegable y ayuda emergente                                       |
| `skeleton.tsx`, `separator.tsx`    | Bloque de carga y separador                                              |

El código de cada componente vive en este repositorio (no en una biblioteca cerrada) y está
adaptado a las reglas del capítulo 11.2. Los que necesitan el navegador llevan `'use client'`.

## Estados de pantalla (numeral 16.5)

| Componente       | Uso                                                                         |
| ---------------- | --------------------------------------------------------------------------- |
| `LoadingState`   | Esqueleto mientras carga; lo anuncia al lector de pantalla                  |
| `EmptyState`     | Explica qué se verá allí y, si aplica, ofrece crear el primer registro      |
| `ErrorState`     | Mensaje en español, código de correlación para soporte y botón «Reintentar» |
| `ForbiddenState` | Dice que no tiene acceso y a quién pedirlo, sin mostrar datos               |

## Pruebas

`pnpm --filter @arza/ui test` ejecuta las pruebas de componentes con Testing Library (cobertura
mínima 90 %). La accesibilidad de las pantallas completas se verifica en `apps/web/e2e`.
