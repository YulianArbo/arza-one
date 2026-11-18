# Validación del bloque B22B — Nueva jerarquía visual

- Fecha de la revisión: 17/11/2026
- Revisor: Claude Code, en un worktree aparte (`claude/nifty-mirzakhani-c228b6`), sin tocar la rama
  de B35 ni el checkout principal.
- Objeto revisado: `docs/bloques/B22B.md`, registrado por OpenCode el 16/11/2026 en el commit local
  `943fdb0` («docs(bloques): register the visual hierarchy block and update handoff») de la rama
  `feat/b35-talento-humano-colaboradores-s`. Ese commit **no está publicado** en GitHub: no aparece
  en ninguna rama remota y no hay pull request de B22B.

## Veredicto

**Aprobar con ajustes.** La dirección del bloque está bien planteada: conserva la identidad que usted
aprobó en B22A (colores, Montserrat, temas claro y oscuro) y repite sus reglas de calidad. Pero el
documento tiene cinco puntos que conviene corregir **antes de iniciar la etapa F0**, porque hoy
nadie, ni otro agente ni un revisor, podría comprobar si el resultado final cumple lo pedido.

Lo que se revisó es **solo una propuesta escrita**. Todavía no existe código de B22B: no hay
pantallas que probar.

## Hallazgos, del más grave al menos grave

### 1. Grave — Los seis bocetos que mandan no están en el repositorio

`B22B.md`, líneas 14 a 16 y 72. El bloque dice que seis bocetos son la «dirección visual
vinculante» y que el primer criterio de aceptación es seguirlos, pero los archivos viven solo en su
equipo. Ningún agente ni revisor puede verlos, así que ese criterio no se puede verificar y cada
agente podría imaginar algo distinto. En B22A el boceto sí tenía un lugar nombrado (el lienzo
«ARZA ONE — Bocetos de apariencia»).

**Ajuste:** guardar los seis bocetos (o capturas de ellos) en el repositorio, por ejemplo en
`docs/bloques/B22B-bocetos/`, o al menos indicar dónde están y con qué nombre.

### 2. Grave — Contradicción interna sobre el portal del cliente

`B22B.md`, línea 57 frente a las líneas 66 y 67. La etapa F5 rediseña «Portal del cliente:
encabezado, listas y detalle», pero la sección «Fuera del alcance» dice que las pantallas internas
del portal (B30) conservan su alcance. Las listas y los detalles del portal **son** esas pantallas
internas. No se puede cumplir lo uno y lo otro.

**Ajuste:** usted decide si F5 toca las listas y los detalles del portal o solo su encabezado, y el
documento se corrige en un solo sentido.

### 3. Importante — Cambia la estructura que fijó B22A, aunque dice que no la reabre

`B22B.md`, líneas 9, 18 y 19 y 53. El bloque afirma que «no reabre B22A», pero toma como modelo una
barra lateral fija al estilo de Cloudflare. B22A, en su etapa 3, fijó una **barra superior de ancho
completo** con el logo, la ruta, la búsqueda, la ayuda, los avisos, la apariencia y la persona, y un
menú lateral debajo de ella. Pasar a una barra lateral fija cambia esa decisión.

Además, el manual (numeral 16.3) exige una barra superior con la ruta de navegación, la búsqueda
global con Ctrl K, los avisos, la ayuda que enlaza el procedimiento del SGC y el menú del usuario.
F1 no dice que esos elementos se conserven.

**Ajuste:** escribir en el bloque que F1 cambia la estructura de B22A, y comprometer que
todos los elementos del numeral 16.3 se mantienen visibles y funcionando.

### 4. Importante — Faltan bocetos de celular para el portal y el sitio

`B22B.md`, líneas 14 y 45. Los seis bocetos miden 1440 px, es decir, son de computador. El manual
(numeral 16.6) dice que el portal y el sitio público **se diseñan primero para celular**. El bloque
solo exige que nada se desborde a 390 px, lo que evita el error pero no dice cómo debe verse en el
teléfono.

**Ajuste:** agregar bocetos de celular del portal y del sitio, o anotar que al iniciar F5 y F6 se le
mostrará a usted la versión de celular para aprobarla.

### 5. Importante — Se tocan pantallas de bloques críticos sin revisión externa

`B22B.md`, línea 6 frente a las líneas 57 y 58. El bloque se declara «no crítico», pero F5 y F6
cambian el portal (B30), las pantallas de acceso e inicio de sesión (B08 y B09) y, posiblemente, la
página de firma (B25), y todos ellos fueron bloques críticos con revisión externa. El manual
(numeral 16.4) exige que la página de firma muestre el documento completo, los datos del firmante,
la casilla de aceptación, el código de verificación y la constancia descargable. Un cambio visual
descuidado podría ocultar alguno de esos elementos.

**Ajuste:** excluir la página de firma del rediseño, o pedir revisión externa de las etapas F5 y F6.

### 6. Moderado — Los criterios de aceptación no protegen lo que exige el manual

`B22B.md`, líneas 70 a 78. El bloque cambia «la estructura de listas, fichas y formularios», pero
sus criterios no dicen que deban conservarse:

- En listados: búsqueda, filtros, orden, paginación, exportación, acción principal y estado vacío
  con invitación a crear (numeral 16.4).
- En detalles: encabezado con código, estado y acciones, y las pestañas Resumen, Actividad,
  Documentos, Comentarios e Historial (numeral 16.3).
- En formularios: el resumen de errores `FormSummary` del B22A.
- La navegación completa con teclado y el foco visible (numeral 16.6, WCAG 2.2 AA).
- Las pruebas existentes: que no se borren ni se debiliten para ajustarlas al nuevo diseño.

**Ajuste:** agregar esos puntos como criterios de aceptación.

### 7. Moderado — Solo se nombran cuatro de los siete estados de pantalla

`B22B.md`, líneas 44 y 76. Pide los estados cargando, vacío, error y sin permiso. El manual
(numeral 16.5) exige además «sin conexión o sesión vencida» (conservar lo digitado), «éxito»
(confirmación breve) y «acción irreversible» (diálogo que nombra el registro). El lineamiento de
B22A también se quedaba en cuatro, pero un rediseño de formularios (F4) es el momento de no
perderlos.

### 8. Menor — Datos de estado y orden por revisar

- La línea 7 dice «Diferido por el dueño del producto el 16/11/2026, con dirección visual
  aprobada». No es claro si significa aprobado para más adelante o aplazado. Conviene escribir
  «Aprobado en su dirección; se inicia después de B35».
- `docs/ESTADO-PROYECTO.md` (líneas 97 y 104 del commit `943fdb0`) dice que `B22B.md` está sin
  seguimiento, pero ese mismo commit ya lo incluye. El estado quedó desactualizado en el mismo
  commit que lo escribe.
- El registro de B22B entró en un commit de la rama de B35. Si el pull request de B35 se retrasa por
  su revisión externa, B22B queda atado a él. Es una decisión de orden, no un error.
- La tabla `docs/bloques/README.md` incluye B22B pero no tiene filas para B20A ni B22A. Es un detalle
  de consistencia.
- La referencia a Cloudflare se limita a la organización de la pantalla y el bloque prohíbe copiar
  marcas, logos y textos. Eso está bien y conviene mantenerlo así.

## Lo que está bien

- Conserva todo lo que fijó B22A: la paleta (verifiqué en `packages/ui/src/styles/tokens.css` que
  existen `#005AFE` y `#7FB2FF`), Montserrat en pesos 400, 500 y 600, y los temas claro, oscuro y
  según el sistema.
- Repite las reglas de B22A: solo componentes de `@arza/ui` y tokens; `hover-invert` y
  `animate-enter`, que ya existen y se apagan con «reducir movimiento»; sin sombras en reposo ni
  degradados; gráficas con su tabla de datos; axe en claro y en oscuro; 390 px; objetivos táctiles
  de 24 px.
- Deja por fuera las reglas de negocio, los permisos, los datos y el servidor: es un cambio solo
  visual, sin riesgo para la seguridad.
- No exige una nueva ADR: el sistema de diseño sigue siendo el de la ADR-019 (Tailwind y shadcn/ui
  sobre Radix).
- Exige confirmar con usted el detalle de pantallas antes de cada etapa.

## Contradicciones con el manual y con B22A

| Tema                      | Manual o B22A                                                       | B22B                                                               |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Estructura                | B22A: barra superior de ancho completo; manual 16.3: barra superior | Barra lateral fija «al estilo Cloudflare»; dice que no reabre B22A |
| Portal                    | Pantallas internas del portal son alcance de B30                    | F5 rediseña listas y detalle del portal                            |
| Celular                   | Manual 16.6: portal y sitio se diseñan primero para celular         | Solo bocetos de 1440 px                                            |
| Estados                   | Manual 16.5: siete estados                                          | Cuatro estados                                                     |
| Tipografía (ya existente) | Manual 16.2: Montserrat para títulos e Inter para texto             | Solo Montserrat, según la decisión del 31/10/2026                  |

La última fila no es un error de B22B: es una diferencia que viene de B22A y que sigue sin
reflejarse en el manual. El manual 16.2 también habla de radio de 8 px y sombra suave, y desde B22A
se usan radio `xl` y ninguna sombra en reposo.

## Lo que no se pudo verificar

- **Los seis bocetos.** No están en el repositorio, así que no se pudo comparar la propuesta con
  ellos.
- **Su aprobación.** El documento dice que usted aprobó la dirección visual, pero no hay más
  registro que el propio documento y la entrega de OpenCode.
- **Lint, revisión de tipos y pruebas de `apps/web`.** No se ejecutaron. B22B no tiene código, así
  que esas verificaciones no dirían nada sobre la propuesta. Este worktree tampoco tiene las
  dependencias instaladas, y en este equipo la memoria es limitada mientras corre B35. Si las corriera
  aquí, solo validaría el estado de `main`, ya probado por GitHub Actions en el PR #43.
- **Accesibilidad, celular y estados de pantalla.** No aplican todavía: no hay pantallas nuevas.
- No se ejecutaron `infra:reset`, migraciones ni seeds.

## Decisiones que le tocan a usted

1. **Bocetos:** ¿los guarda en el repositorio o indica dónde quedan? (hallazgo 1)
2. **Portal:** ¿F5 rediseña las listas y los detalles del portal o solo el encabezado? (hallazgo 2)
3. **Estructura:** ¿acepta reemplazar la barra superior de B22A por la barra lateral fija,
   conservando la búsqueda, los avisos y la ayuda? (hallazgo 3)
4. **Celular:** ¿quiere ver y aprobar el diseño de celular del portal y del sitio antes de F5 y F6?
   (hallazgo 4)
5. **Firma y acceso:** ¿excluye la página de firma o pide revisión externa para F5 y F6?
   (hallazgo 5)
6. **Tamaño del bloque:** las etapas suman entre 29 y 43 jornadas, y la plataforma tiene hoy 145
   pantallas. ¿Lo hace completo después de B35, o por partes intercaladas con B36 a B40?
7. **Manual:** ¿autoriza actualizar el numeral 16.2 del manual (solo Montserrat, radio y sombras)
   en su próxima reconstrucción, para que deje de contradecir lo que ya se usa?

## Decisiones del dueño (17/11/2026)

1. **Bocetos:** se guardan en `docs/bloques/B22B-bocetos/`. Usted los copia allí, y F0 no se inicia
   sin ellos.
2. **Portal:** F5 rediseña todo el portal: el encabezado, las listas y los detalles.
3. **Estructura:** se acepta la barra lateral fija. Se conservan todos los elementos del numeral
   16.3.
4. **Celular:** usted aprueba la versión de celular del portal y del sitio antes de F5 y F6.
5. **Firma:** la página de firma queda fuera del rediseño.
6. **Programación:** el bloque se hace completo al terminar B35, antes de B36.
7. **Manual:** se autoriza actualizar el numeral 16.2 en la próxima reconstrucción.

También se aprobó agregar los criterios de aceptación de los hallazgos 6 y 7. El texto corregido de
`B22B.md` se entregó a la sesión de B35, porque el archivo vive en su rama, para que lo aplique ahí.
