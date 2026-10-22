# Cierre del bloque B20A: Homologación y modernización de la interfaz

Bloque intermedio entre B20 y B21, aprobado el 21/10/2026 con la opción A: la marca de ARZA TECH
S.A.S. (manual 16.2) se conserva tal cual y la skill `mi-estilo` aporta solo sus principios de
sobriedad. La definición, el diagnóstico y los lineamientos están en `docs/bloques/B20A.md`.

El manual maestro no se tocó. Tampoco las skills, la autenticación, los permisos, las rutas, la
API, la base de datos ni las dependencias.

## Qué se hizo

### Etapa 1: fundamentos

- Las tarjetas, los campos y los botones ya no llevan sombra en reposo: se separan con borde fino.
  La sombra queda para menús, diálogos y hojas laterales.
- Las etiquetas de estado usan radio de 4 px; botones, campos y tarjetas siguen en 8 px.
- El botón grande mide 44 px de alto, el mínimo cómodo para tocar en celular.
- La barra superior fija ya no tapa el campo que recibe el foco del teclado (WCAG 2.2, 2.4.11).
- El nombre «ARZA ONE» de las barras oscuras usa su color de marca en vez de un blanco suelto.

### Etapa 2: controles compartidos

- `@arza/ui` gana `Textarea`, `Select`, `Checkbox` y `Radio`.
- `FormField`, `SelectField`, `SimpleTable` y `Pager` pasaron de `features/access` y
  `features/administration` a `@arza/ui`, porque los usan doce funcionalidades.
- 7 áreas de texto, 3 listas, 8 casillas y 2 grupos de opciones dejaron sus clases propias y
  usan los componentes compartidos.
- Los campos de solo lectura se ven con fondo atenuado, distintos de los deshabilitados.

### Etapa 3: tablas

- Las tablas usan números de ancho fijo: cifras, fechas y códigos quedan alineados.
- La paginación dice en qué página está el usuario («Página 2»).

### Etapa 4: acceso, vitrina y portal

- Las pantallas de acceso muestran en escritorio el panel de la marca junto al formulario, como en
  la propuesta visual del 18/10/2026, sin sus degradados ni su vidrio esmerilado.
- El encabezado del portal dice «ARZA ONE Clientes» y alinea su contenido con el de la página.
- **Corrección**: en modo claro, el botón de apariencia de la vitrina y del acceso era azul oscuro
  sobre la barra azul oscura, es decir, invisible. Ahora usa el color claro de la marca.
- La página `/app/sistema-de-diseno` muestra los campos nuevos: lista, solo lectura, texto largo y
  casilla.

## Cómo se probó

- `@arza/ui`: 27 pruebas, entre ellas las nuevas de campos, controles, tabla y paginación.
- Web: 381 pruebas unitarias. En la corrida completa, 3 superaron su tiempo por la carga del
  equipo; corridas solas pasaron las 15 de esos dos archivos.
- Pruebas en navegador de accesibilidad (claro y oscuro), acceso, navegación y estructura: 50 de 52
  pasaron en la primera corrida. Las 2 que fallaron eran: el botón de apariencia (error real,
  corregido) y el menú en celular (por tiempo; pasó al repetirla).
- Nueva prueba `e2e/surfaces.spec.ts`: la vitrina, el acceso y el portal a 390 px no se
  desbordan ni tienen violaciones de accesibilidad; el botón de apariencia se ve sobre la barra
  oscura; el acceso muestra el panel de la marca en escritorio.
- Revisión visual en el navegador: acceso en escritorio (claro y oscuro) y acceso y vitrina en
  celular.

### Resultado de `pnpm check`

`pnpm check` se ejecutó completo el 21/10/2026. Pasos y resultados:

| Paso                                              | Resultado                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                                           | En verde en los archivos del proyecto. `prettier --check .` falla solo en `.agents/`, la carpeta de la skill instalada, que no está en el repositorio                                                                                          |
| Análisis, tipos, fronteras, exportaciones sin uso | En verde                                                                                                                                                                                                                                       |
| Pruebas unitarias                                 | Todas en verde: web 381, `@arza/ui` 27, contratos 117, infraestructura 140, configuración 24, plantillas 15, API 325 de 326. La que falta es `apps/api/test/startup.test.ts`, inestable bajo carga y ya registrada desde B11: sola pasa 2 de 2 |
| Integración                                       | 752 de 753. Falló `parties.int.test.ts › agrega y termina papeles sin perder el historial` por el orden de dos registros; sola pasa 9 de 9 en tres corridas seguidas                                                                           |
| Construcción                                      | En verde                                                                                                                                                                                                                                       |
| Pruebas en navegador                              | 187 de 187                                                                                                                                                                                                                                     |
| Secretos                                          | Sin hallazgos                                                                                                                                                                                                                                  |

Este bloque no cambia ningún archivo de `apps/api`. Las dos pruebas inestables quedan anotadas
para revisarlas aparte.

## Cómo lo prueba usted, paso a paso

1. En una terminal, en la carpeta del proyecto: `pnpm install`, luego `pnpm infra:up` y
   `pnpm dev`.
2. Abra `http://localhost:3000/iniciar-sesion` en el computador: a la izquierda debe ver el panel
   azul oscuro con «Su trabajo diario, en un solo lugar.» y a la derecha el formulario.
3. Achique la ventana al ancho de un celular (o ábrala en su celular): el panel se reduce a la barra
   superior y el icono de apariencia, arriba a la derecha, se ve en blanco.
4. Inicie sesión y entre a **Sistema de diseño** (`/app/sistema-de-diseno`): en «Campos de
   formulario» verá la lista, el campo de solo lectura (fondo gris claro), el texto largo y la
   casilla.
5. Abra **Administración › Usuarios** y avance de página: debajo de la tabla verá «Página 2».
6. Abra cualquier formulario con texto largo (por ejemplo, una solicitud documental): el área de
   texto tiene el mismo borde y tamaño de letra que los demás campos.

## Pendientes

- **Logotipo**: el repositorio no tiene logotipo. Cuando usted lo entregue, se reemplaza el texto
  «ARZA ONE» de las barras y del panel de acceso, y se agrega el ícono de la pestaña del navegador.
- **Ordenar tablas**: la API no ofrece hoy ordenar los listados. Se hará en el bloque que lo
  necesite, con su cambio de API aprobado aparte.
- **Vitrina y portal**: tienen solo su página inicial. Su contenido llega en B41 (sitio público) y
  B30 (portal), siguiendo los lineamientos de B20A.
- **`mi-estilo`**: conserva el bloque de instrucciones de su plantilla y la sección «Ajustes de
  este proyecto» vacía. Si usted quiere, se pueden escribir allí los principios de la opción A.
- `SubmitButton` sigue en `features/access` porque depende de la carga de la página
  (`useHydrated`) de la web; la usan tres funcionalidades.

## Decisiones tomadas

- La marca del manual manda; `mi-estilo` es la identidad de Linear y solo se toman sus principios.
- De la propuesta visual del 18/10/2026 se toma la composición y se descartan degradados, vidrio
  esmerilado y radios de 24 px.
- `QueryState` y `SubmitButton` se quedan en la web porque dependen del cliente de la API y de la
  carga de la página.
- El selector «Portal empresa / Portal cliente» de la propuesta no se construyó: cambiaría el
  inicio de sesión, que está fuera del alcance.

## Commits

En la rama `feat/b20a-homologacion-interfaz`:

- `a597017` style(ui): visual foundations of the intermediate block B20A
- `650cd3c` refactor(ui): shared form controls, table and pager in the design system
- `88ae841` style(web): brand panel on sign-in, portal identity and design system examples
- El commit de este cierre
