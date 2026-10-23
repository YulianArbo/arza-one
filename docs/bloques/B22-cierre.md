# Cierre del bloque B22: CRM, contactos, oportunidades y actividades

- Fecha: 22/10/2026
- Rama: `feat/b22-crm-contactos-oportunidades-y`
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, el menú **Comercial** ya funciona. La empresa registra a las **personas
interesadas (prospectos)** con su autorización de datos, el equipo comercial recibe la tarea de
contactarlas, las que valen la pena se **convierten en oportunidades**, las oportunidades avanzan
por el **embudo** hasta ganarse o perderse (con motivo), cada una lleva sus **actividades con
recordatorio**, y el **informe del embudo (RE-COM-001)** se ve en pantalla y se descarga en Excel.
Usted aprobó el plan con las nueve recomendaciones; las decisiones están al final.

| Pieza                   | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prospectos              | Comercial › **Prospectos**. Se registra la persona (nombre y correo o teléfono, **sin pedir la cédula**), qué necesita, por dónde llegó y la campaña, con su **autorización de tratamiento** (casilla nunca marcada). Recibe un código `LEA-2026-0001`                             |
| Persona ya registrada   | Si el correo, el teléfono o el nombre coinciden con alguien de Terceros, el formulario lo avisa y ofrece **«Usar esta persona»**, para no duplicarla                                                                                                                               |
| Tarea de contacto       | Al registrar un prospecto, el rol **Comercial** recibe en **Mis tareas** «Contactar a … (LEA-…)», con un día hábil de plazo. Se cierra sola al calificarlo o descartarlo; si se atiende desde Mis tareas, el prospecto cambia con ella                                             |
| Calificar y descartar   | En la ficha del prospecto: **«Calificar»** (cliente potencial) o **«Descartar»** con un motivo de la lista (No es cliente objetivo, Datos falsos, Duplicado, Otro). Descartado ya no cambia                                                                                        |
| Convertir               | Un prospecto calificado se **convierte en oportunidad**: a nombre de la persona o de una empresa ya registrada en Terceros, con título, valor y fecha esperada de cierre                                                                                                           |
| Embudo (tablero)        | Comercial (la portada): una columna por etapa (**Prospección → Diagnóstico → Propuesta → Negociación**) con cuántas hay y cuánto suman. Cada tarjeta se **arrastra** con el ratón o se mueve con **«Mover a…»** (también con el teclado). Un cierre que ya pasó dice **«Vencida»** |
| Embudo (tabla)          | El botón **«Tabla»** muestra todas en filas: abiertas, ganadas y perdidas, o todas                                                                                                                                                                                                 |
| Ficha de la oportunidad | Cliente, valor, probabilidad, **valor ponderado** (valor × probabilidad), responsable. **Cambiar de etapa**, **«Marcar ganada»** o **«Marcar perdida»** (el motivo es obligatorio). Cerrada ya no cambia                                                                           |
| Ganar                   | El cliente queda **activo y con el papel de cliente** en Terceros. Si es un prospecto sin documento, la plataforma pide registrarlo primero                                                                                                                                        |
| Actividades             | Llamadas, reuniones, tareas y correos en la ficha de cada prospecto u oportunidad, con día y hora de Colombia. Su responsable recibe un **aviso 30 minutos antes** (campana y correo). Comercial › **Actividades** es la agenda de cada persona                                    |
| Campañas                | Comercial › **Campañas**: nombre, canal, fechas y presupuesto, con cuántos prospectos trajo cada una                                                                                                                                                                               |
| Informe del embudo      | Comercial › **Informe del embudo** (RE-COM-001): abiertas, valor ponderado, ganadas, perdidas, tasa de cierre, prospectos convertidos, el detalle por etapa, los motivos de pérdida y el registro completo. **«Descargar RE-COM-001 (CSV)»** lo abre en Excel                      |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `crm_campaigns`, `crm_leads`,
`crm_opportunities` y `crm_activities`. Diccionario en [`crm.md`](../manual/datos/crm.md).
**Cambio en Terceros:** un prospecto puede quedar sin documento ([`pty.md`](../manual/datos/pty.md)).

**Rutas nuevas de la API:** 18, en [`apps/api/README.md`](../../apps/api/README.md) y en
`apps/api/openapi.json`. **Trabajo nuevo del worker:** los recordatorios, cada minuto.

**Lineamientos de B20A:** las pantallas usan solo componentes de `@arza/ui` y sus estados de carga,
vacío, error y sin permiso. Faltaban dos piezas y las agregué allí, no en el CRM: **TextareaField**
(texto largo con etiqueta y error) y la opción de que una **tabla ancha se recorra con el teclado**
(la revisión de accesibilidad la pidió). No hay ninguna excepción visual.

## Cómo se probó

| Prueba                                 | Qué demuestra                                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prospectos (integración)               | La persona nace como tercero prospecto sin documento, su autorización queda con origen «prospecto del CRM», el código `LEA-…`, la tarea de contacto para Comercial y su evento de auditoría                |
| Estados del prospecto                  | Calificar cierra la tarea; descartar exige un motivo de la lista; no se convierte sin calificar; cerrado no cambia (también directo en la base de datos); con versión vieja responde «otra persona cambió» |
| Mis tareas                             | Calificar o descartar **desde la tarea** cambia el prospecto (descartar queda con motivo «Otro» y el comentario)                                                                                           |
| Embudo                                 | Nace en Prospección con 10 %; al moverla toma la probabilidad de la etapa o la que se escriba; el tablero ordena por fecha de cierre                                                                       |
| Perder y ganar                         | Perder exige motivo; ganar sin documento se niega con un mensaje claro; con documento deja al tercero activo y como cliente; ganada o perdida no cambia, ni directo en la base                             |
| Actividades y recordatorios            | Se agendan en lo abierto, nunca en dos registros a la vez; hechas exigen resultado; el aviso sale **una sola vez** para las de los próximos 30 minutos y vuelve a programarse si cambia la hora            |
| **El informe coincide con RE-COM-001** | Los totales, el valor ponderado (al centavo, redondeando la mitad hacia arriba), la tasa de cierre, los motivos y el CSV se revisan contra el cálculo a mano                                               |
| Campañas                               | El nombre no se repite; cuentan sus prospectos; editar queda en la auditoría                                                                                                                               |
| Pantallas                              | 38 pruebas nuevas de pantalla y, en un navegador real, las siete pantallas sin fallas de accesibilidad en modo claro y oscuro                                                                              |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el Colaborador, SST, Talento Humano y el portal no ven nada del CRM.
  Dirección y Calidad **leen** pero no registran, califican, ganan, crean campañas ni agendan.
- **Aislamiento:** otra empresa no ve ni cambia los prospectos, oportunidades, campañas ni el
  informe de esta, y un prospecto no puede tomar una persona de otra empresa.
- **Auditoría:** cada registro, edición, calificación, descarte, conversión, cambio de etapa,
  ganada, perdida, actividad, recordatorio, campaña y descarga del informe deja su evento; las
  pruebas revisan la cadena de eventos de cada registro.

### Resultado de `pnpm check`

En verde el 22/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                |
| Estilo y tipos          | Sin problemas                                                                                      |
| Fronteras entre módulos | Sin problemas: el CRM usa terceros, privacidad, flujos, identidad y el núcleo solo por sus índices |
| Código sin usar (knip)  | Sin problemas                                                                                      |
| Pruebas unitarias       | Todas: API 346, web 437, worker 41, contratos 128, componentes 30, plantillas 18 y demás paquetes  |
| Pruebas de integración  | API 860 en 100 archivos (8 archivos nuevos del CRM y uno de Terceros), worker 25                   |
| Cobertura               | Sobre lo que exige el capítulo 21 (ramas de la API en integración: 85,12 %; de la web: 85,22 %)    |
| Pruebas en navegador    | 209, incluidas 14 nuevas de este bloque (siete pantallas en modo claro y oscuro)                   |
| Búsqueda de secretos    | Ninguno                                                                                            |
| Migraciones             | Desde cero en la prueba de integración y sobre una base con B21, sin diferencias con el modelo     |

**Cosas que debe saber de esta verificación:**

1. **Formato:** `pnpm check` completo se detiene en su primer paso por la carpeta local de
   herramientas `.agents/`, que no es parte del proyecto ni de este bloque. Revisé el formato de
   todos los archivos del proyecto aparte y corrí los demás pasos uno por uno, un paquete a la vez
   (`turbo --concurrency=1`), como en los bloques anteriores, por la memoria del equipo.
2. **Un error real que encontraron las pruebas:** el aviso nuevo «Se acerca una actividad
   comercial» no estaba en la lista de tipos de aviso que la base de datos permite; el recordatorio
   habría fallado al llegar a la campana. Lo corregí en la migración y agregué una prueba que sigue
   el recordatorio hasta el aviso de la persona.
3. **Ajustes que salieron de la verificación, sin bajar ningún control:** la cobertura de ramas
   quedó por debajo del 85 % en la web (84,01 %) y en la API (84,27 %); agregué pruebas reales de
   casos que faltaban (registrar una oportunidad, editar una campaña, filtros, arrastrar y soltar,
   responsables y campañas inexistentes, recordatorios vencidos). El recorrido de auditoría de B11
   ya incluye las 16 rutas nuevas que escriben. Una prueba de plantillas contaba seis tipos de
   aviso fijos; ahora cuenta los tipos que existen, que son siete.
4. **Pruebas que fallaron una vez por la carga del equipo y pasan solas:** la del arranque de la API
   (ya conocida desde B11) y una de los papeles del tercero. En la última vuelta completa pasaron
   todas.
5. **Migración sobre la versión anterior:** agrega las cuatro tablas del CRM; deja opcionales el
   tipo y el número de documento de los terceros (solo para prospectos) y amplía las listas de
   orígenes de las autorizaciones y de tipos de aviso. No cambia datos existentes.
6. **No probé el recorrido a mano** en el entorno local completo (`pnpm dev` con la base real):
   lo cubren las pruebas de integración con base de datos real y las de navegador con la API
   simulada, que usan los mismos contratos. El paso a paso de abajo es para que usted lo haga.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** con el rol **Comercial** (como administradora no ve
el CRM, igual que en la vida real).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b22-crm-contactos-oportunidades-y
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol COMERCIAL
```

La tercera crea las tablas nuevas; la cuarta crea las listas del CRM (orígenes y motivos) y publica
la tarea «Contactar al prospecto»; la quinta le da a Ana el rol Comercial. Si `pnpm dev` estaba
encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. Registrar un prospecto

1. Entre con **Ana** en http://localhost:3000 → menú **Comercial** → **Prospectos** →
   **«Registrar prospecto»**.
2. Escriba un nombre inventado, un correo como `prueba@example.com`, qué necesita, el origen
   **Sitio web**, y llene la autorización (texto, finalidad, cómo y cuándo, y la casilla). Guarde.
3. Se abre la ficha con el código `LEA-2026-…`. Vaya a **Mis tareas**: está «Contactar a …».

### 3. Agendar una actividad y ver el recordatorio

1. En la ficha del prospecto, **«Agendar actividad»**: una llamada para dentro de **20 minutos**.
2. En un minuto llega el aviso a la campana (y a Mailpit, http://localhost:8025). Fuera del horario
   laboral el correo llega al empezar la jornada.
3. Comercial › **Actividades**: ahí está. **«Marcar hecha»** pide el resultado.

### 4. Calificar y convertir

1. En la ficha del prospecto, **«Calificar»** y confirme. En Mis tareas, la tarea quedó cerrada.
2. **«Convertir en oportunidad»**: título, valor (por ejemplo `25000000`) y fecha de cierre.
3. Se abre la oportunidad `OPO-2026-…` en **Prospección** con 10 %.

### 5. Mover por el embudo

1. Comercial (portada): la tarjeta está en **Prospección**. Arrástrela a **Propuesta**, o use
   **«Mover a» → Propuesta**. La probabilidad pasa a 50 % y el valor ponderado a la mitad.
2. Pulse **«Tabla»** para ver la misma información en filas.

### 6. Ganar y perder

1. En la ficha de la oportunidad pulse **«Marcar ganada»**. Como la persona no dio su cédula, la
   plataforma le pide registrarla en Terceros. Ábrala desde «Cliente», **Editar**, escriba tipo y
   número de documento, guarde y vuelva a **«Marcar ganada»**. En Terceros queda **activa y
   cliente**.
2. Registre otra oportunidad (Comercial › **«Registrar oportunidad»**, para una empresa de
   Terceros) y pulse **«Marcar perdida»**: sin motivo no deja; elija **Precio**.

### 7. El informe y la campaña

1. Comercial › **Informe del embudo**: verá las abiertas, la ganada, la perdida con su motivo y la
   tasa de cierre (50 %). **«Descargar RE-COM-001 (CSV)»** y ábralo en Excel.
2. Comercial › **Campañas** → **«Crear campaña»**; al registrar un prospecto, elíjala y verá que la
   campaña cuenta uno más.

## Pendientes

- **Formulario del sitio web:** que un formulario público cree el prospecto solo, su tarea y el
  acuse al visitante es del bloque **B41**. La pieza que ese bloque usará ya quedó lista.
- **Importación masiva de prospectos** desde CSV: no estaba en los entregables (recomendación 9).
- **Acta de revisión de requisitos (FT-COM-002)** antes de ganar: llega con los bloques siguientes;
  hoy se gana sin ella.
- **Mensajes a clientes y horarios de la Ley 2300:** este bloque no envía nada a los clientes; los
  recordatorios son internos.
- **Comentarios y adjuntos** en prospectos y oportunidades (como los de Terceros): no estaban en los
  entregables.
- **Evento de seguridad por cada «sin permiso»:** el anexo D lo pide para algunas acciones. Hoy la
  plataforma responde 403 pero **no** guarda un evento de seguridad por cada negación, en ningún
  módulo. Es un cambio de toda la plataforma; le propongo hacerlo en un bloque aparte.
- **El RE-COM-001 original:** no está en el repositorio; el informe usa las columnas que usted
  aprobó. Si aparece el archivo, se ajustan.

## Decisiones tomadas

Las nueve que usted aprobó el 22/10/2026:

1. **Prospecto sin documento.** Un tercero «prospecto» puede quedar sin cédula o NIT; se exige para
   volverlo activo o para ganarle una oportunidad. La base de datos también lo impide.
2. **RE-COM-001** con las columnas propuestas: código, fecha, cliente, oportunidad, etapa, valor,
   probabilidad, valor ponderado, fecha esperada, responsable, estado, motivo de pérdida y fecha de
   cierre.
3. **Cliente al ganar:** convertir solo crea la oportunidad; ganar deja al tercero activo y cliente.
4. **Motivos en listas editables** (Administración › Catálogos): de pérdida y de descarte. También
   los **orígenes** de los prospectos.
5. **Probabilidad por etapa:** 10, 25, 50, 75, 100 y 0 %, editable en cada oportunidad.
6. **Campañas sin permiso nuevo:** las ve quien ve prospectos y las administra quien los edita.
7. **Recordatorio 30 minutos antes**, en la campana y por correo. No es «urgente»: fuera de la
   jornada el correo llega al empezarla, por la ley de desconexión laboral.
8. **Tablero sin programas nuevos:** arrastrar es un atajo del ratón; «Mover a…» sirve con el
   teclado.
9. **Fuera de este bloque:** formulario del sitio (B41), importación, FT-COM-002 y Ley 2300.

Y otras que tomé al construir, sin cambiar lo aprobado:

- **`decimal.js`** (licencia MIT, mantenida) para que los pesos no pierdan centavos, como exige el
  proyecto. Es la única dependencia nueva.
- **El CSV** del informe usa el mismo formato del Listado Maestro (punto y coma, para Excel en
  Colombia); moví ese formato a una pieza común en lugar de copiarlo.
- **La tarea de contacto va al rol Comercial**, no a una persona: así la ve todo el equipo y
  funciona igual cuando el prospecto llegue del sitio web.
- **Las fechas de las campañas** se llaman `starts_on` y `ends_on` (el manual dice `starts_at` y
  `ends_at`), porque son fechas sin hora y así se nombran en el resto del proyecto.
