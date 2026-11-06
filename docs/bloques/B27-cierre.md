# Cierre del bloque B27: Proyectos, horas, entregables, actas y control

- Fecha: 06/11/2026
- Rama: `feat/b27-proyectos-horas-entregables-ac` (sale de `main`, que ya tiene del B23 al B26)
- Estado: en revisión. No es un bloque crítico.

## Qué se construyó

El módulo **Proyectos** (ficha 17.8) ya cubre todo el ciclo: además de la estructura y el tablero
del B26, ahora registra **horas**, prepara **entregables**, envía el **acta de entrega FT-TEC-001**
a firmar al cliente, deja el **hito listo para facturar** cuando el cliente acepta, lleva
**revisiones de código FT-TEC-002**, **riesgos**, **liberaciones**, **incidentes**, muestra los
**indicadores** y permite **cerrar** el proyecto. Usted aprobó el plan con las catorce
recomendaciones; están al final.

| Pieza               | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Horas               | Cada persona del equipo registra sus horas (en cuartos de hora, hoy o hasta **7 días atrás**, nunca más de 24 en un día), en una tarea o en el proyecto en general, y si se cobran o no. El Líder técnico aprueba varias a la vez o **devuelve** una con lo que hay que corregir. **Nadie aprueba las suyas** y una hora aprobada ya no cambia                                                                                             |
| Mis horas           | Botón **«Mis horas»** en la lista de Proyectos: las horas de la persona en todos sus proyectos y el registro desde un solo lugar                                                                                                                                                                                                                                                                                                           |
| Entregables         | El equipo los prepara (nombre, versión, hito, enlace). Estados: en preparación → entregado → aceptado o devuelto                                                                                                                                                                                                                                                                                                                           |
| Acta de entrega     | **«Entregar al cliente»** (solo el líder o un Líder técnico): se elige quién recibe por el cliente (sus firmantes de Terceros), la plataforma llena el **FT-TEC-001**, genera su PDF y, en segundos, la persona recibe el **enlace para firmar con un código** a su correo. Si firma, el entregable queda **aceptado** con el acta firmada para descargar; si la rechaza, queda **devuelto** con su motivo y se corrige y entrega de nuevo |
| Plazo del cliente   | 10 días por omisión (1 a 30, en «Configurar el control»), con recordatorios cada 3 días. Si no responde: queda «sin respuesta» y le llega un aviso al líder; **solo si el contrato prevé la aceptación tácita** (marcada con su cláusula) queda aceptado tácitamente                                                                                                                                                                       |
| Listo para facturar | Cuando el cliente acepta **todos** los entregables de un hito, el hito pasa a **«Listo para facturar»** con su valor (su porcentaje del contrato) y Administrativo y financiero recibe el aviso. El registro para que Facturación (B31) proponga la factura ya queda guardado                                                                                                                                                              |
| Revisión de código  | En el tablero, las tarjetas en revisión o en pruebas tienen **«Revisar»**: la lista FT-TEC-002 punto por punto (cumple, no cumple, no aplica). Con un punto que no cumple no se aprueba. **Quien hizo la tarea no se revisa a sí mismo.** Una tarea **no pasa a «Terminado» sin su última revisión aprobada** y la nota de pruebas                                                                                                         |
| Riesgos             | Probabilidad e impacto de 1 a 5; el nivel se calcula (bajo, medio, alto). Uno alto avisa al líder                                                                                                                                                                                                                                                                                                                                          |
| Liberaciones        | Cada versión publicada con su ambiente, fecha, notas y el **informe de pruebas en PDF, obligatorio**                                                                                                                                                                                                                                                                                                                                       |
| Incidentes          | Código `INC-2026-0001`, gravedad, tipo; se resuelven con causa raíz y acciones. Si se comprometieron **datos personales**, el Oficial de datos recibe el aviso con el plazo de 15 días hábiles para reportar a la SIC                                                                                                                                                                                                                      |
| Indicadores         | Avance (el mismo número de la ficha: tareas terminadas sobre planeadas), horas aprobadas frente al presupuesto, adelanto o retraso frente a las fechas, entregables aceptados y, **solo para quien ve todos los proyectos**, la rentabilidad con el costo de la hora. La gráfica trae su tabla                                                                                                                                             |
| Cierre              | **«Pasar a cierre»** y **«Cerrar el proyecto»** con las lecciones aprendidas. No deja cerrar si queda un entregable sin aceptar, un incidente abierto o horas sin aprobar. Cerrado, **solo se consulta**                                                                                                                                                                                                                                   |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `prj_time_entries`,
`prj_deliverables`, `prj_acceptances`, `prj_risks`, `prj_releases`, `prj_code_reviews` y
`prj_incidents`. Diccionario en [`prj.md`](../manual/datos/prj.md). **Rutas nuevas de la API:** 22, en
[`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`. **Trabajo de fondo
nuevo:** `prj.acceptance-work`, cada 20 segundos. **Formato nuevo:** la Lista de Revisión de Código
FT-TEC-002 queda publicada en cada empresa al cargar los datos semilla.

**Cómo se conectó con los otros módulos, sin mezclarlos:** Proyectos le pide a Documentos que llene
los formatos (FT-TEC-001 y FT-TEC-002) y a Contratos que envíe el acta a firmar; después lee cómo
terminó la firma. Ningún módulo lee las tablas de otro. La firma electrónica del B25 ahora firma
también actas, sin necesitar un contrato.

**Lineamientos visuales del B22A:** componentes de `@arza/ui`, resumen de errores en cada
formulario, estados de carga, vacío y error, la gráfica con su tabla y las pantallas nuevas
revisadas con la prueba de accesibilidad en claro y oscuro. Las pestañas «Disponible pronto» del
B26 desaparecieron.

## Cómo se probó

### Los criterios del bloque

**«Aceptar un entregable genera el acta firmada y el evento para facturar».** Una prueba contra una
base de datos real crea un cliente con su firmante, un contrato vigente de $ 12.000.000, un proyecto
con un hito del 25 % y un entregable de ese hito. Lo entrega, genera el PDF del acta, el trabajo de
fondo la envía a firmar, el cliente pide su código, lo escribe y firma. Comprueba que el entregable
queda aceptado con el acta firmada descargable, que el hito queda «Listo para facturar» por
**$ 3.000.000,00**, que se publicó el evento `project.milestone.billable` y que Finanzas recibió el
aviso con ese valor. Otras pruebas cubren la devolución (motivo del cliente y nueva entrega) y el
plazo vencido sin y con aceptación tácita.

**«El avance coincide con los ítems terminados».** Una prueba con dos historias y una épica termina
una historia (con su revisión aprobada) y comprueba que el indicador dice 1 de 2, 50 %, y que es el
mismo número de la ficha del proyecto.

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el Contador no ve entregables; Comercial ve los indicadores pero no registra
  ni aprueba horas, no entrega, no registra riesgos, liberaciones ni incidentes, y no cierra; el
  Equipo de proyecto prepara entregables pero **no envía el acta** ni registra riesgos.
- **Aislamiento:** un Líder técnico de otra empresa no ve entregables, horas, riesgos, indicadores ni
  incidentes, no registra riesgos, no descarga el acta y no aprueba horas de este proyecto.
- **Auditoría:** cada paso deja su registro y su evento en la misma operación; la prueba general de
  auditoría recorre las **19 rutas nuevas que escriben** y todas dejan rastro.

### Resultado de las verificaciones

Se corrió `pnpm check` completo en este equipo (7,4 GB de memoria, con menos de 1 GB libre durante
la corrida). Resultado, paso por paso:

| Paso                                                                               | Resultado                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formato (`format:check`)                                                           | Bien en todo el código del repositorio. Solo marca la carpeta local `.agents/`, que no es parte del proyecto ni de este cambio                                                                                                                                                                                                                                                                         |
| Tipos, análisis de código (`lint`), verificación de tipos, fronteras entre módulos | Bien                                                                                                                                                                                                                                                                                                                                                                                                   |
| Código sin uso (`unused`)                                                          | Marcaba 15 restos; borré dos que sobraban (un color de hitos y una consulta de revisiones que no usaba ninguna pantalla), dejé internos los demás y registré el índice de Proyectos como punto de entrada. Ahora bien                                                                                                                                                                                  |
| Pruebas unitarias                                                                  | Web: **615 pasan** y la cobertura de ramas llega al mínimo exigido (85 %); agregué 7 pruebas de casos de borde de horas, entregables, riesgos e incidentes para lograrlo. Contratos 179, API 384, worker 42: pasan. Dos pruebas antiguas (arranque de la API y un control de `ui`) se agotan por tiempo en este equipo; pasan solas                                                                    |
| Pruebas de integración                                                             | Las de **Proyectos (43) y Contratos y firma (77) pasan todas**, corridas archivo por archivo. Una de B26 esperaba la lista vieja de permisos de la ficha; la actualicé con la lista nueva completa (más estricta, no más floja). En la corrida completa varias pruebas de otros módulos se agotaron por tiempo y Gotenberg tardó más de dos minutos: falta de memoria del equipo, no fallas del código |
| Compilación (`build`)                                                              | Bien                                                                                                                                                                                                                                                                                                                                                                                                   |
| Pruebas de punta a punta                                                           | **270 de 271 pasan**, incluidas las 18 de Proyectos. La que falló (retención) fue un corte de red del equipo (`ERR_NETWORK_CHANGED`)                                                                                                                                                                                                                                                                   |
| Búsqueda de secretos                                                               | Bien                                                                                                                                                                                                                                                                                                                                                                                                   |

**Queda para la integración continua:** confirmar en el servidor (que tiene la memoria suficiente)
la corrida completa de integración y de punta a punta. Si algo falla allí, se corrige antes de unir.

**Errores reales que encontraron las pruebas y corregí:** (1) la tabla de revisiones no admite
cambios y yo la completaba después de crearla: ahora se crea completa; (2) el nombre de un evento
tenía un guion bajo, que la base no acepta; (3) el trabajo de fondo no veía las actas de ninguna
empresa por la seguridad por fila: le di el mismo permiso de lectura que ya tienen los otros
trabajos de fondo.

**Ajustes a pruebas existentes, sin debilitarlas:** las del tablero del B26 ahora registran una
revisión de código aprobada antes de terminar una tarea (es la regla nueva) y comprueban además que
sin revisión no termina; la lista de rutas del OpenAPI incluye las 22 nuevas; el documento de
permisos por rol se regeneró (el Equipo de proyecto pasa de 21 a 20 permisos).

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** (Comercial), a **Laura Díaz** (Dirección), a **Lucía**
(Líder técnico) y a **Esteban** (Equipo de proyecto) del cierre del B26.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b27-proyectos-horas-entregables-ac
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
pnpm db:seed:demo
```

La cuarta crea las tablas nuevas; la quinta ajusta los permisos (el Equipo de proyecto deja de
poder enviar actas) y publica el formato FT-TEC-002. Si alguna falla con «Can't reach database
server», espere un minuto y repítala. Luego `pnpm dev` (levanta también el trabajo de fondo que
envía las actas).

> Si `pnpm db:migrate` dice que una migración «fue modificada», es porque en este equipo apliqué una
> versión anterior mientras construía. Escriba `pnpm infra:reset` y repita los pasos (borra los
> datos de prueba locales, no los reales).

### 2. Preparar al cliente para firmar

1. Entre como **Ana** → **Terceros** → el cliente de su contrato vigente → **Contactos**: agregue
   una persona con **correo** y **documento**, marcada como **«Puede firmar»**.
2. Si el cliente no tiene proyecto, créelo como en el cierre del B26 e inícielo. En la pestaña
   **Hitos**, agregue «Entrega» con 25 %. Agregue a Esteban al equipo.

### 3. Horas

1. Entre como **Esteban** → Proyectos → **«Mis horas»** → «Registrar horas». Pruebe un día de hace 10
   días: no lo deja. Registre 3,5 horas de hoy.
2. Entre como **Lucía** → el proyecto → pestaña **Horas**: elija la de Esteban y pulse **«Aprobar las
   elegidas»**. Registre una suya: fíjese que no puede aprobarla ella misma.

### 4. Revisión de código y terminar una tarea

1. Con Lucía, asigne una tarea a Esteban y llévela en el **Tablero** hasta «En revisión».
2. En la tarjeta pulse **«Revisar»**, pegue un enlace `https://…`, marque todos los puntos y
   guarde. Intente marcar un «No cumple» y «Aprobada»: no lo deja.
3. Mueva la tarjeta a «Terminado»: ahora solo pide las pruebas hechas.

### 5. Entregar y firmar el acta

1. Pestaña **Entregables** → «Agregar un entregable», con el hito «Entrega».
2. Pulse **«Entregar al cliente»**, elija a la persona del cliente y envíe. En unos segundos, la
   columna Acta dice «En firma del cliente».
3. Abra el buzón de prueba Mailpit (http://localhost:8026): llegó el correo al cliente. Abra el
   enlace, pida el código, escríbalo y firme.
4. Vuelva con Lucía: el entregable dice **«Aceptado»**, el acta **«Aceptada y firmada»** y puede
   descargarla. En **Hitos**, «Entrega» dice **«Listo para facturar»**.
5. Si tiene una persona con el rol Administrativo y financiero, en su campana está el aviso con el
   valor del hito.

### 6. Riesgos, liberaciones, incidentes e indicadores

1. **Riesgos**: registre uno con probabilidad 4 e impacto 5: queda «Alto» y Lucía recibe el aviso.
2. **Liberaciones**: suba primero un PDF en **Archivos**; luego registre la versión eligiéndolo como
   informe de pruebas.
3. **Incidentes**: registre uno marcando «datos personales» y resuélvalo con su causa.
4. **Indicadores**: revise el avance, las horas y, con «Configurar el control» (costo de la hora),
   la rentabilidad. Entre como Esteban: no ve el dinero.

### 7. Cierre

Con Lucía: **«Pasar a cierre»** → **«Cerrar el proyecto»** con las lecciones aprendidas. Si queda
algo pendiente, le dice qué. Cerrado, las pestañas ya no ofrecen botones para cambiar nada.

## Pendientes

- **Facturación (B31):** el evento `project.milestone.billable` ya queda con todo lo necesario para
  proponer la factura del hito.
- **Portal del cliente (B30):** «entregables por aprobar»; hoy el cliente acepta desde el enlace del
  correo.
- **Costo real por persona (B35):** hoy la rentabilidad usa un costo promedio por hora por proyecto.
- **Certificación de costos de desarrollo** (Finanzas): las horas aprobadas ya quedan listas.
- **Editar una hora devuelta desde la pantalla:** hoy se borra y se registra de nuevo; la API ya
  permite corregirla.
- **La pantalla de Formatos** muestra el registro FT-TEC-001 o FT-TEC-002 sin el nombre del proyecto
  al que pertenece (Documentos no lee las tablas de Proyectos).
- **Aceptación tácita:** el acta no cambia de texto; la aceptación tácita queda en el estado del
  acta, en la auditoría (con la cláusula) y en el aviso.
- **Mi equipo:** ClamAV quedó detenido durante las pruebas por falta de memoria; lo volví a
  encender al terminar.

## Decisiones tomadas

Las catorce que usted aprobó el 05/11/2026:

1. **Firma del acta:** solo la persona del cliente, con enlace y código; el envío queda a nombre de
   quien entregó.
2. **Quién envía el acta:** el líder o un Líder técnico; el Equipo de proyecto no.
3. **Portal:** llega con el B30; hoy el cliente firma desde el correo.
4. **Plazo:** 10 días por omisión (1 a 30 por proyecto), recordatorios cada 3 días, máximo 3.
5. **Aceptación tácita:** solo si el contrato la prevé, marcada con su cláusula.
6. **Valor para facturar:** porcentaje del hito sobre el valor del contrato (o el presupuesto sin
   contrato); aviso a Administrativo y financiero.
7. **Costo de la hora:** promedio por proyecto; el Equipo de proyecto no ve dinero.
8. **Horas:** cuartos de hora, sin fechas futuras, máximo 7 días atrás y 24 por día; nadie aprueba
   las suyas; la aprobada no cambia.
9. **Revisión de código:** nunca quien hizo la tarea; obligatoria para terminar; se sigue pidiendo
   la nota de pruebas.
10. **Riesgos:** bajo hasta 6, medio hasta 14, alto desde 15; el alto solo avisa.
11. **Liberaciones:** informe de pruebas en PDF obligatorio.
12. **Incidentes:** los maneja el Líder técnico; con datos personales avisa al Oficial de datos.
13. **Cierre:** con lecciones aprendidas y sin nada pendiente.
14. **Fuera:** factura, portal, certificación de costos y costo real por persona.

Y otras, menores, que tomé al construir:

- **Horas solo de quien es del equipo**, aunque sea Líder técnico de todos los proyectos.
- **Se entrega** con el proyecto en ejecución, en riesgo o en cierre.
- **«Volver a ejecución»** desde «en cierre», si aparece trabajo nuevo.
- **La revisión de código se registra** con la tarea en «En revisión» o «En pruebas», y la tarea
  debe tener a alguien asignado (para saber quién no puede revisarla).
- **Si el PDF del acta falla**, el acta se anula, el entregable vuelve a preparación y el líder
  recibe el aviso.
- **El enlace a la revisión de código del B26** sigue guardándose si alguien lo envía, pero ya no se
  pide: la evidencia es la revisión FT-TEC-002.
- **El conocimiento del cliente (KYC)** no se exige para firmar un acta (sí para contratos, B25).
