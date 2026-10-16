# Cierre del bloque B15: Motor de flujos y tareas

- Fecha: 15/10/2026
- Rama: `feat/b15-motor-de-flujos-y-tareas`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, ARZA ONE tiene **un solo mecanismo de estados, aprobaciones, plazos y tareas**
para todos los módulos. Los procesos se definen como datos, sin programar (ADR-011). Usted aprobó
el plan con las seis recomendaciones; las decisiones están al final.

| Pieza                               | Qué hace, en palabras sencillas                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definiciones de flujo               | Cada proceso tiene sus **estados** y sus **transiciones** (los caminos permitidos). Cada transición dice quién puede hacerla (un permiso), en qué condición y si pide comentario         |
| Versiones                           | Un flujo se edita como **borrador** y se **publica**. Para cambiar uno publicado se crea una **versión nueva**; los trámites que ya iban por la mitad terminan con su versión            |
| Transición no definida              | Si alguien pide un paso que el flujo no tiene, **la API lo rechaza** (criterio del bloque): no hay forma de saltarse el proceso                                                          |
| Condiciones                         | Reglas simples como «monto mayor que 5.000.000», que se comparan con los datos del registro. **Nunca se ejecuta código** escrito por una persona                                         |
| Plazos en horas hábiles             | Cada estado puede tener un plazo en horas hábiles, con el horario laboral y los festivos de la empresa. Una tarea creada el viernes a las 4:00 p. m. con 4 horas vence el lunes 11:00    |
| Bandeja «Mis tareas»                | Una sola bandeja con todas sus tareas, de cualquier proceso: primero las vencidas, luego por vencimiento y prioridad, y el motivo por el que le llegó cada una                           |
| Aprobaciones en serie y paralelo    | **En serie**: uno aprueba y luego el siguiente (por ejemplo, el jefe y después Calidad). **En paralelo**: todos a la vez; con un solo rechazo, se rechaza                                |
| Delegación                          | Quien tiene una tarea la **entrega** a otra persona escribiendo su correo. Además, una delegación de aprobaciones de B10 vigente deja aprobar **a nombre de** quien delegó               |
| Escalamiento                        | Cada 15 minutos, el worker marca las tareas **vencidas** y las **escala al jefe inmediato** (el cargo superior en el organigrama). Quedan en su bandeja y en el **tablero**              |
| Tablero de tareas                   | Para quien supervisa: todas las tareas de la empresa, con filtros por estado y «solo las escaladas»                                                                                      |
| Editor básico de flujos             | En **Administración › Flujos**: formularios para los estados y las transiciones, con la lista de lo que falta para publicar mientras se edita                                            |
| Componentes de acciones e historial | «Acciones del trámite» (un botón por cada paso posible) e «Historial del flujo» (actor, fecha, decisión y comentario de cada paso). Los usarán los documentos, contratos y demás módulos |
| Flujo de demostración               | «Solicitud de prueba», solo en los datos ficticios: hasta $5.000.000 la revisan en serie el jefe inmediato y Calidad; más, en paralelo, Dirección y Finanzas                             |

**Tablas nuevas** (todas separadas por empresa con la seguridad por fila): `wf_definitions`,
`wf_states`, `wf_transitions`, `wf_instances`, `wf_history`, `wf_tasks` y `wf_approvals`.
Diccionario en [`wf.md`](../manual/datos/wf.md). El historial y las decisiones **no se pueden
modificar ni borrar**, ni siquiera desde la base de datos.

**Permiso nuevo:** `wf.task.work` («Atender sus tareas», solo lo propio), para todos los roles
que actúan en flujos (todos menos el Auditor, que solo lee). Anexo G y
[permisos por rol](../manual/datos/permisos-por-rol.md) actualizados.

## Cómo se probó

| Prueba                                | Qué demuestra                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aprobación en serie, de punta a punta | Borrador → jefe inmediato → Calidad (cualquiera con el rol, que primero «toma» la tarea) → Aprobada; sin tareas abiertas al final                                                               |
| Aprobación en paralelo                | Dirección aprueba y el trámite espera; Finanzas aprueba y queda Aprobada. En otro trámite, un rechazo lo rechaza y cancela la tarea pendiente                                                   |
| Transición no definida (criterio)     | Por la API, «approve» desde el borrador, una acción inventada y aprobar «a mano» un estado de aprobación responden `WF_TRANSITION_NOT_ALLOWED`; el trámite no se mueve                          |
| Permiso, condición y comentario       | Cancelar exige el permiso y el comentario; «Enviar a la junta» con un monto bajo responde «no cumple la condición»                                                                              |
| Historial (criterio de la ficha)      | Muestra actor, fecha, decisión y comentario de cada paso, también el «a nombre de» de una delegación                                                                                            |
| Versiones                             | Una versión publicada no se edita (ni por la API ni en la base de datos); un trámite iniciado en la versión 1 termina con la 1 aunque se publique la 2                                          |
| Escalamiento (criterio de la ficha)   | Una tarea vencida queda «vencida», escala al jefe, aparece en su bandeja y en el tablero, queda en la auditoría a nombre del sistema y no se escala dos veces                                   |
| Plazos en horas hábiles               | Del viernes en la tarde al lunes; salta el festivo del 12 de octubre de 2026; empieza a contar el lunes si se crea un sábado                                                                    |
| Delegación y reasignación             | Por identificador y por correo; con una delegación de B10 vigente, el suplente aprueba a nombre del jefe; reasignar da un plazo nuevo                                                           |
| Worker                                | Programa el escalamiento cada 15 minutos (hora de Bogotá) y escala una tarea vencida de verdad                                                                                                  |
| Pantallas                             | 31 pruebas de pantalla (bandeja, tarea, aprobación, delegación, trámite, tablero y editor) y las tres pantallas nuevas en un navegador real, sin fallas de accesibilidad en modo claro y oscuro |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin rol o desde el portal no se ven tareas, trámites ni flujos. El
  Colaborador no administra flujos, no ve el tablero ni reasigna. El Auditor ve el tablero pero no
  atiende tareas. Quien no participa en un trámite recibe «no existe», también al intentar actuar.
- **Aislamiento:** la empresa B no ve ni toca los flujos, trámites ni tareas de la empresa A; la
  misma clave de flujo puede existir en las dos.
- **Auditoría:** las 12 rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una; otra prueba revisa los eventos de un trámite y de su tarea. La pantalla de
  Auditoría los muestra en español («Inició un trámite», «Aprobó una tarea»…).

### Resultado de `pnpm check`

En verde el 15/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                              |
| Estilo y tipos          | Sin problemas                                                                                    |
| Fronteras entre módulos | Sin problemas: el motor usa iam y el núcleo solo por sus índices; el worker, por `@arza/api/wf`  |
| Código sin usar (knip)  | Sin problemas                                                                                    |
| Pruebas unitarias       | API 278, web 272, contratos 76, worker 37, interfaz 19, configuración 24, guiones 140            |
| Pruebas de integración  | API 490 en 51 archivos (6 archivos nuevos de flujos), worker 19 (uno nuevo de vencimientos)      |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la API en integración: 85,25 %, mínimo 85 %) |
| Pruebas en navegador    | Todas, incluidas 7 nuevas de flujos y tareas en modo claro y oscuro                              |
| Búsqueda de secretos    | Ninguno                                                                                          |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo                            |

**Cosas que debe saber de esta verificación:**

1. **Las mismas carpetas ajenas de B14.** `apps/api/.agents`, `apps/api/.claude`,
   `apps/api/.windsurf` y `.claude/worktrees/…` no son del proyecto ni están en git, y hacen que el
   paso de formato marque 179 archivos. No las toqué. Revisé el formato del proyecto sin ellas
   (todo bien) y corrí los demás pasos uno por uno; ESLint, excluyendo solo esas cuatro carpetas.
2. **Pruebas un paquete a la vez** (`turbo --concurrency=1`), como en B14, por la memoria del
   equipo. En la primera pasada Docker dejó de responder a mitad de las pruebas de integración y
   la prueba de arranque de la API (la misma de B11 y B14) se pasó de tiempo; en la segunda pasada
   las dos pasaron sin cambiar nada.
3. **Dos correcciones que salieron de la verificación:** knip encontró ayudas exportadas que solo
   usaba su archivo y una función que nadie usaba (commit `f461d6e`), y una prueba de B10 que
   contaba 201 permisos ahora cuenta 202 por el permiso nuevo (commit `aea5ec0`).

## Cómo lo prueba usted, paso a paso

Necesita las tres cuentas de los cierres anteriores: **Ana** (ADMIN_PLATAFORMA y DIRECCION),
**Finanzas Uno** y **Finanzas Dos** (ADMIN_FINANCIERO), en la empresa de demostración.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b15-motor-de-flujos-y-tareas
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La segunda crea las tablas nuevas; la tercera da a los roles el permiso «Atender sus tareas» y
carga el flujo «Solicitud de prueba». Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y
vuelva a escribir `pnpm dev`.

Luego, con Ana, en **Administración › Usuarios**, asígnele a **Finanzas Dos** también el rol
**Calidad** (será quien aprueba como Calidad).

### 2. El editor de flujos

1. Entre con Ana en http://localhost:3000. En **Administración** aparece **Flujos**.
2. Verá «Solicitud de prueba», versión 1, **Publicada**. Ábrala: está en solo lectura, con sus
   estados (Borrador, Revisión del jefe y de Calidad, Aprobación de Dirección y Finanzas…) y sus
   transiciones con sus condiciones por monto.
3. Pulse **«Crear una versión nueva»**: se abre la versión 2 como **Borrador**, editable.
4. Quite la transición «Cancelar» y fíjese en el recuadro de abajo: dice qué falta para publicar.
   Vuelva a la lista sin guardar (no publique todavía; lo hará en el paso 6).

### 3. Una solicitud pequeña: aprobación en serie

1. En **Administración › Flujos**, en «Iniciar un trámite de prueba», escriba el asunto «Compra de
   sillas» y el monto `1000000`. Pulse **«Iniciar el trámite»**: se abre el trámite.
2. Vaya a **Mis tareas** (menú): está «Borrador: Compra de sillas», asignada a usted.
3. Ábrala. **«Enviar a Dirección» aparece deshabilitada** con la explicación «todavía no cumple la
   condición» (el monto no pasa de 5.000.000). Escriba un comentario y pulse **«Enviar a
   revisión»**.
4. En **Mis tareas** aparece la aprobación del jefe con el motivo **«Sin responsable»**: Ana no tiene
   cargo en el organigrama (ver Pendientes), así que le llega a ella porque reasigna tareas.
   Ábrala y pulse **«Aprobar»**.
5. Salga y entre con **Finanzas Dos**. En **Mis tareas** aparece la tarea «Para su rol» (Calidad).
   Ábrala, pulse **«Tomar la tarea»** y luego **«Aprobar»**.
6. Abra el trámite (enlace «Compra de sillas»): dice **«El trámite terminó»** y el **Historial del
   flujo** muestra cada paso con quién, cuándo, la decisión y el comentario (criterio de la ficha).

### 4. Una solicitud grande: aprobación en paralelo y rechazo

1. Con Ana, inicie otro trámite de prueba: «Compra de servidores», monto `6000000`. En su tarea, ahora
   la que está habilitada es **«Enviar a Dirección»**; púlsela.
2. Se crean **dos tareas a la vez**: una para Dirección (Ana) y otra para Finanzas. Ana aprueba la
   suya: el trámite **sigue esperando**.
3. Entre con **Finanzas Uno** y abra su tarea. Intente **«Rechazar»** sin escribir nada: el botón
   no se habilita (el motivo es obligatorio). Escriba «No hay presupuesto» y rechace. El trámite
   queda **Rechazada**.

### 5. Delegar y el tablero

1. Con Ana, inicie un tercer trámite («Compra de papelería», monto `50000`). En su tarea, en
   **«Delegar la tarea»**, escriba el correo de Finanzas Uno y pulse **«Delegar»**. La tarea queda a
   nombre de Finanzas Uno («Delegada por Ana»).
2. En **Mis tareas** pulse **«Ver el tablero de todas las tareas»**: están las tareas de todos, con
   filtros por estado y «Solo las escaladas».

### 6. Publicar la versión 2

1. En **Administración › Flujos**, abra la versión 2 (Borrador). Cambie el nombre del botón
   «Enviar a revisión» por «Enviar a revisión v2», pulse **«Guardar el borrador»** y luego
   **«Publicar esta versión»**.
2. En la lista, la versión 1 queda **Retirada** y la 2 **Publicada**. El trámite de papelería sigue
   con la versión 1 (lo dice su página: «versión 1»); uno nuevo usa la 2.

### 7. La auditoría

Con Ana, vaya a **Auditoría**: verá «Inició un trámite», «Movió un trámite de paso», «Aprobó una
tarea», «Rechazó una tarea», «Delegó una tarea» y «Publicó una versión de un flujo».

**Lo que no se puede ver a simple vista** (está probado por las pruebas automáticas): que la API
rechaza una transición no definida, y el escalamiento por vencimiento (habría que esperar 8 horas
hábiles; el worker lo revisa cada 15 minutos).

## Pendientes

- **Avisos (B16):** el motor ya deja en la bandeja de salida «tarea asignada» y «tarea escalada».
  Convertirlos en avisos y correos, y el criterio «un aviso de un sábado se entrega el lunes a las
  8:00 a. m.», son de B16, como acordamos.
- **Cargo de cada persona:** el organigrama de B12 tiene cargos y jefes, pero todavía **no hay una
  pantalla para decir qué cargo ocupa cada persona**. Por eso, en su prueba la aprobación «del
  jefe» llega como «Sin responsable». El motor ya la usa (lo prueban las pruebas automáticas);
  falta la pantalla. Le propongo hacerla aparte (ver la tarea sugerida).
- **`wf_sla_policies`:** con la mesa de ayuda (M08), como acordamos.
- **El Auditor** ve el tablero, pero no abre el detalle de una tarea (ese detalle exige atender
  tareas). Mientras tanto ve cada paso en **Auditoría**.
- **Inicio:** la tarjeta «Mis tareas» del tablero de inicio sigue siendo informativa; el acceso es
  por el menú.
- **Editor:** una condición por transición (la API admite hasta diez) y sin diagrama para
  arrastrar; es el editor «básico» que pide el bloque.
- **Firma en una transición** (`requires_signature` del capítulo 12.3): llega con la firma
  electrónica.

## Decisiones tomadas

Las seis que usted aprobó:

1. **Permiso `wf.task.work`** («Atender sus tareas», solo lo propio) para los roles que actúan en
   flujos. Ningún rol lo tiene «sobre todo»: cada quien atiende lo suyo. El Auditor no lo recibe,
   porque solo lee.
2. **Flujo de demostración** «Solicitud de prueba» en los datos ficticios y el botón «Iniciar un
   trámite de prueba», solo para quien administra flujos.
3. **Condiciones como datos:** comparaciones (igual, distinto, mayor, menor, «está en») con los
   datos que entrega el módulo dueño del registro. El dinero se compara exacto, sin redondeos.
4. **Una tarea vencida sigue abierta:** su responsable o el jefe pueden terminarla. Sin jefe, la
   atiende quien reasigna tareas.
5. **Los avisos quedan para B16;** B15 deja los eventos en la bandeja de salida.
6. **`wf_sla_policies` con la mesa de ayuda.**

Y estas, que tomé al construir:

7. **Plazos en los estados** (como dice el capítulo 12.3, `sla_hours`), en horas hábiles con las
   dos jornadas del horario laboral. El «plazo de una transición» es el plazo del estado del que
   sale.
8. **Quién hace una transición:** si tiene permiso, quien lo tenga; si no, quien atiende el paso
   (tiene una de sus tareas o, si no hay tareas, quien inició el trámite).
9. **«approve» y «reject» de un estado de aprobación los ejecuta el motor** con las decisiones;
   pedirlos «a mano» es una transición no permitida.
10. **Delegar no cambia el plazo; reasignar da un plazo nuevo** desde ese momento.
11. **Delegar y reasignar por correo**, como las delegaciones de B10, porque el Colaborador no ve la
    lista de usuarios.
12. **El jefe inmediato** es quien ocupa el cargo superior; si lo ocupan varias personas, la cuenta
    más antigua.
13. **Un solo trámite abierto por registro**, y una sola versión publicada por flujo: se garantiza
    bloqueando las filas en el caso de uso (los índices parciales no los maneja bien Prisma).
14. **«Mis tareas» en el menú exige permiso:** antes la veía todo el mundo como «en construcción».
15. **Una prueba del worker de B11** que exigía que solo existiera el trabajo de la auditoría ahora
    revisa que el suyo exista; la prueba nueva de B15 exige la lista completa de trabajos
    programados, así que el control no se debilitó.

## Commits

| Commit    | Qué hizo                                                                                  |
| --------- | ----------------------------------------------------------------------------------------- |
| `0a5e927` | Permiso «Atender sus tareas» (`wf.task.work`) para los roles que actúan en flujos         |
| `499db0c` | Contratos, las siete tablas `wf_` con sus reglas y los plazos en horas hábiles del núcleo |
| `5b4f27b` | Reglas del motor: transiciones, condiciones, aprobaciones y quién atiende cada tarea      |
| `9070cf7` | Motor en ejecución, bandeja de tareas y rutas de la API, con el flujo de demostración     |
| `f2f43fa` | Pruebas de integración: motor, versiones, permisos, aislamiento y auditoría               |
| `532c2d5` | Worker: escalamiento de tareas vencidas cada 15 minutos                                   |
| `0472d6c` | Delegar y reasignar por correo                                                            |
| `6c13a7c` | Pantallas: «Mis tareas», tarea, trámite, tablero y editor de flujos                       |
| `6ed2322` | Diccionario de datos, README, textos de la auditoría                                      |
| `f461d6e` | Una función sin uso eliminada y ayudas de un solo archivo privadas (knip)                 |
| `aea5ec0` | La prueba del catálogo cuenta el permiso nuevo                                            |
| (este)    | Cierre del bloque                                                                         |
