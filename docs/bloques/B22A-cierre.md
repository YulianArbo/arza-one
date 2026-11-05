# Cierre del bloque B22A: Nueva apariencia de ARZA ONE

Bloque intermedio entre B22 y B23, aprobado el 24/10/2026 con las cuatro recomendaciones del plan.
Aplica el «Boceto final» del lienzo «ARZA ONE — Bocetos de apariencia» a las cuatro superficies:
vitrina, acceso, plataforma empresarial y portal de clientes. La definición está en
`docs/bloques/B22A.md`.

El manual maestro no se tocó. Las decisiones que se apartan de él quedan aquí y en `B22A.md` para
su reconstrucción (por ejemplo, solo Inter en lugar de Montserrat e Inter, numeral 16.2).

## Qué se hizo

### Etapa 1: fundamentos

- Paleta neutra en claro y oscuro con el azul de la marca `#005AFE` para la acción principal y
  `#7FB2FF` como acento en oscuro. El panel de la marca del acceso sigue en azul oscuro.
- Solo Inter (se retiró Montserrat y su paquete); JetBrains Mono para códigos.
- Selector de apariencia con tres botones: claro, oscuro y según el sistema.
- Utilidades nuevas: inversión de color al pasar el cursor (0,2 s) y animaciones breves de
  entrada. Se apagan con «reducir movimiento» y al imprimir; el contenido se ve aunque no corran.

### Etapa 2: componentes de `@arza/ui`

- Gráficas propias, sin librerías nuevas: línea, barras, circular, embudo y mini tendencia. Cada
  una trae su tabla de datos equivalente («Ver los datos»).
- Tarjeta de indicador, avatar (foto o iniciales) y resumen de errores de formulario.
- Etiquetas de estado como píldoras de fondo tenue, con contraste de 4,5:1.

### Etapa 3: estructura de la plataforma

- Barra superior de ancho completo con el logo, la ruta, la búsqueda, ayuda, avisos, apariencia y
  la persona (foto o iniciales, nombre y correo).
- Menú lateral neutro bajo la barra, con inversión de color al pasar el cursor.

### Etapa 4: acceso

- Panel de la marca animado con el mensaje del día (7 mensajes fijos, uno por día de la semana,
  en hora de Colombia).
- Selector «Plataforma empresarial / Portal de clientes», medidor de seguridad de la contraseña
  (cuenta caracteres como los ve la persona, igual que la API) y pie con términos y privacidad.

### Etapa 5: tablero de Inicio con datos reales

- Tareas abiertas, vencidas y que vencen hoy; tareas por flujo; embudo comercial de los últimos
  seis meses; avisos recientes. Cada bloque aparece solo con su permiso y tiene sus estados de
  carga, vacío y error.

### Etapa 6: módulos existentes

- Resumen de errores en 15 formularios: enlaza cada problema con su campo, con la etiqueta que se
  ve en pantalla; el campo conserva su propio mensaje.
- Tarjetas de inicio de Administración y Privacidad con inversión de color; pestañas de Auditoría
  iguales a las de los demás módulos.

### Etapa 7: encabezado del portal

- Logo y etiqueta «Clientes», pestañas al centro (Inicio, Proyectos, Por aprobar, Firmas,
  Facturas, Soporte) y, a la derecha, apariencia, empresa cliente y persona. En celular las
  pestañas pasan a una segunda fila que se desliza.
- Las secciones que construye B30 dicen «Disponible pronto».

### Etapa 8: vitrina pública

- Encabezado con el botón «Plataforma empresarial», portada, servicios, módulos de ARZA ONE,
  pasos de la cotización, contacto, «¿Ya trabaja con nosotros?» y pie con columnas, redes y textos
  legales en direcciones propias (`/legal/...`).
- Proyectos, noticias, cotización (B23), PQRSF y verificación de documentos (B29, B41), boletín,
  video, textos legales y redes dicen «Disponible pronto». No hay formularios simulados.

### Etapa 9: foto de perfil y logo de la empresa cliente

- Migración `20261024000000_iam_photo_and_party_logo`: `iam_users.photo_file_id` y
  `pty_parties.logo_file_id`. Solo expande: la versión anterior sigue funcionando.
- Cada persona sube, cambia o quita su foto (`/v1/me/photo`); quien edita terceros, el logo de
  una empresa (`/v1/parties/{id}/logo`). PNG o JPG de hasta 2 MB, con el mismo antivirus que los
  demás archivos; mientras lo revisa, la API responde «todavía en revisión» y la web espera.
- La persona del portal queda ligada a su empresa cliente al invitarla (campo `party_id` del
  capítulo 12, que no se usaba). El portal muestra el nombre y el logo de esa empresa
  (`/v1/me/company`).
- Identidad pide los archivos y los terceros por puertos que esos módulos implementan, como ya se
  hacía con los cargos y los expedientes: no aparece ningún ciclo entre módulos.

## Cómo se probó

| Prueba                  | Resultado                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Web, unitarias          | 465 en verde; cobertura de ramas 85,27 %                                                                              |
| `@arza/ui`              | 44 en verde; 100 % de líneas y 91 % de ramas                                                                          |
| Contratos               | 131 en verde                                                                                                          |
| API, unitarias          | En verde; `startup.test.ts` necesita la API compilada (`pnpm build`) y así pasa                                       |
| API, integración        | 873 de 873 en la corrida final; 2 archivos que no arrancaron por carga pasan solos (13 de 13)                         |
| Foto, logo y empresa    | 16 pruebas nuevas con base de datos, Garage y ClamAV reales: permiso denegado, aislamiento entre empresas y auditoría |
| Auditoría de escrituras | Las 6 rutas nuevas que escriben dejan su evento (`write-routes-audited.int.test.ts`)                                  |
| Navegador               | Accesibilidad axe en claro y oscuro de las pantallas tocadas; vitrina, acceso, portal e Inicio sin desborde a 390 px  |
| Revisión visual         | Capturas de cada etapa en claro, oscuro y celular                                                                     |

Inestables bajo carga, ya conocidas o propias de la máquina: `startup.test.ts`,
`audit-query.int.test.ts`, `document-search.int.test.ts` y varias pruebas de navegador que superan
su tiempo cuando corren muchas a la vez. Todas pasan al repetirlas solas o con menos en paralelo.

### Resultado de `pnpm check`

Se ejecutó el 24/10/2026 con el equipo sin `pnpm dev` en marcha, porque con él la memoria libre no
alcanzaba (0,2 GB de 7,3 GB). Pasos y resultados:

| Paso                                               | Resultado                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                                            | En verde en los archivos del proyecto. `prettier --check .` falla solo en `.agents/`, la carpeta de la skill instalada, que no está en el repositorio                                                                                                                                                    |
| Análisis, tipos, fronteras y exportaciones sin uso | En verde                                                                                                                                                                                                                                                                                                 |
| Pruebas unitarias                                  | En verde paquete por paquete (`turbo run test --concurrency=1`): web 465, `@arza/ui` 44, contratos 131, API 47 de 48 archivos. Falla `startup.test.ts`, inestable bajo carga y registrada desde B11; sola pasa 2 de 2. En paralelo, los trabajadores de `@arza/ui` no respondieron a tiempo por la carga |
| Integración                                        | API 873 de 873 pruebas; `disposition-cases` y `folders-and-links` no arrancaron por carga y solos pasan 13 de 13. Worker 25 de 25                                                                                                                                                                        |
| Construcción                                       | Falló una vez por el sistema operativo («Recursos insuficientes», error 1450) al leer un archivo; repetida, en verde                                                                                                                                                                                     |
| Pruebas en navegador                               | 218 de 222. Las 4 restantes (dos de acceso y dos de accesibilidad) superaron su tiempo; repetidas solas, 31 de 31                                                                                                                                                                                        |
| Secretos                                           | Sin hallazgos                                                                                                                                                                                                                                                                                            |

## Cómo lo prueba usted, paso a paso

1. En la carpeta del proyecto: `pnpm install`, `pnpm infra:up`, `pnpm db:migrate` y `pnpm dev`.
2. Abra `http://localhost:3000`: recorra la vitrina, cambie la apariencia y abra un texto legal
   del pie.
3. Pulse «Plataforma empresarial»: vea el panel con el mensaje del día e inicie sesión.
4. En **Inicio** vea sus tareas, el embudo y los avisos; pase el cursor por las gráficas.
5. En **Mi perfil** elija una foto: aparece en la barra superior.
6. En **Terceros**, abra una empresa y súbale un logo.
7. En **Administración › Usuarios**, invite a un usuario del portal eligiendo esa empresa. Al
   entrar con esa cuenta, el portal muestra el nombre y el logo de la empresa arriba a la derecha.
8. En **Comercial › Registrar oportunidad**, pulse «Registrar» sin llenar nada: arriba aparece el
   resumen de errores con un enlace a cada campo.

## Pendientes

- **Datos de la empresa en la vitrina**: NIT, teléfono, WhatsApp, correo, dirección, horario y
  direcciones de las redes están entre corchetes en `apps/web/src/features/site/site-content.ts`.
  Los entrega el dueño del producto antes de publicar el sitio.
- **Cookie de apariencia en la vitrina**: según el capítulo 20.4, guardar el modo claro u oscuro
  en el sitio público es una cookie de preferencias y requiere consentimiento. Hoy se guarda sin
  preguntar (viene de antes de este bloque). Se resuelve con el aviso de cookies de B41.
- **Foto de las personas del portal**: la API la permite, pero el portal aún no tiene «Mi perfil»
  (B30).
- **Cuentas del portal creadas por comando**: `pnpm iam:invitar` no liga la empresa; solo la
  pantalla de usuarios lo hace.
- **Tablero de Inicio**: cuenta solo la primera página de la bandeja de tareas, y la gráfica de
  ganadas incluye solo las oportunidades creadas en los últimos seis meses.

## Decisiones tomadas

1. Foto de perfil y logo del cliente dentro de este bloque, como etapa aparte con migración, API y
   pruebas de permiso, aislamiento y auditoría.
2. Solo Inter. **Cambiada el 31/10/2026** por el dueño del producto: toda la plataforma usa solo
   Montserrat (títulos y texto), sin Inter.
3. Mensaje del día: 7 mensajes fijos, uno por día de la semana.
4. Las secciones que dependen de otros bloques se construyen con su diseño y «Disponible pronto»;
   no simulan funcionar.
5. (24/10/2026) La persona del portal se liga a su empresa cliente al invitarla, con el campo
   `party_id` que el capítulo 12 ya define.
6. Las cifras, la oferta del mes, las noticias y los proyectos de ejemplo del boceto no se
   publicaron: el manual no los respalda y en un sitio público se leerían como ciertos.
7. Las imágenes se entregan con la sesión y la web las muestra como dirección local del navegador
   (`blob:`), la única que permite la política de contenido; así no se amplía esa política.

## Lineamientos visuales para los bloques siguientes (B23 en adelante)

Reemplazan los de B20A. Antes de construir una pantalla nueva:

1. **Componentes**: use los de `@arza/ui` (campos, tablas, estados, gráficas, avatar, indicador,
   resumen de errores). Si falta uno, agréguelo allí, nunca en la funcionalidad.
2. **Colores**: solo los tokens de `tokens.css`, en claro y oscuro. El azul de acción
   (`bg-action`) es para la acción principal de la pantalla, una sola. Los estados usan sus tonos
   (`success`, `warning`, `destructive`, `info`) como píldoras de fondo tenue.
3. **Tipografía**: Montserrat en toda la plataforma (desde el 31/10/2026; antes Inter), con
   pesos 400, 500 y 600; números de ancho fijo en cifras, fechas y códigos; JetBrains Mono solo
   donde ayuda a leer un código. Montserrat es más ancha: revise que los textos largos, las
   tablas y los encabezados no se corten ni se desborden a 390 px.
4. **Superficies**: tarjetas con borde fino y radio `xl`, sin sombra en reposo ni degradados ni
   vidrio. La sombra queda para menús, diálogos y la tarjeta que se quiere destacar.
5. **Movimiento**: módulos y tarjetas que se pueden abrir usan `hover-invert`; las entradas usan
   `animate-enter`. Nada que dependa de la animación para verse.
6. **Gráficas**: siempre con su tabla equivalente; cifras en formato colombiano (`formatNumber`,
   `formatPesos`).
7. **Formularios**: validan al enviar, muestran el mensaje junto al campo y el resumen de errores
   arriba (`FormSummary`), con los campos en el orden de la pantalla.
8. **Estados**: `LoadingState`, `EmptyState`, `ErrorState` y `ForbiddenState` (manual 16.5). Lo
   que aún no funciona dice «Disponible pronto» y no simula datos ni formularios.
9. **Pruebas**: toda pantalla nueva entra en la revisión axe en claro y oscuro; las del portal y
   la vitrina se prueban a 390 px. Los objetivos táctiles miden al menos 24 px.
10. **Excepciones**: toda excepción visual se documenta en el cierre del bloque y se aprueba antes.

## Commits

En la rama `feat/b22a-nueva-apariencia`:

- `cdd161a` style(ui): new look foundations of the intermediate block B22A
- `a5ec9dd` feat(ui): charts, stat cards, avatar and error summary for the new look
- `b0c5b25` style(web): full-width top bar and neutral side menu for the new look
- `e3d723f` style(web): animated brand panel, daily message and strength meter on sign-in
- `eef43a9` feat(web): home dashboard with real tasks, sales funnel and notices
- `a424f94` feat(web): error summary in forms and new look across existing modules
- `2b645fd` feat(web): client portal header with section tabs
- `c9e6898` feat(web): new public showcase site from the final mockup
- `1fd8854` feat(api): profile photo, company logo and portal client company
- `02f5428` feat(web): profile photo, company logo and client company on screens
