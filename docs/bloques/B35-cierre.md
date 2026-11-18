# Cierre del bloque B35: Talento humano (colaboradores, selección y vinculación)

- Fecha: 17/11/2026
- Rama: `feat/b35-talento-humano-colaboradores-s`, actualizada con `main` (los bloques B31 a B34 ya
  están unidos). El pull request va directo contra `main`.
- Estado: **terminado el 18/11/2026**. Bloque crítico: la revisión del propietario y la revisión
  externa (hecha por Claude Code por decisión del propietario) están al final de este documento.
  La integración continua del pull request #54 quedó en verde.
- Pendiente: validar con Talento humano la lista de chequeo de la historia laboral y las bandas
  salariales de ejemplo.

## Quién lo construyó

El bloque lo empezó Claude Code (contratos de datos, 12/11/2026), lo continuó OpenCode (la mayor
parte de la API, la web y las pruebas, 13 a 16/11/2026) y lo terminó Claude Code el 17/11/2026
tras un diagnóstico. El diagnóstico encontró siete pendientes, que se resolvieron así:

| Pendiente encontrado                                                                                       | Cómo quedó                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| El documento público de la API (OpenAPI) no tenía las rutas de Talento humano: `pnpm check` fallaba        | Se publicaron las 19 rutas y se registraron en la prueba que las compara              |
| La eliminación nocturna se saltaba a todo candidato con hoja de vida, con persona compartida o en el banco | Ahora elimina siempre (ver «Eliminación de datos de candidatos»)                      |
| No existía el botón para aplazar la eliminación de quien está en el banco de hojas de vida (decisión 9)    | Botón «Aplazar eliminación»: doce meses más, solo si el candidato lo autorizó         |
| El formulario de candidatos no permitía marcar el banco de hojas de vida                                   | Casilla «El candidato autorizó conservar su hoja de vida para futuros procesos»       |
| Las tareas de inducción se creaban **sin responsable** y nadie recibía aviso (decisión 6)                  | Cada tarea tiene su responsable y este recibe un aviso                                |
| La banda salarial era texto libre (decisión 8)                                                             | Lista editable «Bandas salariales» (Banda 1 a 5, de ejemplo) en Organización › Listas |
| Las pantallas tenían 1 sola prueba                                                                         | 19 pruebas de pantalla, más las de navegador que ya existían                          |

## Qué se construyó

La **primera parte de Talento humano (M12)**: vacantes, selección de candidatos, contrato laboral con
firma electrónica, vinculación, inducción e historia laboral.

| Pieza                        | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vacantes                     | Talento humano abre una vacante para un cargo del organigrama, con su motivo. Recibe un código `VAC-AAAA-NNNN`. Se cierra o se cancela con una nota.                                                                                                                                                                                   |
| Candidatos                   | Se registra a la persona con su hoja de vida y **su autorización de datos de selección** (sin ella no se puede guardar). Pasa por postulado → preseleccionado → en evaluación → seleccionado → vinculado o descartado. En evaluación se anotan entrevistas y pruebas con puntaje.                                                      |
| Descarte con fecha           | Al descartar, el sistema fija la **fecha de eliminación de sus datos a doce meses**. La base de datos no deja descartar sin esa fecha.                                                                                                                                                                                                 |
| Banco de hojas de vida       | Si el candidato lo autorizó, Talento humano puede **aplazar la eliminación doce meses**, cuantas veces haga falta. Nunca queda guardado sin fecha.                                                                                                                                                                                     |
| Contrato laboral con firma   | Con el candidato seleccionado, Talento humano llena cargo, fecha de ingreso, tipo de contrato, modalidad, **banda salarial**, salario y correo de trabajo, y adjunta el PDF del contrato. **Firma primero el colaborador** (enlace a su correo personal) y **luego la Dirección** (dentro de la plataforma, confirmando su identidad). |
| Vincular                     | Con el contrato firmado se habilita **Vincular colaborador**. En un solo paso crea la **cuenta** (con invitación a su correo de trabajo), las **tareas de inducción** —entre ellas la **evaluación médica de ingreso** y la **asignación de equipo**—, la historia laboral y el aviso a los responsables.                              |
| Responsables de la inducción | Evaluación médica e inducción en SST: el rol **SST**. Asignación de equipo: **Administrativo y financiero** (el aviso lleva a Activos). Entrenamiento en el cargo: el **jefe inmediato** según el organigrama. Afiliaciones e inducción institucional: quien vincula. Si no hay nadie en ese rol, responde quien vincula.              |
| Historia laboral             | 13 documentos (identificación, hoja de vida, certificados, afiliaciones, contrato firmado, autorización de datos…), cada uno pendiente, recibido o no aplica, con su soporte. **Solo la ve Talento humano.**                                                                                                                           |
| Salario restringido          | El valor exacto solo lo ven **Talento humano, la Dirección y el Contador**. Los demás ven la banda.                                                                                                                                                                                                                                    |
| Pantalla                     | Menú **Talento y SST**: vacantes, candidaturas y colaboradores, y la ficha de cada colaborador.                                                                                                                                                                                                                                        |

Tablas nuevas: `hr_vacancies`, `hr_candidates`, `hr_evaluations_selection`, `hr_employees`,
`hr_contracts`, `hr_onboarding_tasks` y `hr_file_checklist` (migraciones
`20261115000000_hr_selection_hiring_onboarding` y `20261116000000_ntf_hr_onboarding_notice`). Detalle
en `docs/manual/datos/hr.md` y en la sección «Talento humano» de `apps/api/README.md`.

### Eliminación de datos de candidatos

Cada noche (4:00), para cada candidato descartado cuya fecha llegó:

- su hoja de vida se elimina: desaparece de todas las descargas y se borra del almacenamiento;
- se borran las notas de sus evaluaciones;
- sus datos personales se reemplazan por «Candidato Anonimizado». Si esa persona también es cliente,
  proveedor, contacto o colaborador, su ficha de Terceros se conserva y solo pierde el papel de
  candidato;
- queda solo un rastro anónimo (vacante, origen, etapas y fechas) y la constancia de su
  autorización.

## Decisiones tomadas

Aprobadas por usted el 12/11/2026 («Apruebo todo»):

1. Rama propia del B35 (al final, como B34 ya se unió, el pull request va contra `main`).
2. ~~Contrato generado desde una plantilla CT-GTH-001 de ejemplo~~ → reemplazada por la decisión A.
3. Firman dos: primero el colaborador, luego la Dirección.
4. La evaluación médica es una tarea de inducción a cargo de SST, sin diagnósticos; el módulo de SST
   (B37) la formalizará.
5. La asignación de equipo es una tarea para Administrativo y financiero; no se escoge el equipo
   automáticamente.
6. Talento humano marca las tareas como hechas y cada responsable recibe un aviso.
7. El salario exacto lo ven Talento humano, la Dirección y el Contador (como dice el manual).
8. Bandas salariales en una lista editable, con valores de ejemplo.
9. Eliminación de descartados a los doce meses, con aplazamiento para el banco de hojas de vida.
10. Lista de chequeo de la historia laboral propuesta, por validar contra RE-GTH-002.

Aprobadas por usted el 17/11/2026 («Apruebo el plan»):

- **A.** El contrato laboral es un PDF que Talento humano adjunta (revisado por el antivirus); la
  generación desde plantilla llegará con el bloque de formatos.
- **B.** Si la persona se usa en otra parte de la plataforma, se conserva su ficha y solo pierde el
  papel de candidato.
- **C.** El banco de hojas de vida aplaza la eliminación, nunca la cancela.

Decisiones técnicas tomadas al terminar (para su conocimiento):

- La hoja de vida vencida se elimina con borrado lógico (queda marcada como eliminada y se borra del
  almacenamiento). La base de datos protege los archivos revisados por el antivirus y solo deja
  «destruirlos» en una disposición documental; no se debilitó esa protección.
- Si la autorización de selección tiene un soporte firmado, la persona se conserva (sin el papel de
  candidato), porque ese soporte es prueba legal de la autorización.
- El aviso a los responsables no lleva el nombre del colaborador (dice «un colaborador nuevo»), para
  no poner datos personales en los eventos internos.

## Criterios de aceptación

| Criterio                                                                  | Estado                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Vincular crea cuenta, inducción, evaluación médica y asignación de equipo | Cumplido y probado (prueba de integración de la vinculación completa)                              |
| Los datos de candidatos descartados tienen fecha de eliminación           | Cumplido: lo exige la base de datos, se muestra en pantalla y la eliminación nocturna está probada |
| `pnpm check` en verde                                                     | Cumplido: las 11 revisiones de GitHub del pull request #54 en verde el 18/11/2026 (ver abajo)      |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría       | Cumplido: pruebas de Talento humano y recorrido de auditoría de todas las escrituras               |
| Documentación y cierre del bloque escritos                                | Cumplido                                                                                           |

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita estas personas (créelas en Administración › Usuarios si no
existen), cada una con un correo que pueda abrir en Mailpit (http://localhost:8025):

- una con rol **Talento humano**;
- una con rol **Dirección**, vinculada con su ficha de Terceros con número de cédula (es quien firma
  por la empresa);
- una con rol **SST** y otra con rol **Administrativo y financiero** (para ver los avisos).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b35-talento-humano-colaboradores-s
```

```bash
pnpm infra:up
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Si la persona de Dirección aún no está vinculada con su ficha de Terceros, en otra terminal, con su
correo y su cédula de prueba:

```bash
pnpm --filter @arza/api contratos:vincular-firmante --correo direccion@demo.test --documento 1030555000
```

### 2. Abrir una vacante

Entre como **Talento humano** → menú **Talento y SST** → **Registrar vacante**. Elija un cargo y un
motivo. Debe aparecer con código `VAC-2026-…` y estado «Abierta».

### 3. Registrar y evaluar un candidato

1. **Registrar candidatura**: elija la vacante, escriba los datos de una persona ficticia y su correo
   (uno que pueda ver en Mailpit), marque la autorización de datos y la casilla del banco de hojas de
   vida.
2. Pulse **Avanzar** dos veces (preseleccionado, en evaluación) y registre una evaluación con
   **Evaluar**.
3. Pulse **Avanzar** una vez más: queda «Seleccionado».

### 4. Contrato y firma

1. Cargue en **Archivos** un PDF de prueba (el contrato) y espere a que quede disponible.
2. En la candidatura, **Preparar contrato**: cargo, fecha de ingreso, tipo de contrato,
   modalidad, banda salarial (lista desplegable), salario, correo de trabajo, el PDF y la persona de
   Dirección. **Enviar contrato a firma**.
3. En Mailpit abra el correo que llegó al candidato y firme con el enlace y el código.
4. Entre como **Dirección** → Talento y SST → el colaborador → **Confirmar y firmar por la
   empresa**. Le pedirá confirmar su identidad.

### 5. Vincular

Vuelva como **Talento humano** a la ficha del colaborador. Con el contrato «Firmado», pulse
**Vincular colaborador**. Compruebe:

- que llegó a Mailpit la **invitación** a la cuenta de trabajo;
- la sección **Inducción** con seis tareas, cada una con su responsable (la evaluación médica a
  nombre de la persona de SST, la asignación de equipo a nombre de Administrativo y financiero);
- la sección **Historia laboral** con 13 documentos, el contrato y la autorización ya «Recibidos».

Entre como la persona de **SST**: en su campana de avisos verá «Tarea de inducción: Evaluación médica
ocupacional de ingreso». La de **Administrativo y financiero** verá la de asignación de equipo, con
un enlace a Activos.

### 6. Lo que no deben ver otros

- Como **Dirección**: ve el salario exacto, pero no la historia laboral.
- Como un **Colaborador** cualquiera: no ve vacantes ni candidaturas; en Talento y SST solo ve su
  propia ficha.

### 7. Descarte, fecha de eliminación y aplazamiento

1. Registre otro candidato con la casilla del banco de hojas de vida marcada y **Descártelo** con
   un motivo. Debe mostrar «Eliminación prevista» con una fecha doce meses después.
2. Pulse **Aplazar eliminación**: la fecha se corre doce meses más.
3. Un candidato descartado **sin** la casilla no muestra ese botón.

La eliminación en sí ocurre de noche, cuando llega la fecha; está cubierta por pruebas automáticas.

## Pendientes

- `pnpm check` completo: debe confirmarlo la integración continua del pull request.
- **Revisión externa** (bloque crítico) y aprobación del Director General.
- **Validar con Talento humano**: la lista de chequeo de la historia laboral (RE-GTH-002) y los
  nombres y cantidad de bandas salariales (hoy «Banda 1» a «Banda 5», de ejemplo; se cambian en
  Organización › Listas › Bandas salariales).
- **Contrato desde plantilla** (CT-GTH-001): hoy se adjunta el PDF (decisión A).
- **Bandeja de tareas del responsable**: hoy recibe el aviso y Talento humano marca la tarea; la
  bandeja propia llega con el autoservicio (B36).
- **Evaluación médica formal** con concepto de aptitud: llega con SST (B37), que leerá el evento
  `employee.hired`.
- La nota opcional al avanzar una candidatura no se guarda (no estaba en los criterios).
- Retiro del colaborador, vacaciones, novedades, desempeño y disciplinarios: B36.

## Lineamientos visuales (B22A)

Las pantallas usan solo componentes de `@arza/ui`, Montserrat, mensajes junto a cada campo con
resumen de errores al enviar, y estados vacíos claros. La nueva jerarquía visual (B22B) se aplicará
después, en su propio bloque.

## Resultado de las verificaciones

Corrida por partes el 17/11/2026, con Docker Desktop y sin `pnpm dev` en marcha:

| Verificación                                                | Resultado                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato (`pnpm format:check`)                               | En verde en todo el repositorio                                                                                                                                                                                              |
| Tipos de contratos, API, worker y web                       | En verde                                                                                                                                                                                                                     |
| ESLint                                                      | En verde sobre todos los archivos cambiados o nuevos (lo exige cada commit); el ESLint global de una sola corrida queda a la integración continua                                                                            |
| Límites entre módulos (`pnpm boundaries`)                   | En verde: 2.100 módulos, sin violaciones                                                                                                                                                                                     |
| Código sin usar (`pnpm unused`)                             | En verde                                                                                                                                                                                                                     |
| Secretos (`pnpm secrets`)                                   | Sin hallazgos (524 commits)                                                                                                                                                                                                  |
| Unitarias, un paquete a la vez                              | Contratos 224/224; API 427/427 (cobertura 97,54 % líneas, 92,40 % ramas); web 783/783 (95,24 % líneas, **85,12 % ramas**, umbral 85 %); worker 42/42; interfaz 44/44; plantillas 25/25; configuración 24/24; guiones 179/179 |
| Integración (PostgreSQL desechable, migraciones desde cero) | Talento humano (5 archivos), recorrido de auditoría de todas las escrituras, archivos y firma: 422 pruebas en verde                                                                                                          |
| Navegador, tras `build` de la web                           | `hr.spec.ts` y `navigation.spec.ts`: 6/6                                                                                                                                                                                     |
| `pnpm check` en una sola corrida                            | No se corrió en este equipo (no cierra por memoria, igual que en B31 a B34): queda a cargo de la integración continua                                                                                                        |

Notas:

- Al correr las unitarias de todos los paquetes a la vez, o mientras corrían otras revisiones,
  fallaron por **esperas** algunas pruebas de otros módulos (CRM, formatos, privacidad, proyectos y
  el arranque de la API). Todas pasan al correrlas solas; no son fallas de lógica.
- La cobertura de ramas de la web queda justo sobre el mínimo (85,12 %). Se agregaron 18 pruebas de
  pantalla de Talento humano para alcanzarla.
- Las capas de aplicación e interfaz de Talento humano se miden ahora con las pruebas de
  integración, como los demás módulos con base de datos (`apps/api/vitest.shared.ts`). La cobertura
  de la suite completa de integración la confirma la integración continua.
- No se debilitó ninguna prueba ni control. La base de datos protege los archivos ya analizados por
  el antivirus; en vez de abrir esa protección, la hoja de vida vencida se retira con borrado lógico.

### Integración continua del pull request #54 (18/11/2026)

- Primera corrida: la integración pasó sus 1.419 pruebas, pero la cobertura de ramas quedó en 83,89 %
  (mínimo 85 %), porque Talento humano se mide con estas pruebas y sus caminos de error no estaban
  probados. Se agregaron 9 pruebas de integración de casos límite (`hr-edges.int.test.ts` y
  `hr-employee-edges.int.test.ts`) y la comprobación de que los avisos de inducción llegan a cada
  responsable. No se bajó ningún umbral.
- La revisión de seguridad falló por una vulnerabilidad alta de picomatch sin versión corregida;
  el propietario aprobó una excepción temporal hasta el 17/12/2026 (`osv-scanner.toml`).
- Resultado final: las 11 revisiones de GitHub en verde.
- «Workers Builds: arza-one» (Cloudflare) falla porque su configuración solo existe en la rama
  `deploy/cloudflare`. No es del B35 ni es obligatoria; el propietario decidió ignorarla por ahora.

## Revisiones para cerrar el bloque (18/11/2026)

### Revisión del propietario

El propietario probó el B35 en su navegador con los pasos de este cierre y lo dio por bueno. Si
aparece alguna novedad, la reportará para corregirla en un cambio aparte.

### Revisión externa (decisión del propietario)

El B35 es bloque crítico y el manual pide revisión externa. El propietario no cuenta con un revisor
externo y **decidió que Claude Code la hiciera con criterio de revisor externo**. Queda constancia de
su límite: Claude Code participó en la construcción, así que no es una revisión independiente.

Alcance revisado, sobre todo el código del bloque (incluido lo construido por OpenCode):

| Tema                                              | Resultado                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permisos de las 19 rutas                          | Todas exigen sesión y permiso; la firma de la empresa exige además confirmar la identidad. La historia laboral se edita solo con el permiso restringido `hr.file.read` |
| Lo propio y lo ajeno                              | Con `hr.employee.read` limitado a lo propio, el colaborador ve solo su ficha; lo ajeno responde 404                                                                    |
| Aislamiento entre empresas                        | Todas las tablas `hr_*` con RLS; probado en integración                                                                                                                |
| Datos personales en la auditoría y en los eventos | Solo identificadores, etapas y fechas; sin nombres, correos ni documentos                                                                                              |
| Salario y contrato                                | El valor exacto solo con `hr.salary.read`; el PDF solo para Talento humano o para quien firma por la empresa                                                           |
| Cuenta del colaborador                            | Se crea solo con el rol Colaborador                                                                                                                                    |
| Eliminación de candidatos                         | Probada: hoja de vida, evaluaciones y persona; conserva la ficha compartida                                                                                            |

Hallazgo corregido durante la revisión:

- **Una persona ya registrada en Terceros no podía volver a postularse** (por ejemplo, un candidato
  descartado que aplica a otra vacante antes de que se borren sus datos, o un contacto de un
  cliente): el registro fallaba por documento repetido. Ahora se reutiliza su ficha sin cambiar sus
  datos, recupera el papel de candidato y se registra su nueva autorización. Prueba en
  `hr-edges.int.test.ts`.

Puntos anotados para bloques siguientes (no bloquean el cierre):

- El colaborador aún no descarga su propio contrato ni ve su historia laboral: llega con el
  autoservicio (B36).
- Si la persona ya existía en Terceros, sus datos de contacto no se actualizan desde el registro de
  candidatura; se corrigen en Terceros.
