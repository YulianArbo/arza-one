# Cierre del bloque B28: Mesa de ayuda

- Fecha: 06/11/2026
- Rama: `feat/b28-mesa-de-ayuda` (sale de la rama del B27, que aún no está unida a `main`)
- Estado: en revisión. No es un bloque crítico.

## Qué se construyó

El módulo **Servicio** (ficha 17.9) ya tiene su **mesa de ayuda**: se registran tiquetes, cada uno
con un **reloj** según su prioridad que **se pausa mientras se espera al cliente**, avisa cuando se
consume el **80 % del plazo**, se asigna y se **escala** por niveles, guarda la **conversación**
(mensajes al cliente y notas internas), y lleva las **garantías** de los entregables y las
**compensaciones** al cliente. Usted aprobó el plan con las doce recomendaciones; están al final.

| Pieza              | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bandeja            | **Servicio** en el menú. Vistas: todos los abiertos, mis tiquetes, sin asignar, **por vencer**, **vencidos**, en espera del cliente, y resueltos y cerrados. Lo que vence primero, arriba. Cada fila muestra el reloj («A tiempo», «Por vencer», «Vencido», «Pausado»)                                                                       |
| Nuevo tiquete      | Asunto, qué pasa, categoría y prioridad. Servicio al cliente además elige el **cliente** de Terceros, quién reporta y **por dónde llegó** (registro interno, correo o teléfono). Un colaborador registra lo suyo, como una falla de ARZA ONE. Código `TIQ-2026-0001`                                                                         |
| Reloj              | Cada prioridad tiene un plazo para la **primera respuesta** y otro para la **solución**. En «En espera del cliente» el reloj **se detiene** y, al reanudar, sigue con lo que le quedaba. El primer mensaje al cliente cuenta como primera respuesta                                                                                          |
| Alertas            | Al **80 %** del plazo de solución, y otra vez al **vencer**, el responsable y el líder de Servicio reciben un aviso. Un tiquete **crítico** avisa al Líder técnico, al líder de Servicio y a la Dirección. Como todo aviso salvo el de seguridad, fuera del horario laboral llega al iniciar la jornada (vea la decisión pendiente al final) |
| Recorrido          | Nuevo → asignado → en curso → en espera del cliente → resuelto → cerrado. **Asignar**, **escalar** (sube de nivel, con su motivo), empezar, poner en espera, reanudar, **resolver** (con la solución), reabrir y cerrar. Un resuelto **se cierra solo** a los 5 días hábiles                                                                 |
| Conversación       | Mensajes **al cliente**, **notas internas** (el cliente y quien pidió el tiquete no las ven) y lo que **el cliente respondió** por correo o teléfono, que reanuda el reloj. No se editan ni se borran                                                                                                                                        |
| Acuerdos de tiempo | **Servicio → Acuerdos de tiempo**: los plazos por prioridad y si cuentan horas hábiles o corridas. Solo Servicio al cliente los cambia                                                                                                                                                                                                       |
| Garantías          | Cuando el cliente **acepta un entregable** en Proyectos, nace sola su garantía de **90 días**. **Servicio → Garantías** las muestra (vigentes, vencidas) y permite ajustar el fin y lo que cubre. Un tiquete sobre ese entregable dice **«En garantía»**                                                                                     |
| Compensaciones     | En la ficha del tiquete: quien atiende **propone** un descuento en pesos, horas de soporte sin costo o días de extensión; **otra persona** con permiso la aprueba o rechaza (nadie aprueba la suya) y luego se marca **aplicada**. Registro RE-SAC-001                                                                                       |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `svc_tickets`,
`svc_ticket_messages`, `wf_sla_policies`, `svc_warranties` y `svc_compensations`. Diccionario en
[`svc.md`](../manual/datos/svc.md). **Rutas nuevas de la API:** 19, en
[`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`. **Trabajo de fondo
nuevo:** `svc.sla-work`, cada 5 minutos (alertas, vencidos y cierre automático). **Permiso nuevo:**
«Configurar los acuerdos de tiempo y las garantías», solo para Servicio al cliente.

**Cómo se conectó con los otros módulos, sin mezclarlos:** la mesa de ayuda le pide a Terceros el
nombre del cliente, a Proyectos el proyecto y el entregable, y al núcleo el horario laboral y los
festivos para contar las horas hábiles. Proyectos le avisa, en la misma operación en que el cliente
acepta un entregable, para que nazca la garantía. Ningún módulo lee las tablas de otro.

**Lineamientos visuales del B22A:** componentes de `@arza/ui`, una sola acción principal por
pantalla, resumen de errores en cada formulario, estados de carga, vacío y error, y las pantallas
nuevas revisadas con la prueba de accesibilidad en modo claro y oscuro. El aviso «Este módulo está
en construcción» de Servicio desapareció.

## Cómo se probó

### Los criterios del bloque

**«El reloj se pausa en espera del cliente».** Una prueba contra una base de datos real registra
un tiquete crítico (4 horas corridas para resolver), lo asigna y lo empieza, deja pasar 60 minutos
y lo pone en espera del cliente. Comprueba que el reloj queda «Pausado», sin vencimiento. Deja
pasar **10 horas** y el trabajo de fondo no alerta ni marca vencido. Al reanudar, el vencimiento
queda exactamente **180 minutos** adelante (los 240 menos los 60 ya consumidos). Otra prueba
comprueba que la respuesta del cliente, registrada en la conversación, reanuda el reloj, y otra
que un tiquete en espera no alerta aunque pase un día entero.

**«Un tiquete al 80 % del plazo genera alerta».** Con el mismo tiquete crítico, a los 191 minutos
el trabajo de fondo no alerta; a los 193 sí (el 80 % de 240 es 192), **una sola vez** aunque corra
de nuevo. El tiquete aparece en «Por vencer», y el responsable y el líder de Servicio reciben el
aviso «consumió el 80 % de su plazo de solución». Una hora después queda **vencido**, con su
registro en la auditoría.

Además: el resuelto se cierra solo pasados los días hábiles y uno cerrado ya no se reabre; escalar
sube de nivel hasta el 3 y avisa a quien lo recibe; solo se asigna a Servicio al cliente o al Líder
técnico; el primer mensaje al cliente es la primera respuesta y la nota interna no; quien pidió un
tiquete no ve las notas internas; nadie aprueba la compensación que propuso; cambiar la prioridad
recalcula el tiquete; y aceptar un entregable firmando el acta crea su garantía de 90 días y deja
«en garantía» los tiquetes de ese entregable.

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** un colaborador registra y ve solo lo suyo (lo ajeno «no existe»), no
  asigna, no atiende y no ve las garantías; Comercial lee pero no registra ni escribe; el Contador
  no entra; el Líder técnico atiende pero no cambia los acuerdos de tiempo ni decide compensaciones
  ni ajusta garantías.
- **Aislamiento:** una persona de Servicio de otra empresa no ve el tiquete, su conversación ni sus
  compensaciones, no lo encuentra en su bandeja, no escribe y no lo resuelve.
- **Auditoría:** la prueba general de auditoría recorre las **16 rutas nuevas que escriben** y todas
  dejan rastro; las pruebas del reloj revisan el orden exacto de los registros de cada tiquete.

### Resultado de las verificaciones

Este equipo tiene 7,4 GB de memoria y durante el trabajo quedaban unos 300 MB libres. Con su
permiso detuve un `pnpm dev` que había quedado corriendo desde el mediodía. Por eso corrí cada
verificación por partes en lugar de un solo `pnpm check`:

| Paso                                     | Resultado                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato, análisis de código y tipos      | Bien en todo lo nuevo (API, worker, web y pruebas)                                                                                                                                                                                                                                                                                             |
| Fronteras entre módulos                  | Bien: ningún módulo lee tablas de otro                                                                                                                                                                                                                                                                                                         |
| Código sin uso (`unused`)                | Bien, después de dejar internas diez funciones que no necesitaban salir de su archivo                                                                                                                                                                                                                                                          |
| Pruebas unitarias                        | Web: **639 pasan** y la cobertura de ramas queda en **85,13 %** (el mínimo es 85 %; agregué casos de borde para lograrlo). Contratos 179, worker 42, API 405 de 406: la que falla es la del arranque de la API, que en este equipo tarda más de los 18 segundos que espera la prueba (igual que en el B27). La arranqué a mano y responde bien |
| Pruebas de integración                   | Las de la mesa de ayuda (**18**) y el recorrido de auditoría de sus 16 rutas pasan                                                                                                                                                                                                                                                             |
| Compilación (`build`)                    | Bien                                                                                                                                                                                                                                                                                                                                           |
| Pruebas de punta a punta y accesibilidad | Las **14 pantallas nuevas** (bandeja, conversación, datos, compensaciones, registro, acuerdos y garantías, en claro y en oscuro) sin violaciones; y las 29 de la prueba general de accesibilidad, también                                                                                                                                      |

**Queda para la integración continua:** la corrida completa de integración y de punta a punta de
todos los módulos, que en este equipo no cabe en memoria.

**Errores reales que encontraron las pruebas y corregí:** (1) la primera vez que una empresa sin
datos semilla abría «Acuerdos de tiempo», la plataforma creaba los acuerdos de fábrica sin dejar
registro en la auditoría y el control de la plataforma lo rechazaba: ahora esa creación queda
auditada. Lo demás fueron ajustes de forma (funciones largas y exportaciones de más).

**Ajustes a pruebas existentes, sin debilitarlas:** la prueba de «módulo en construcción» ahora usa
Calidad (B38), porque Servicio ya está construido; la lista de rutas del OpenAPI incluye las 19
nuevas; el documento de permisos por rol se regeneró (Servicio al cliente pasa de 43 a 44 permisos).

**Una prueba existente que respeté y que cambia algo del plan:** la plataforma tiene la regla de que
**solo la alerta de seguridad llega fuera del horario laboral** (derecho a la desconexión). Por eso
la alerta de la mesa de ayuda **no es urgente al empezar**: fuera de horario, llega al iniciar la
jornada. Para los tiquetes de horas hábiles no cambia nada, porque su reloj tampoco corre fuera de
horario. Para los **críticos**, que corren las 24 horas, vea la decisión pendiente al final.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Lucía** (Líder técnico), a **Esteban** (Equipo de proyecto)
y a **Ana** (Comercial) de cierres anteriores, y **dos personas nuevas con el rol «Servicio al
cliente»** (créelas en Administración → Usuarios; por ejemplo **Sofía** y **Mateo**).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b28-mesa-de-ayuda
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

La cuarta crea las tablas nuevas; la quinta carga los acuerdos de tiempo de fábrica y el permiso
nuevo. Si alguna falla con «Can't reach database server», espere un minuto y repítala.

> Si `pnpm db:migrate` dice que una migración «fue modificada», escriba `pnpm infra:reset` y repita
> los pasos (borra los datos de prueba locales, no los reales).

### 2. Registrar un tiquete y ver el reloj

1. Entre como **Sofía** → **Servicio** → **«Nuevo tiquete»**. Pulse «Registrar el tiquete» sin
   llenar nada: le dice qué falta.
2. Escriba un asunto, elija prioridad **Alta**, busque un cliente, escriba quién reporta y elija
   «Teléfono». Registre. Se abre la ficha con el código `TIQ-2026-…`, estado «Nuevo».
3. Pestaña **Datos**: el acuerdo dice «4 h para responder y 16 h para resolver (horas hábiles)».

### 3. Asignar, escalar y conversar

1. Pulse **«Asignar»** y elíjase a usted misma. Luego **«Empezar»**: queda «En curso».
2. En **Conversación**, escriba una **nota interna** y luego un **mensaje al cliente**. En
   **Datos**, «Primera respuesta» ya dice cuándo se dio.
3. Pulse **«Escalar»**, elija a Lucía y escriba el motivo: queda en **nivel 2**. Entre como Lucía:
   en su campana está el aviso.

### 4. La pausa del reloj (criterio del bloque)

1. Como Sofía, pulse **«Poner en espera del cliente»** y escriba qué necesita. El aviso azul dice
   que el reloj está pausado y la bandeja lo muestra en «En espera del cliente».
2. En **Conversación**, elija «Respuesta del cliente» y escriba lo que respondió. El tiquete vuelve
   a «En curso» y la fecha de vencimiento se movió hacia adelante lo que estuvo en pausa.

### 5. La alerta del 80 % (criterio del bloque)

Esperar horas reales no es práctico, así que use un plazo corto:

1. **Servicio → Acuerdos de tiempo** → prioridad **Baja** → «Cambiar»: primera respuesta **0,25**,
   solución **0,25** y reloj **«Corrido, 24 horas al día»**. Guarde.
2. Registre un tiquete de prioridad **Baja**, asígneselo y empiécelo.
3. Espere unos **15 minutos** (el trabajo de fondo revisa cada 5): en la bandeja pasa a
   **«Por vencer»** y luego a **«Vencido»**, y en la campana de Sofía (y del líder de Servicio)
   llegan las alertas.
4. Deje el acuerdo de Baja como estaba: 16 h y 80 h, horas hábiles.

### 6. Resolver, compensar y cerrar

1. Pulse **«Resolver»** y escriba la solución. El aviso dice cuándo se cerrará solo.
2. Pestaña **Compensaciones** → «Proponer una compensación»: descuento de 150000 con su motivo.
   Intente «Aprobar» usted misma: no lo deja. Entre como **Mateo** y apruébela; luego
   «Marcar aplicada hoy».
3. Como Sofía, **«Cerrar»** el tiquete.

### 7. Garantías

Si en el B27 aceptó un entregable firmando el acta, entre a **Servicio → Garantías**: ahí está con
90 días. Si no, acepte uno ahora (pasos del cierre del B27) y vuelva. Registre un tiquete de ese
proyecto y entregable: la bandeja y la ficha dicen **«En garantía»**.

### 8. Lo que cada quien puede ver

1. Entre como **Esteban**: en Servicio solo ve los tiquetes que él registró; no ve Garantías ni
   puede asignar.
2. Entre como **Ana** (Comercial): ve los tiquetes pero no puede registrar ni escribir.

## Pendientes

- **PQRSF, encuestas y base de conocimiento (B29):** al resolver un tiquete ya queda el evento
  `service.ticket.resolved` para enviar la encuesta de satisfacción.
- **Portal del cliente (B30):** que el cliente registre sus tiquetes y vea los mensajes públicos.
  Hoy no se envían correos al cliente desde la mesa de ayuda (decisión 8).
- **Facturación (B31):** aplicar en la factura las compensaciones aprobadas; el evento
  `service.compensation.approved` ya queda con lo necesario.
- **Correo entrante:** crear tiquetes a partir de correos que llegan; quedó fuera de este bloque.
- **Líder de Servicio:** las alertas van a quien ocupe el cargo dueño del proceso SAC
  («Líder de Servicio al Cliente»). Si nadie ocupa ese cargo, van a todas las personas con el rol
  Servicio al cliente. Revise en Administración que el cargo tenga a su persona.

## Decisiones aprobadas (06/11/2026)

1. La rama sale del B27 (que aún no está unido) y el pull request se encadena sobre el suyo.
2. Acuerdos de fábrica: crítica 1 h / 4 h corridas; alta 4 h / 16 h, media 8 h / 40 h y baja 16 h
   / 80 h hábiles. Se cambian en pantalla.
3. Niveles: N1 Servicio al cliente, N2 Líder técnico o equipo del proyecto, N3 especialista o
   proveedor. Escalar sube un nivel, reasigna y pide el motivo; no es automático.
4. El líder que recibe las alertas es quien ocupa el cargo dueño del proceso SAC; si no hay, todas
   las personas de Servicio al cliente.
5. Un tiquete crítico (PT-TEC-003) avisa de inmediato al Líder técnico, al líder de Servicio y a la
   Dirección.
6. La primera respuesta es el primer mensaje al cliente.
7. Un resuelto se cierra solo a los 5 días hábiles; se puede reabrir mientras esté resuelto.
8. Sin correos al cliente en este bloque; lo que responde el cliente lo registra quien atiende y
   reanuda el reloj. El correo entrante queda fuera.
9. Servicio al cliente y Líder técnico ven y atienden todos los tiquetes; Equipo de proyecto y
   Colaborador, solo los suyos; Dirección, Calidad, Comercial y Auditoría solo leen. Permiso nuevo
   para configurar acuerdos y garantías, solo de Servicio al cliente.
10. Garantía automática de 90 días al aceptarse un entregable, ajustable.
11. Compensaciones de tres tipos, propuestas por quien atiende y decididas por otra persona; la
    aprobada queda para Facturación.
12. Fuera: PQRSF, encuestas y base de conocimiento (B29), portal (B30), facturación (B31).
    Además, la mesa de ayuda lleva su propio recorrido de estados en lugar del motor de flujos,
    para no llenar «Mis tareas» con un trámite por tiquete.

## Decisión pendiente a su cargo

**¿La alerta de la mesa de ayuda debe llegar también fuera del horario laboral?** Hoy, como todo
aviso salvo el de seguridad, llega al iniciar la jornada. Si quiere que un tiquete **crítico**
despierte a alguien a medianoche, un administrador lo activa sin programar en **Administración ›
Plantillas › «Alerta de plazo o tiquete crítico» › marcar «Urgente»**. Le recomiendo hacerlo solo si
hay un turno de soporte acordado por escrito con esas personas.
