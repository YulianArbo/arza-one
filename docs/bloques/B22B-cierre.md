# Cierre del bloque B22B — Nueva jerarquía visual

- Estado: **Terminado**. Las 24 entregas están unidas a `main` (PR #57 y #59 a #82).
- Plan aprobado por el propietario el 18/11/2026 (`B22B-guia.md`, `B22B-validacion.md`), con los
  ajustes que pidió durante la construcción (ver «Decisiones»).
- Construido por Claude Code del 18/11/2026 al 20/11/2026, una etapa por PR.

## Qué se construyó

La misma identidad de B22A (colores, Montserrat, componentes de `@arza/ui`) con una **jerarquía
nueva** en las tres superficies: plataforma interna, portal del cliente y sitio público.

| Etapa | PR      | Qué cambió                                                                                                                                                                                                                      |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | #57     | Bocetos (31), guía y plan aprobado                                                                                                                                                                                              |
| F0    | #59     | Tamaños de texto (`text-title`, `text-display`, `text-title-access`, `text-section`, `text-card-title`, `text-nav`) y piezas nuevas en `@arza/ui`: `PageHeader`, `HighlightCard`, `AttentionList`, `StageSummary`, `QuickLinks` |
| F1    | #60     | Menú lateral blanco a todo el alto, con el logo y los módulos por grupos plegables; barra superior sólida; «Volver a [módulo]»                                                                                                  |
| F2a   | #61     | Catálogo único de submódulos (`components/app-shell/submodules.ts`) para el menú y las portadas; ruta de tres niveles                                                                                                           |
| F2b   | #62     | Inicio «Su jornada»: saludo según la hora en Colombia, mensaje personal del día y «Continuar trabajando» con los últimos módulos                                                                                                |
| F2c–f | #63–#67 | Portadas de Compras (etapas), Administración, Privacidad, Finanzas (ejecución presupuestal) y Proyectos (cartera activa)                                                                                                        |
| F3b–g | #68–#73 | Servicio, Documentos, Talento y SST, Comercial, listas en tarjetas (Terceros, Contratos, Mis tareas, Archivos, Auditoría) y encabezado y pestañas comunes en las fichas de detalle                                              |
| F4a   | #74     | Aviso breve de éxito al guardar (`ToastProvider` en `@arza/ui`)                                                                                                                                                                 |
| F4b   | #75     | Ícono en cada botón de acción según su verbo (`lib/ui/action-icon.tsx`)                                                                                                                                                         |
| F4c   | #76     | Confirmación escribiendo el código en acciones irreversibles: terminar contrato, anular factura, dar de baja un activo y aprobar la disposición final                                                                           |
| F4d   | #77     | Borrador del formulario al vencer la sesión, solo en la pestaña, y regreso a la misma pantalla                                                                                                                                  |
| F5a–c | #78–#80 | Portal: encabezado con «Volver al portal» y ruta, pestañas con ícono, inicio «Su espacio de cliente» con el proyecto destacado y «Por revisar», secciones y listas en tarjetas                                                  |
| F6a   | #81     | Sitio: menú y pie con íconos, botón «Iniciar sesión», franja de clientes clara                                                                                                                                                  |
| F6b   | #82     | Acceso: mensaje del día al azar, pestaña «Ingreso plataforma», trato de usted en la ayuda                                                                                                                                       |

### Criterios de aceptación

| Criterio (B22B.md)                                                        | Cómo se cumple                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bocetos y versiones de celular en `docs/bloques/B22B-bocetos/`            | Los 31 bocetos están en el repositorio, incluidos los de celular (27 a 31)                                                                                                          |
| Las tres superficies siguen la jerarquía de los bocetos                   | Plataforma (F1–F4), portal (F5) y sitio y acceso (F6), con las diferencias que decidió el dueño (abajo)                                                                             |
| Nada fuera de los tokens de B22A                                          | Solo `tokens.css`; los tamaños nuevos se agregaron como tokens en F0                                                                                                                |
| Se conservan los elementos del manual 16.3                                | Búsqueda global, avisos, ayuda, cuenta y apariencia siguen en la barra superior; se agregó la ruta de tres niveles                                                                  |
| Listados con búsqueda, filtros, orden, paginación, exportación y vacío    | Las listas solo cambiaron de contenedor (`HighlightCard`); sus controles no se tocaron                                                                                              |
| Fichas con encabezado (código, estado, acciones) y pestañas               | F3g: `PageHeader` con las etiquetas de estado y `SectionTabs` en `@arza/ui`                                                                                                         |
| Teclado y foco visible; axe en claro y oscuro; 390 px; objetivos de 24 px | Cada PR corrió las pruebas de accesibilidad de sus pantallas en claro y oscuro; portal, sitio y acceso, también a 390 px                                                            |
| Cada gráfica conserva su tabla de datos                                   | B22B no agregó gráficas: la ejecución presupuestal (F2e) y la cartera (F2f) muestran sus cifras en texto; las gráficas existentes no se tocaron                                     |
| Los siete estados del manual 16.5                                         | Se reforzaron: éxito (F4a), confirmación de lo irreversible (F4c) y sesión vencida que conserva lo digitado (F4d)                                                                   |
| La página de firma no cambió                                              | `apps/web/src/app/(client)/firmar` no tiene cambios desde el inicio del bloque                                                                                                      |
| Ninguna prueba se eliminó ni se debilitó                                  | Las pruebas que cambiaron se ajustaron a los textos nuevos y conservan sus revisiones; por ejemplo, la baja de un activo sigue probando «Escriba la fecha.» además del código (F4c) |
| `pnpm check` en verde                                                     | Ver «Verificaciones»                                                                                                                                                                |
| Cierre con los lineamientos nuevos                                        | Este documento, sección «Lineamientos visuales para los bloques siguientes»                                                                                                         |

## Decisiones

Aprobadas en el plan (18/11/2026) y durante la construcción:

1. **Menú lateral blanco o gris**, con los colores de B22A, no azul oscuro (19/11/2026). Las
   tarjetas destacadas son claras con borde azul (`HighlightCard highlighted`); no hay fondos
   oscuros, ni siquiera donde el boceto los muestra (proyecto del portal, franja de clientes del
   sitio).
2. **Texto base de 14 px** y menú de 13 px. **Un solo azul de acción por pantalla.**
3. Inicio con saludo según la hora, mensaje personal del día y «Continuar trabajando» automático.
4. El título «Documentos» reemplaza «Explorador de expedientes». «Nueva solicitud» de Compras abre
   el formulario directamente (`?nueva=1`).
5. **Confirmación reforzada (F4c, 20/11/2026):** se escribe el código del registro para terminar
   un contrato, anular una factura, dar de baja un activo y aprobar la disposición final. Las
   notas crédito no tienen anulación en la plataforma, así que no aplica. El retiro de
   colaboradores no la pide, porque se puede deshacer con «Anular retiro» (ver «Pendientes»).
6. **Borradores (F4d, 20/11/2026):** solo en la pestaña (`sessionStorage`), se borran al
   recuperarlos o al salir de la pantalla y **nunca guardan contraseñas, códigos ni datos
   bancarios**. Tampoco se recuperan para otra persona.
7. **F5 cubre todo el portal**: encabezado, inicio, listas y fichas. En celular las pestañas van
   en una sola fila que se desliza (no en tres filas como el boceto 29).
8. **Redes sociales** en el pie del sitio, sin enlace hasta que el dueño entregue las direcciones.
9. **Sin fotos en el acceso (20/11/2026):** el dueño descartó el banco de imágenes aleatorias. En
   su lugar habrá **comunicados** en un bloque propio (ver «Pendientes»). El mensaje del día del
   acceso es al azar en cada visita, del mismo banco de fragmentos de Inicio, sin inteligencia
   artificial.

## Cómo probarlo en el navegador (paso a paso)

1. `pnpm infra:up` y `pnpm dev`; abra `http://localhost:3000`.
2. **Sitio:** el menú tiene íconos, el botón dice «Iniciar sesión» y la franja «¿Ya trabaja con
   nosotros?» es clara. Abajo están las redes sociales.
3. **Acceso:** en escritorio, a la izquierda, un mensaje del día distinto en cada visita (recargue
   la página). Las pestañas dicen «Ingreso plataforma» y «Portal de clientes».
4. **Plataforma:** entre con un usuario de prueba de la semilla. El menú blanco agrupa los
   módulos; Inicio saluda según la hora y muestra «Continuar trabajando» después de abrir algunos
   módulos.
5. **Confirmación con código:** en Finanzas › Facturas, «Anular» pide escribir el código de la
   factura; con otro código no deja continuar.
6. **Borrador:** en Compras › «Nueva solicitud», escriba algo; en otra pestaña cierre la sesión y
   vuelva a «Crear solicitud». Al entrar de nuevo vuelve a Solicitudes y, al abrir el formulario,
   encuentra lo escrito.
7. **Portal:** entre con un usuario de cliente. Verá «Su espacio de cliente», el avance del
   proyecto y «Por revisar». En celular, las pestañas se deslizan en una fila.

## Verificaciones

Corridas el 20/11/2026 sobre `main` en `ae64a72` (ya con las 24 entregas):

| Verificación                                      | Resultado                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Formato (`pnpm format:check`)                     | En verde                                                                                        |
| Analizador en web, `@arza/ui` y `@arza/contracts` | En verde, sin advertencias                                                                      |
| Tipos de la web                                   | En verde                                                                                        |
| Pruebas unitarias de la web                       | 871/871 en 149 archivos; cobertura 95,38 % de instrucciones y 85,25 % de ramas                  |
| Compilación de la web                             | En verde                                                                                        |
| Pruebas de navegador (todas las de la web)        | 395/395 en 13,9 minutos, con accesibilidad en claro y oscuro                                    |
| CI completa de `main` (todas las etapas)          | En verde en `ae64a72`, incluidos knip, fronteras, pruebas de integración y despliegue a pruebas |

En este equipo, el analizador de todo el repositorio y las fronteras marcan errores en la API y el
worker porque falta el código generado localmente (cliente de base de datos); no vienen de B22B,
que solo tocó la web y `@arza/ui`. En la CI esas mismas etapas pasan. Las pruebas de integración
de la API no se corrieron aquí: B22B no cambió la API y la CI las pasó.

### Errores reales que encontraron las pruebas (corregidos)

- El borrador no recuperaba las listas desplegables cuyas opciones llegan después de abrir el
  formulario (centro de costo en Compras). Lo encontró la prueba de navegador nueva de F4d.
- Un ciclo de importación entre la sesión y el borrador (F4d), que detectó la CI.
- La etiqueta de estado se estiraba a todo el ancho en la ficha del proyecto del portal (F5c).
- La ayuda de invitación del acceso trataba de «tú» (F6b).

## Lineamientos visuales para los bloques siguientes

Complementan los de `B22A-cierre.md` (que siguen vigentes). Antes de construir una pantalla nueva:

- **Encabezado de página:** `PageHeader` de `@arza/ui` con título, descripción y, si hay, una sola
  acción principal (`bg-action`). El antetítulo (`eyebrow`) sirve para la empresa o el módulo.
- **Bloques de contenido:** `HighlightCard` con su título, en lugar de un `h2` suelto más una
  tarjeta. Solo una por pantalla va destacada (`highlighted`, borde azul). Nunca fondos oscuros.
- **Módulo nuevo:** sus submódulos se declaran en `components/app-shell/submodules.ts` (con
  permiso y, si aplica, `wholeCompany`); el menú, la ruta de tres niveles y la portada los toman
  de ahí. La portada usa `QuickLinks`, `StageSummary` o `AttentionList` según el caso.
- **Fichas de detalle:** `PageHeader` con las etiquetas de estado como hijos y `SectionTabs` para
  las pestañas.
- **Botones:** el ícono sale solo del verbo con `ActionIcon`; los botones de `@arza/ui` ya lo usan.
- **Guardar:** los casos de uso con `useAdminAction` muestran el aviso de éxito por defecto; use
  `successMessage` para otro texto o `null` para ninguno.
- **Acciones irreversibles de alto impacto:** `CodeConfirmation` (formulario) o
  `ConfirmActionButton confirmCode` (ventana). Pídale al dueño la lista de acciones que lo llevan.
- **Formularios:** el borrador al vencer la sesión funciona solo si cada campo tiene un `id`
  estable dentro de un `<form>`. Un campo sensible nuevo debe tener en su `id`, nombre o etiqueta
  una palabra que lo excluya (contraseña, código, clave, token, cuenta, banco, tarjeta).
- **Portal:** pestañas en `PORTAL_SECTIONS` con su ícono; la ruta «Volver al portal» sale sola.
- **Textos:** trato de usted siempre, también en ayudas pequeñas.

## Pendientes

- **Comunicados en el acceso (bloque propio, siguiente).** Decisiones del dueño del 20/11/2026:
  se cargan en Administración; vigencia de fecha a fecha; varios vigentes a la vez; se ven uno a
  la vez con flechas y puntos, sin cambio automático; cada uno para Personal, Clientes o Ambos,
  según la pestaña del acceso; título, texto, enlace opcional e imagen opcional. La pantalla de
  acceso es pública: no deben llevar información confidencial.
- **Retiro de colaboradores:** decidir si también pide escribir algo para confirmar, aunque se
  pueda deshacer con «Anular retiro».
- **Redes sociales:** el dueño debe entregar las direcciones para activar los enlaces.
- **Ideas para el final del bloque, no hechas** (requieren confirmación): búsqueda Ctrl K con
  acciones, modo compacto o cómodo, atajos de teclado con ayuda en «?» y botón «Volver arriba» en
  el sitio.
- **Ejecución presupuestal por mes** (F2e): la API da el año; el selector de mes queda pendiente
  de una decisión del dueño.
