# Cierre del bloque B45 — Carga inicial, aceptación y puesta en marcha

- Módulo: Todos · Fase F8 · Depende de B44 · **Bloque crítico: requiere revisión externa**
- Construido por Claude Code el 25/11/2026, con el plan aprobado por el propietario («Apruebo
  todo», 11 decisiones).
- Rama `feat/b45-carga-inicial-aceptacion-y-pue`, desde `d303732` (`main` con B44 ya fusionado).
- Estado: **construido; puesta en marcha pendiente** (decisión 11). El software y los documentos
  están listos. Faltan los pasos que hacen personas o terceros: cargar los datos reales, capacitar,
  conseguir las aprobaciones externas y firmar el acta.

## Qué se construyó

### 1. Carga inicial por plantillas (`pnpm puesta:cargar`)

Un solo comando lee de una carpeta hasta cuatro plantillas de Excel guardadas como CSV:

- `areas.csv`: procesos y áreas;
- `cargos.csv`: cargos;
- `usuarios.csv`: personas internas;
- `terceros.csv`: clientes y proveedores que son empresas.

Cómo se comporta:

- **Primero revisa y no cambia nada.** Dice, fila por fila y con el número de fila de Excel, qué
  está mal. Entrega un informe en CSV.
- **Carga solo con `--aplicar`, y solo si no hay ningún problema.** Con una sola fila mala no carga
  nada.
- **Se puede repetir.** Lo que ya existe se informa como «ya existía» y no se toca. La semilla ya
  trae el organigrama DC-SGC-001, así que en la práctica la carga solo agrega lo que falte.
- **Respeta los permisos de las pantallas.** La persona del `--correo` debe tener los mismos
  permisos que necesitaría para crear cada cosa a mano. El administrador de la plataforma puede
  cargar áreas, cargos y usuarios, pero **no terceros**: eso lo hace alguien de Comercial o de
  Finanzas (separación de funciones).
- **Cada alta queda en la auditoría** con el mismo evento de la pantalla, a nombre de quien cargó y
  marcada como carga (`source: import`).
- **Usuarios:**
  - reciben la invitación de siempre, con segundo factor obligatorio, el rol COLABORADOR, sus
    roles y su cargo;
  - el rol ADMIN_PLATAFORMA **nunca** se asigna por carga (decisión 3).
- **Terceros:** solo empresas con NIT. El comando comprueba el dígito de verificación (decisión 1).

### 2. Revisión de puesta en marcha (`pnpm puesta:revisar`)

Comando que **solo lee** y responde «CUMPLE» o «NO CUMPLE» en los puntos del anexo E que la
plataforma puede comprobar sola:

- no hay empresas de demostración (punto 22);
- no hay cuentas con correos de prueba (punto 22);
- todas las cuentas internas activas tienen segundo factor (punto 17);
- el Listado Maestro está cargado (punto 16);
- todo documento tiene regla de retención (punto 16);
- términos del sitio, términos de la plataforma y política de cookies están publicados con el
  concepto del asesor jurídico (punto 12).

Guarda el resultado en CSV como evidencia.

### 3. Revisión de accesos ampliada (punto 17 del anexo E)

En **Administración › Revisión de accesos**:

- una columna nueva, **Segundo factor**, que dice «Activo» o «Sin configurar»;
- una tarjeta nueva, **Internas sin segundo factor**;
- un botón **Descargar CSV**. La descarga queda en la auditoría con el número de filas.

### 4. Documentos de la puesta en marcha

| Documento                                                                               | Dónde                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Guía de carga inicial con las cuatro plantillas de ejemplo (datos inventados)           | [`docs/puesta-en-marcha/carga-inicial.md`](../puesta-en-marcha/carga-inicial.md)                             |
| FT-TEC-007, lista del anexo E: los 24 puntos con responsable, evidencia y estado de hoy | [`FT-TEC-007-lista-de-verificacion.md`](../puesta-en-marcha/FT-TEC-007-lista-de-verificacion.md)             |
| FT-TEC-008, acta de salida a producción para el Director General                        | [`FT-TEC-008-acta-de-salida-a-produccion.md`](../puesta-en-marcha/FT-TEC-008-acta-de-salida-a-produccion.md) |
| Plan de reversión                                                                       | [`plan-de-reversion.md`](../puesta-en-marcha/plan-de-reversion.md)                                           |
| Plan de capacitación: 8 sesiones por rol, registradas en Formación                      | [`plan-de-capacitacion.md`](../puesta-en-marcha/plan-de-capacitacion.md)                                     |
| 19 guiones de aceptación, uno por módulo construido                                     | [`docs/aceptacion/`](../aceptacion/README.md)                                                                |
| Manual de usuario: primeros pasos y un capítulo por módulo                              | [`docs/manual-usuario/`](../manual-usuario/README.md)                                                        |

## Cómo lo pruebo yo, paso a paso

### En el navegador: la revisión de accesos

1. Encienda el ambiente local: `pnpm infra:up` y luego `pnpm dev`.
2. Entre a la aplicación con una cuenta de Dirección o de auditor.
3. Vaya a **Administración › Revisión de accesos**. Compruebe tres cosas:
   - aparece la columna **Segundo factor**, con «Activo» o «Sin configurar» en cada persona;
   - aparece la tarjeta **Internas sin segundo factor**;
   - aparece el botón **Descargar CSV**.
4. Pulse **Descargar CSV**. La plataforma pide confirmar, porque la descarga queda en la auditoría.
   Ábralo en Excel: debe verse en columnas, con tildes correctas.
5. Vaya a **Auditoría › Consulta de eventos** y busque «Descargó la revisión de accesos»: debe
   estar su descarga, con su nombre y la hora.
6. Con una cuenta de colaborador, intente abrir la misma página: no debe tener acceso.

### En la terminal: los comandos de puesta en marcha

1. **Revisión** (solo lee; puede correrla sin miedo en su equipo):

   ```powershell
   pnpm puesta:revisar
   ```

   En su equipo dirá «NO CUMPLE» en casi todo, y **eso es lo correcto**: su base local tiene
   empresas de demostración, cuentas de prueba y no tiene el Listado Maestro. Así se ve lo que
   detectaría en producción. El 25/11/2026 dio:

   | Punto | Verificación                                    | Resultado en el equipo local                       |
   | ----- | ----------------------------------------------- | -------------------------------------------------- |
   | 22    | Sin empresas de demostración                    | No cumple (2 empresas ficticias)                   |
   | 22    | Sin cuentas de prueba                           | No cumple                                          |
   | 17    | Usuarios internos con segundo factor            | No cumple (no hay cuentas internas activas reales) |
   | 16    | Listado Maestro cargado                         | No cumple (0 documentos)                           |
   | 16    | Todo documento con regla de retención           | Cumple                                             |
   | 12    | Textos legales publicados con concepto jurídico | No cumple                                          |

2. **Carga en modo revisión** con las plantillas de ejemplo. Use el correo de una cuenta suya de
   prueba con rol de administrador:

   ```powershell
   pnpm puesta:cargar --correo <su correo de prueba> --carpeta docs/puesta-en-marcha/plantillas
   ```

   Sin `--aplicar` no cambia nada. Debe decir cuántos registros crearía, cuáles ya existen y, como
   el administrador no puede crear terceros, que faltan los permisos `party.create`. Para ver la
   revisión completa, use una cuenta que también tenga el rol COMERCIAL, o quite `terceros.csv` de
   una copia de la carpeta.

3. **No use `--aplicar` en su base local** salvo que quiera de verdad esos datos de ejemplo.

### Leer los documentos

Abra [`docs/puesta-en-marcha/README.md`](../puesta-en-marcha/README.md): tiene el orden de todo el
proceso de salida a producción, con enlaces a cada guía y formato.

## Cómo se probó

Verificaciones ejecutadas en el equipo local el 25 y 26/11/2026:

| Verificación                                                          | Resultado                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm typecheck` (13 paquetes), `build:types` y límites entre módulos | Sin errores; sin violaciones de dependencias                               |
| `pnpm lint` (apps, paquetes e infraestructura)                        | Sin errores                                                                |
| Formato (Prettier) de las carpetas del repositorio                    | Sin diferencias                                                            |
| knip                                                                  | Sin hallazgos en el código del bloque                                      |
| Pruebas unitarias de `golive` (planes y reporte)                      | 14/14                                                                      |
| Pruebas de la pantalla de revisión de accesos (web)                   | 7/7                                                                        |
| Integración: carga inicial (7) y revisión de puesta en marcha (4)     | 11/11, incluye permiso denegado, aislamiento entre empresas y auditoría    |
| Integración: revisión de accesos con segundo factor y descarga CSV    | 6/6                                                                        |
| Integración: control de acceso y recorrido de auditoría               | 35/35 y 2/2                                                                |
| Pruebas unitarias de la API                                           | 502 pasan; 2 fallan solo por tiempo (ver limitaciones)                     |
| `pnpm puesta:revisar` contra la base local                            | Entrega el informe con los «NO CUMPLE» esperados en una base de desarrollo |
| `pnpm puesta:cargar` con las plantillas de ejemplo (sin `--aplicar`)  | Revisa e informa sin crear nada                                            |
| PDF del manual de usuario con Gotenberg                               | 21 páginas                                                                 |

Limitaciones conocidas (las confirma la integración continua de GitHub):

- La prueba de arranque de la API supera su límite de tiempo en este equipo (la API compilada tarda
  unos 31 s en iniciar, pero inicia). La de OpenAPI y la de la cadena de autorización pasan solas.
- No se ejecutó completa `pnpm test:int` ni las pruebas de navegador (Playwright) en este equipo: el
  equipo se quedó sin memoria y Docker dejó de responder al repetir la prueba de control de acceso,
  que ya había pasado 35/35.
- No se ejecutaron `pnpm build` completo ni `pnpm secrets` en local.

## Criterios de aceptación del bloque

| Criterio                                                            | Estado                                                                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Todos los puntos del anexo E cumplidos                              | **Pendiente.** Lista FT-TEC-007 lista y revisión automática de los puntos 12, 16, 17 y 22. Los demás dependen de personas y terceros (tabla de pendientes) |
| Acta firmada por el Director General                                | **Pendiente.** Formato FT-TEC-008 listo; se firma al final                                                                                                 |
| `pnpm check` en verde                                               | Ver «Cómo se probó»                                                                                                                                        |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría | Cumplido: carga inicial, revisión y descarga de la revisión de accesos                                                                                     |
| Documentación y cierre del bloque escritos                          | Cumplido                                                                                                                                                   |

## Decisiones

### Aprobadas por el propietario (plan del 25/11/2026)

1. Carga por lote de áreas y cargos, usuarios internos con su rol y terceros que sean empresas con
   NIT. Personas naturales y colaboradores, por pantalla.
2. La carga es un comando con su guía, como el Listado Maestro.
3. Usuarios con el rol mínimo de la plantilla y segundo factor obligatorio; nunca ADMIN_PLATAFORMA
   por lote.
4. La lista del anexo E vive en `docs/puesta-en-marcha/`, como los registros de B44.
5. Códigos FT-TEC-007 (lista) y FT-TEC-008 (acta), **provisionales** hasta confirmarlos contra el
   Listado Maestro.
6. El acta se firma con la firma electrónica de la plataforma o, si no se puede, en papel
   escaneado.
7. Manual de usuario por módulo en `docs/manual-usuario/`, publicado como documento controlado. El
   código lo asigna Calidad.
8. La capacitación se registra en Talento y SST › Formación, sin programación nueva.
9. Un guion de aceptación por módulo.
10. La revisión de puesta en marcha solo lee.
11. El bloque se cierra como «construido; puesta en marcha pendiente».

### Tomadas por Claude Code al construir (para su revisión)

1. **Módulo nuevo `golive` («Puesta en marcha»)**, sin tablas ni rutas propias. Hace falta un lugar
   que pueda usar a la vez Núcleo, Identidad, Terceros, Documentos y Sitio sin crear dependencias
   circulares. Usa a cada uno solo por su `index.ts`, como manda la arquitectura.
2. **Un solo comando para las cuatro plantillas**, en lugar de uno por plantilla. Es más sencillo
   para usted y respeta el orden: áreas, cargos, usuarios y terceros.
3. **Terceros en una corrida aparte**, por la separación de funciones descrita arriba. No se le dio
   a ADMIN_PLATAFORMA un permiso nuevo.
4. **No se creó un informe de accesos nuevo:** ya existía la Revisión de accesos (B10) y se amplió.
   La descarga usa el mismo permiso de consultarla (`iam.access_review.read`), porque entrega los
   mismos datos.
5. **19 guiones y 19 capítulos, no 21:** M16 (tableros) y M20 (asistente de inteligencia
   artificial) todavía no existen. B46 y B47 agregarán los suyos.
6. **El PDF del manual se genera con Gotenberg**, el convertidor que ya usa la plataforma. No se
   agregó ninguna herramienta nueva. Las instrucciones están en el manual. Se probó: genera un PDF
   de 21 páginas.
7. **Correos de prueba** para la revisión: los dominios reservados para pruebas por norma
   (`.test`, `.example`, `.invalid`, `.localhost` y `example.com/.net/.org`).

## Qué quedó pendiente

| Pendiente                                                                      | Responsable                                         | Cuándo                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------- |
| Confirmar los códigos FT-TEC-007 y FT-TEC-008 contra RE-SGC-001                | Calidad                                             | Antes de publicarlos         |
| Asignar el código del manual de usuario y publicarlo como documento controlado | Calidad                                             | Antes de capacitar           |
| Contratar servidores, depósito, dominio y correo (vienen de B44)               | Director General                                    | Antes de salir               |
| Revisión externa del bloque y de los hitos H1 a H4; prueba de intrusión        | Director General con terceros                       | Antes de salir               |
| Concepto jurídico y publicación de los textos legales                          | Asesor jurídico y Dirección                         | Antes de salir               |
| Validación de parámetros tributarios y exportación contable                    | Contador                                            | Antes de salir               |
| Registro de actividades de tratamiento y contratos de transmisión              | Oficial de datos                                    | Antes de salir               |
| Aceptación de los 19 módulos con sus guiones firmados                          | Líderes de proceso y Director General               | En el servidor de pruebas    |
| Capacitación (8 sesiones) registrada en Formación                              | Talento humano                                      | Antes de salir               |
| Carga real: estructura, usuarios, Listado Maestro, retención y terceros        | Responsable técnico, Calidad y Comercial o Finanzas | Primera semana en producción |
| Ensayo real de alertas y de restauración (vienen de B44)                       | Responsable técnico                                 | Con los servidores listos    |
| Firma del acta FT-TEC-008                                                      | Director General                                    | Al final                     |
| Pruebas de navegador (Playwright) y revisión manual de la pantalla             | Integración continua y propietario                  | En el PR                     |

## Archivos principales

- `apps/api/src/modules/golive/`: carga inicial (`application/initial-load.ts`,
  `load-context.ts`, `structure-apply.ts`), reglas de las plantillas (`domain/`), revisión
  (`application/readiness.ts`) y comandos (`interface/cli/`).
- Consultas nuevas en otros módulos, por su `index.ts`:
  - `core/application/structure-load.ts`;
  - `iam/application/initial-load-accounts.ts`;
  - `party/application/company-load.ts`;
  - `doc/application/go-live-figures.ts`;
  - `web/application/legal-readiness.ts`.
- `iam/application/access-review.ts` y la pantalla `features/administration/access-review.tsx`:
  segundo factor y descarga.
- `platform/export/csv-read.ts`: el lector de CSV, que antes estaba en Documentos.
- Pruebas: `test/int/golive/*.int.test.ts`, `golive/domain/plans.test.ts`,
  `golive/interface/cli/load-report.test.ts`, `test/int/iam/access-review.int.test.ts` y la prueba
  de pantalla de la revisión de accesos.
- Documentos: `docs/puesta-en-marcha/`, `docs/aceptacion/` y `docs/manual-usuario/`.
