# Cierre del bloque B12: Núcleo, organización, catálogos, consecutivos y parámetros

- Fecha: 10/10/2026
- Rama: `feat/b12-nucleo-organizacion-catalogos`
- Estado: en revisión. No es un bloque crítico: basta la aprobación del Director General.

## Qué se construyó

Desde este bloque, ARZA ONE tiene la **ficha base de la empresa**, sobre la que se apoyan todos
los módulos que vienen. Usted aprobó el plan completo; las decisiones están al final.

| Pieza                    | Qué hace, en palabras sencillas                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empresa                  | Razón social, nombre comercial y NIT, editables. Si otra persona los cambió mientras usted editaba, la plataforma se lo dice en vez de borrar el cambio del otro                                                                      |
| Sedes                    | Las oficinas de la empresa. Siempre hay una sola principal; la principal no se puede inactivar ni eliminar                                                                                                                            |
| Procesos, áreas y cargos | El mapa de procesos y los cargos, con quién depende de quién. **Ningún cargo puede quedar por encima de sí mismo** (por ejemplo, que el jefe le reporte a su subordinado)                                                             |
| Organigrama              | Una pantalla que muestra el árbol de cargos: cada cargo con su proceso y los cargos que le reportan                                                                                                                                   |
| Regla de no eliminar     | **Un cargo o proceso con registros asociados no se elimina: se inactiva.** Si intenta eliminarlo, la plataforma le dice por qué no se puede (tiene cargos, alguien lo ocupa, otros le reportan…)                                      |
| Centros de costo         | Con su código, que nunca se repite                                                                                                                                                                                                    |
| Catálogos                | Las listas desplegables de los formularios. Usted administra sus opciones; una opción usada no se borra, se inactiva. Viene cargada «Tipos de documento de identidad» (CC, CE, NIT, PA, TI, PPT)                                      |
| Consecutivos             | Los códigos legibles como `COT-2026-0001`. **Dos personas que piden un número al mismo tiempo reciben números distintos y seguidos**, y si una operación falla su número no se pierde. La numeración vuelve a 1 cada año              |
| Parámetros con vigencia  | Hoy, el horario laboral. **Un cambio nunca borra el valor anterior**: se programa con fecha de inicio y el anterior queda en el historial. La auditoría guarda el valor anterior y el nuevo. Lo protege también la base de datos      |
| Festivos y días hábiles  | Los festivos de Colombia de 2025 a 2030 (calculados con la ley, incluida Semana Santa) y una calculadora: «si algo llega tal día, ¿cuándo vencen 15 días hábiles?». Los módulos de PQRSF y datos personales la usarán para sus plazos |
| Pantallas                | Siete secciones nuevas en **Administración**: Empresa y sedes, Procesos y cargos, Centros de costo, Catálogos, Parámetros, Consecutivos y Festivos                                                                                    |

**Tablas nuevas:** sedes, procesos y áreas, cargos, centros de costo, catálogos y sus opciones,
consecutivos, parámetros y festivos. Todas separadas por empresa con la seguridad por fila.
Diccionario en [`core.md`](../manual/datos/core.md).

## Cómo se probó

| Prueba                   | Qué demuestra                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Días hábiles             | **22 casos con festivos calculados a mano** (Semana Santa, festivos que se corren al lunes, fin de año, el plazo de 15 días de la SIC, el de 10 de una PQRSF). El criterio pedía 20 |
| Festivos                 | Los 18 de 2026 coinciden con el calendario oficial; en 2025 dos festivos caen el mismo lunes y quedan como uno                                                                      |
| Consecutivos simultáneos | Una persona toma un número y se demora; la segunda espera y recibe el siguiente. Diez peticiones a la vez reciben 0001 a 0010 sin repetir ni saltar                                 |
| Consecutivo revertido    | Si la operación falla después de tomar el número, el siguiente sigue siendo 0001                                                                                                    |
| Parámetros               | La vigencia nueva conserva la anterior; no se puede programar en el pasado; la base de datos rechaza modificar una vigencia cerrada                                                 |
| Regla de no eliminar     | Un proceso con cargos, un cargo con subordinados y un cargo que alguien ocupa no se eliminan                                                                                        |
| Organigrama sembrado     | 10 procesos, 14 cargos y una sola cabeza: el Director General                                                                                                                       |
| Pantallas                | 26 pruebas de pantalla y, en un navegador real, las 7 pantallas sin fallas de accesibilidad en modo claro y oscuro                                                                  |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** un colaborador consulta la organización pero no puede crear sedes,
  procesos, festivos ni opciones, ni ver los consecutivos; un usuario del portal no ve nada.
- **Aislamiento:** la empresa B no ve ni toca las sedes, cargos, opciones de catálogo ni
  consecutivos de la empresa A, ni puede crear un cargo dentro de un proceso de A.
- **Auditoría:** las 20 rutas nuevas que escriben están en el recorrido de B11, que exige un
  evento por cada una. La pantalla de Auditoría las muestra en español.

### Resultado de `pnpm check`

En verde el 10/10/2026, con el equipo recién reiniciado y `pnpm dev` apagado:

| Paso                    | Resultado                                                           |
| ----------------------- | ------------------------------------------------------------------- |
| Formato, estilo y tipos | Sin problemas en las 12 partes del proyecto                         |
| Fronteras entre módulos | Sin problemas: el núcleo usa la identidad solo por su `index.ts`    |
| Código sin usar (knip)  | Sin problemas                                                       |
| Pruebas unitarias       | API 224, web 193, contratos 49, worker 35, interfaz 19, guiones 140 |
| Pruebas de integración  | API 368 en 36 archivos (46 nuevas del núcleo), worker 15            |
| Cobertura               | Por encima del 90 % que exige el capítulo 21                        |
| Pruebas en navegador    | 109, incluidas las 7 pantallas nuevas en modo claro y oscuro        |
| Búsqueda de secretos    | Ninguno                                                             |
| Migraciones             | Desde cero y repetidas sin cambios; la base coincide con el modelo  |

Antes de pasar hubo que reiniciar el equipo: con menos de 1 GB de memoria libre, las pruebas de
integración no alcanzaban a abrir la base de datos al arrancar (ver «Pendientes»).

## Cómo lo prueba usted, paso a paso

Usted ya tiene `pnpm dev` corriendo en una terminal. Si no, enciéndalo como en el cierre de B11
(pasos 1 y 2). Necesita entrar con una cuenta que tenga el rol ADMIN_PLATAFORMA (Ana, del cierre
anterior).

### 1. Cargar los datos nuevos

En **otra** terminal, en la carpeta del proyecto:

```bash
git switch feat/b12-nucleo-organizacion-catalogos
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La segunda crea las tablas nuevas; la tercera carga en cada empresa los festivos, el horario, el
catálogo de documentos y el organigrama provisional. Si `pnpm dev` estaba encendido, deténgalo
con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. Empresa y sedes

1. Entre en http://localhost:3000 con Ana y vaya a **Administración**. Verá siete tarjetas nuevas.
2. Abra **Empresa y sedes**. Cambie el nombre comercial y pulse «Guardar los datos»: aparece
   «Datos de la empresa guardados».
3. Pulse «Agregar una sede», llene nombre, ciudad y dirección y guarde. Como es la primera, queda
   como **Principal**. Agregue otra y márquela como principal: la primera deja de serlo.
4. Intente eliminar la principal: no aparece el botón. Elimine la otra: pide confirmación.

### 3. El organigrama (criterio «coincide con DC-SGC-001»)

1. Abra **Procesos, cargos y organigrama**. Arriba hay un aviso: **la estructura es provisional**.
2. Revise el árbol: el Director General arriba y debajo los cargos que le reportan.
   **Compárelo con su documento DC-SGC-001.** Lo que no coincida lo corrige ahí mismo con
   «Editar» (cambie a quién reporta, el proceso o el nombre) o «Agregar un cargo».
3. Pruebe la regla: en la tabla de cargos pulse «Eliminar» en «Director General». La plataforma
   responde que no se puede porque otros cargos le reportan, y le sugiere inactivarlo.
4. Pruebe el ciclo: edite «Director General» y en «Reporta a» elija «Desarrollador». Al guardar
   le dice que esa jerarquía no es posible.

### 4. Parámetros (criterio «valor anterior y nuevo»)

1. Abra **Parámetros**. Verá el horario de lunes a viernes, 8:00 a 12:00 y 13:00 a 17:00: 40
   horas.
2. Pulse «Programar un cambio», cambie la salida de la tarde a 16:00 y deje la fecha de mañana.
   Guarde. Ahora aparece «Cambio programado» y, en el historial, el horario actual termina hoy.
3. Vaya a **Auditoría**: verá «Cambió un parámetro» y, al abrirlo, el valor anterior y el nuevo.

### 5. Festivos y días hábiles

1. Abra **Festivos y días hábiles**: 2026 trae 18 festivos.
2. En la calculadora escriba la fecha 31/03/2026 y 2 días hábiles. Resultado: **lunes
   06/04/2026** (salta Jueves y Viernes Santo y el fin de semana).
3. Agregue un festivo el 15/09/2026, calcule desde el 14/09/2026 con 1 día: da el 16. Quítelo y
   vuelva a calcular: da el 15.

### 6. Consecutivos y catálogos

1. Abra **Consecutivos**, pulse «Agregar un consecutivo»: nombre «Cotizaciones», clave
   `crm.quote`, prefijo `COT`. La tabla muestra el siguiente código: `COT-2026-0001`. El número
   no se puede editar a mano.
2. Abra **Catálogos**, agregue una opción a «Tipos de documento de identidad» y luego edítela
   para inactivarla.

### 7. Quien no tiene permiso

Entre con una cuenta que solo tenga el rol COLABORADOR (Luis, si le quitó el rol de auditor). En el menú
no le aparece Administración. Si escribe la dirección `/app/administracion/procesos-y-cargos` ve el
organigrama, pero sin botones para cambiar nada. Si escribe la dirección
`/app/administracion/consecutivos`, ve «No tiene acceso a esta sección».

## Pendientes

- **Confirmar el organigrama con DC-SGC-001.** El documento no está en el repositorio; la
  estructura sembrada es provisional (cargos de los capítulos 3 y 15.2 del manual). Usted la
  corrige en la pantalla o me envía el documento y ajusto la semilla.
- **Logotipo de la empresa:** necesita el almacenamiento de archivos (B14).
- **Enlace de cada cargo a su manual de funciones:** llega con la gestión documental (M03).
- **Cálculo en horas hábiles** (vencimientos a mitad de jornada): con flujos y notificaciones (M04).
  Hoy el cálculo es por días.
- **Festivos después de 2030:** la semilla carga hasta 2030; antes de esa fecha hay que agregar
  los años siguientes (una línea en `core-seed-data.ts`).
- **Asignar el cargo a cada persona** desde la ficha del usuario: la columna y la regla existen;
  falta el campo en la pantalla de usuarios.
- **Memoria del equipo:** con `pnpm dev`, Docker y otros programas abiertos el equipo queda con
  menos de 1 GB libre, y las pruebas de integración no alcanzan a abrir la base de datos al
  arrancar (fallan antes de probar nada, también en archivos de bloques anteriores). Antes de
  `pnpm check` conviene apagar `pnpm dev`. No se cambió ninguna prueba ni límite.

## Decisiones tomadas

1. **Organigrama provisional** (opción B del plan): armado con el manual y marcado en pantalla.
2. **Horario laboral:** lunes a viernes, 8:00 a 12:00 y 13:00 a 17:00 (40 horas), vigente desde
   el 01/01/2026.
3. **Una vigencia nueva empieza hoy o más adelante, y después de la última registrada.** Así
   nadie reescribe el pasado. Consecuencia: un error de digitación en un cambio programado se
   corrige programando otro con fecha posterior.
4. **Catálogos:** las listas las crea el sistema; la empresa administra sus opciones.
5. **Festivos** calculados con la ley colombiana y editables por el administrador. Un año que ya
   tiene festivos no se recarga, para no deshacer lo que la empresa ajustó.
6. **Quién consulta qué:** en el plan dije que consultar catálogos y festivos pediría solo haber
   iniciado sesión. Al construirlo usé los permisos de lectura que ya existían
   (`core.parameter.read` y `core.org.read`), que tienen todos los roles internos. El resultado
   para las personas es el mismo, pero no hizo falta abrir una regla nueva de acceso, y los
   usuarios del portal quedan por fuera.
7. **Los códigos usados no se reciclan:** un proceso o centro de costo eliminado conserva su
   código, para que nunca haya dos registros históricos con el mismo código.
8. **Sin eventos de bandeja de salida:** el capítulo 13.3 no define eventos del núcleo ni
   consumidores; cada cambio sí deja su evento de auditoría.
9. Se movió la lectura de la versión del registro (`If-Match`) a la plataforma, para que el
   núcleo y la identidad usen la misma.

## Commits

| Commit    | Qué hizo                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| `7ae6396` | Contratos del núcleo; la lectura de `If-Match` pasa a la plataforma                 |
| `d9fa333` | Tablas nuevas con seguridad por fila, reglas y protección de las vigencias          |
| `237ac1c` | Festivos de Colombia, días hábiles y jerarquías sin ciclos, con sus pruebas         |
| `fb25dd7` | API del núcleo, semilla y pruebas de permiso, aislamiento, auditoría y consecutivos |
| `1d415e5` | Siete pantallas de administración, sus pruebas y las de navegador                   |
| `bdd0b41` | Diccionario de datos, README y OpenAPI                                              |
| `346b459` | Ajuste de tipos en una prueba de pantalla                                           |
| `7312c4e` | Funciones y datos de prueba que solo usa su archivo quedan privados                 |
