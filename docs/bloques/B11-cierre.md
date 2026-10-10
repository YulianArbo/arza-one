# Cierre del bloque B11: Auditoría y trazabilidad

- Fecha: 09/10/2026
- Rama: `feat/b11-auditoria-y-trazabilidad`
- Estado: en revisión. **Bloque crítico: requiere revisión externa** antes de integrarlo, además
  de la aprobación del Director General.

## Qué se construyó

Desde este bloque, ARZA ONE guarda **evidencia que no se puede alterar sin que se note** de todo lo
que pasa en la plataforma, y la muestra a quien tiene permiso. Usted aprobó cinco decisiones antes
de empezar (ver «Decisiones tomadas»).

| Pieza                              | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sello encadenado                   | Cada evento lleva un «sello» (una huella SHA-256) calculado con todo su contenido y con el sello del evento anterior de la misma empresa. Si alguien cambia o borra un evento, los sellos dejan de coincidir. **El sello lo pone la base de datos**, no el programa: aunque el programa tuviera un error, no podría falsificarlo |
| Solo inserción                     | El usuario con el que trabaja la aplicación puede leer y agregar eventos, **nunca modificarlos ni borrarlos**. Lo impide la base de datos                                                                                                                                                                                        |
| Tabla por meses                    | Los eventos se guardan en una «partición» por mes. Así la tabla aguanta los diez años que se conservan sin volverse lenta. Hay una partición de reserva para que nunca se pierda un evento                                                                                                                                       |
| Nada se escribe sin dejar huella   | **Antes de confirmar cualquier cambio, la plataforma revisa que haya dejado su evento de auditoría. Si no, deshace el cambio.** Solo hay una excepción, escrita con su motivo: la hora de la última actividad de la sesión                                                                                                       |
| Recorrido de escrituras            | **Una prueba toma la lista de todos los puntos de la API que escriben (hoy 29), los llama uno por uno y falla si alguno no dejó su evento.** Si mañana alguien agrega un punto nuevo sin esta prueba, también falla                                                                                                              |
| Valor anterior y nuevo             | Los cambios guardan «antes → después». En los campos restringidos (por ejemplo, una cuenta bancaria) solo se anota que cambió, nunca el valor                                                                                                                                                                                    |
| Consultar también queda registrado | Ver la auditoría, un historial, los eventos de seguridad o las exportaciones, exportar y verificar dejan su propio evento                                                                                                                                                                                                        |
| Pantallas                          | Un módulo nuevo en el menú, **Auditoría**, con cuatro secciones: Consulta de eventos (con filtros por fechas, acción y resultado), Eventos de seguridad, Exportaciones y Verificación de integridad                                                                                                                              |
| Historial en cada ficha            | Un componente reutilizable, «Historial», que muestra todo lo que le ha pasado a un registro. Ya está en la ficha de cada usuario y de cada rol; los módulos que vienen lo usarán igual                                                                                                                                           |
| Exportación                        | El auditor descarga un archivo CSV con los eventos filtrados (máximo 10.000). Pide confirmar la identidad y queda registrada en Exportaciones. El archivo está protegido contra «fórmulas» que se ejecutarían al abrirlo en Excel                                                                                                |
| Verificación diaria                | Todos los días a las 3:00 a. m. el worker revisa los sellos de cada empresa y crea las particiones de los meses siguientes. **Si encuentra una alteración, registra un evento de seguridad crítico** y el trabajo termina en «fallido» para que la alerta de trabajos fallidos avise                                             |

**Tablas:** `aud_events` se rehízo particionada y con sellos (los eventos de B08 a B10 se copian y
se sellan en orden al aplicar la migración). Nuevas: `aud_chain_heads` (el último sello de cada
empresa) y `aud_exports` (las exportaciones). Diccionario en [`aud.md`](../manual/datos/aud.md).
**Migración:** una (`20261012000000_aud_hash_chain_and_partitions`).

**Puntos de la API:** seis nuevos (lista en [`apps/api/README.md`](../../apps/api/README.md)):
consulta de eventos, historial de un registro, eventos de seguridad, lista de exportaciones,
exportar y verificar la cadena.

**Sin bibliotecas nuevas.** El sello usa la función `sha256` que trae PostgreSQL.

### Problemas reales que se encontraron y se corrigieron

1. **Reenviar una invitación no dejaba registro.** El recorrido de escrituras lo encontró: el
   botón «Reenviar la invitación» solo ponía el correo en la cola, sin escribir nada en la base, así
   que no quedaba **quién** la reenvió. Ahora deja su evento. Si el correo no se puede encolar, el
   evento tampoco queda.
2. **Editar un rol desde su navegador fallaba en su equipo** (venía de B10). En su equipo la web
   y la API tienen direcciones distintas, y la API no autorizaba la cabecera que lleva la versión
   del rol (`If-Match`): el navegador bloqueaba el cambio. Las pruebas no lo veían porque simulan la
   API. Lo corregí, y de paso la web ya puede leer el código para soporte de cada error y el nombre
   del archivo exportado.
3. **La semilla de datos se detenía con la garantía nueva.** Lo encontré al encender la plataforma
   completa, como la encenderá usted: la sincronización de los roles del sistema **reescribía cada
   rol en cada ejecución** sin dejar evento, y la carga del catálogo de permisos tampoco dejaba
   evento. Las pruebas no lo veían porque ejecutaban la semilla con la conexión de preparación de
   datos, que no exige la auditoría. Ahora los roles solo se escriben si cambian, todo cambio deja
   su evento, y en las pruebas el código real (semilla, comandos y correos) corre siempre con la
   conexión que exige la auditoría, como en producción. Al cambiar eso apareció otro caso: el
   comando `pnpm iam:asignar-rol` con un rol inexistente; también quedó corregido.
4. **Textos de la pantalla:** varias acciones y tipos de eventos de seguridad no tenían su texto
   en español, el mensaje de alteración tenía un doble punto y «filtros vacíos» se veía como `{}`.
   Ya están corregidos.

## Cómo se probó

| Prueba                              | Qué comprueba                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorrido de escrituras (29 puntos) | Cada punto que escribe deja un evento con el identificador de esa misma petición                                                                                                                                                                                                                                                                                                                                                                                             |
| Garantía en cada transacción        | Una escritura sin evento se deshace; con evento se guarda; una consulta no lo necesita; la excepción declarada funciona                                                                                                                                                                                                                                                                                                                                                      |
| Cadena (13 pruebas)                 | Los eventos quedan en orden (1, 2, 3…) y cada uno apunta al anterior. El programa no puede elegir el sello ni el lugar. La aplicación no puede modificar, borrar, vaciar ni entrar directo a una partición, ni tocar el último sello, las exportaciones o los eventos de seguridad                                                                                                                                                                                           |
| Alterar una fila                    | Con el usuario dueño de la base: cambiar un evento, borrar uno del medio, borrar el último y cambiar uno recalculando su sello. **Las cuatro hacen fallar la verificación**, cada una con su motivo                                                                                                                                                                                                                                                                          |
| Consulta, historial y seguridad     | Orden, filtros, páginas sin repetir ni saltar eventos, «antes → después», y que cada consulta quede registrada con sus filtros                                                                                                                                                                                                                                                                                                                                               |
| Exportación y verificación          | El CSV, su registro en Exportaciones y en la auditoría; que pida confirmar la identidad; la verificación íntegra y la alterada (con su evento de seguridad crítico); el trabajo diario                                                                                                                                                                                                                                                                                       |
| Worker                              | El trabajo queda programado a las 3:00 a. m., hora de Bogotá, y verifica cada empresa                                                                                                                                                                                                                                                                                                                                                                                        |
| Pantallas                           | Textos en español, fechas en hora de Colombia, filtros, descarga, historial solo con permiso, verificación íntegra y alterada. En un navegador real: accesibilidad en modo claro y oscuro de las cuatro pantallas, el menú y «Sin permiso»                                                                                                                                                                                                                                   |
| Ensayo en la plataforma real        | Encendí base de datos, colas, API, worker y web en una copia aparte de su equipo y recorrí con un navegador los pasos de la sección siguiente: activar la cuenta, configurar el segundo factor, ver la auditoría, crear y editar un rol y ver su historial, exportar, verificar, alterar un evento, ver que se detecta y deshacerlo. Así encontré los problemas 3 y 4, y confirmé en el navegador la corrección del 2. Al terminar apagué todo y borré esa copia y sus datos |
| Migración                           | Aplicada desde cero (prueba automática) y **sobre la versión de B10 con 60 eventos de dos empresas** (ensayo en una base desechable): no se perdió ninguno, quedaron repartidos por mes, las dos cadenas verificaron íntegras y una alteración y un borrado se detectaron                                                                                                                                                                                                    |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** un colaborador recibe 403 en los seis puntos nuevos. Quien lee la auditoría
  (por ejemplo, el administrador) no puede exportarla: solo el auditor.
- **Aislamiento:** el administrador de la empresa B no ve ningún evento de la A, el historial de
  una persona de A le sale vacío y su verificación solo revisa los eventos de B.
- **Auditoría:** el recorrido de escrituras, más las pruebas de que consultar, exportar y verificar
  quedan registrados.

### Resultado de `pnpm check`

**No quedó en verde de corrido en su equipo, por una sola prueba que no es de este bloque.** Corrí
`pnpm check` completo cinco veces. Todas las etapas pasan (formato, tipos, analizador, límites
entre módulos, código sin usar, compilación, secretos) salvo la prueba de arranque de la API de
B02, que en cuatro de las cinco corridas no alcanzó a ver la API encendida en sus 18 segundos de
espera, mientras el equipo corría en paralelo las pruebas de todos los paquetes. Sola pasa siempre.
Medí el arranque con y sin este bloque y tarda lo mismo (unos 5 a 7 segundos con el equipo
tranquilo). No la cambié: darle más tiempo es una decisión suya (ver «Pendientes»).

Resultado de cada etapa en la última versión del código:

| Etapa                                                              | Resultado                                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Formato, tipos, analizador, límites entre módulos, código sin usar | Pasan                                                                                              |
| Pruebas unitarias                                                  | 613 de 614 pasan; la que falta es la de arranque de la API cuando corre junto con todo (sola pasa) |
| Pruebas de integración (base de datos y colas reales)              | 337 pasan (322 de la API y 15 del worker)                                                          |
| Compilación                                                        | Pasa                                                                                               |
| Pruebas en navegador (Playwright)                                  | 91 pasan                                                                                           |
| Búsqueda de secretos                                               | Sin hallazgos                                                                                      |

Dos corridas tuvieron además fallas de lectura del disco de Windows («UNKNOWN: unknown error» al
abrir un archivo), que desaparecieron al repetir. La revisión automática de GitHub corre en Linux
y dirá si allí todo pasa.

## Cómo lo prueba usted, paso a paso

Necesita Docker Desktop abierto y el celular con su aplicación de autenticación. En su equipo no
hay datos locales guardados, así que todo empieza desde cero: va a crear a Ana (administradora) y
a Luis (que hará de auditor).

### 1. Preparar y encender

```bash
git switch feat/b11-auditoria-y-trazabilidad
```

```bash
pnpm install
```

**Su archivo `.env` todavía es de antes de B06** (le faltan las contraseñas y los puertos del
entorno local), así que `pnpm infra:up` no arrancaría con él. Rehágalo como en el cierre de B08:
cambie su nombre a `.env.anterior` (en PowerShell: `Rename-Item .env .env.anterior`) y ejecute:

```bash
pnpm env:local
```

Luego abra el `.env` nuevo en un editor. Usted tiene dos contenedores propios, `valkey` y
`mailpit`, en los puertos 6379, 1025 y 8025, y `pnpm env:local` no los detecta. Cambie
`VALKEY_PORT=6380` (y en `VALKEY_URL`, `:6379` por `:6380`), `SMTP_PORT=1026` y
`MAILPIT_UI_PORT=8026`. Su PostgreSQL de Windows sí lo detecta: la base de datos local quedará en
el 5433.

```bash
pnpm infra:up
```

```bash
pnpm dev
```

Espere a que la terminal se calme (un minuto o dos).

### 2. Crear a Ana como administradora

En **otra** terminal:

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez"
```

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol ADMIN_PLATAFORMA
```

Abra la bandeja de prueba (http://localhost:8026, el número de su `MAILPIT_UI_PORT`), abra
«Invitación a ARZA ONE», active la cuenta, inicie sesión en http://localhost:3000 y configure el
segundo factor.

### 3. La auditoría ya registró todo lo que hizo

1. En el menú aparece **Auditoría**. Ábrala: verá, de lo más reciente a lo más antiguo, lo que
   acaba de pasar, en palabras: «Inició sesión», «Activó el segundo factor», «Activó su cuenta»,
   «Asignó un rol» (a nombre de «El sistema», porque lo hizo el comando), «Invitó a una persona»…
   Cada fila dice quién, cuándo (hora de Colombia) y qué cambió.
2. Recargue la página: aparece arriba **«Consultó la auditoría»**. Consultar también queda
   registrado.
3. Pruebe los filtros: en «Acción» escriba `iam.role` y pulse Buscar; solo quedan los eventos de
   roles. Pruebe también las fechas «Desde» y «Hasta».
4. No ve el botón «Exportar a CSV»: exportar es solo del auditor.

### 4. El historial de una ficha

1. Administración › Roles y permisos › «Crear un rol personalizado»: nombre «Apoyo comercial»,
   marque cualquier permiso y créelo.
2. En la ficha del rol, cambie la descripción y guarde.
3. Baje hasta **Historial**: «Editó un rol» con la descripción «vacío → …» y debajo «Creó un rol».
4. Abra su propia ficha en Usuarios: su historial muestra la invitación, la activación y la
   asignación del rol.

### 5. Luis como auditor, y la exportación

En la otra terminal (cambie la fecha por una de las próximas semanas, en formato dd/mm/aaaa):

```bash
pnpm iam:invitar --empresa demo-uno --correo luis@demo-uno.test --nombre "Luis Gómez"
```

```bash
pnpm iam:asignar-rol --correo luis@demo-uno.test --rol AUDITOR --vence 31/10/2026
```

1. En una **ventana privada** del navegador, active la cuenta de Luis con el correo que le llegó y
   configure su segundo factor.
2. Como Luis, abra **Auditoría** y pulse **«Exportar a CSV»**: se descarga un archivo
   `auditoria-….csv`. Ábralo en Excel: una fila por evento, con su sello al final. La fecha y la
   hora del nombre del archivo y de la columna `fecha_utc` van en hora universal (5 horas más que
   en Colombia), como se guardan en la base de datos.
3. Abra **Exportaciones**: dice que Luis exportó, cuándo y cuántos eventos.
4. Como Ana (en la otra ventana), abra Auditoría: aparece «Exportó la auditoría» a nombre de Luis.

### 6. La verificación detecta una alteración (criterio «alterar una fila»)

1. Como Ana, abra **Auditoría › Verificación de integridad** y pulse **«Verificar ahora»**: «La
   auditoría está íntegra», con cuántos eventos revisó.
2. Ahora simule a alguien que entra al servidor y cambia un evento a escondidas. En la terminal:

   ```bash
   docker exec arza-one-local-postgres-1 psql -U postgres -d arza_one -c "UPDATE aud_events SET action = action || '.x' WHERE tenant_id = '01999a00-0000-7000-8000-0000000000d1' AND seq = 3"
   ```

   Debe responder `UPDATE 1`. (La aplicación no podría hacerlo; aquí se usa el usuario
   administrador de la base de datos, que solo existe en el servidor).

3. Pulse otra vez **«Verificar ahora»**: **«La auditoría fue alterada»**, «Un evento fue modificado
   después de registrarse», en el número 3.
4. Abra **Eventos de seguridad**: aparece «La auditoría fue alterada», con gravedad **Crítica**.
5. Deshaga la alteración para dejar sus datos como estaban:

   ```bash
   docker exec arza-one-local-postgres-1 psql -U postgres -d arza_one -c "UPDATE aud_events SET action = left(action, -2) WHERE tenant_id = '01999a00-0000-7000-8000-0000000000d1' AND seq = 3 AND action LIKE '%.x'"
   ```

   Verifique de nuevo: vuelve a estar íntegra, porque el evento quedó exactamente como era. El
   evento de seguridad de la alteración **sigue ahí**: eso no se borra.

### 7. Quien no tiene permiso no la ve

En otra ventana privada, invite a una tercera persona sin roles adicionales (por ejemplo
`pedro@demo-uno.test`), active su cuenta y entre: **no ve Auditoría en el menú**. Si escribe
`http://localhost:3000/app/auditoria`, ve «No tiene acceso a esta sección», sin ningún dato.

### 8. Al terminar

Detenga `pnpm dev` con Ctrl + C:

```bash
pnpm infra:down
```

## Pendientes

- **Revisión externa** del bloque (es crítico), antes de integrarlo.
- **Copia diaria del último sello fuera del servidor** (numeral 15.5). Usted aprobó dejarla
  pendiente: necesita un destino externo que todavía no existe. Sin esa copia, alguien con control
  total del servidor podría reescribir **todos** los eventos y todos los sellos a la vez sin que la
  verificación lo note; la copia externa es la que lo delataría. El trabajo diario ya calcula el
  valor que habría que copiar (el último sello de cada empresa, en `aud_chain_heads`).
- **Exportación en segundo plano, con archivo guardado** (numeral 13.2). Hoy se descarga en el
  acto, con un máximo de 10.000 eventos; se pasa a segundo plano cuando exista el servicio de
  archivos (B14), y entonces `aud_exports.file_id` dejará de estar vacío.
- **Exportar el informe de revisión de accesos a hoja de cálculo** (pendiente de B10): B11 deja
  la exportación de la auditoría; la del informe se hará igual cuando se haga la exportación en
  segundo plano (B14).
- **Historial para quien no lee la auditoría.** Hoy el historial de una ficha exige el permiso
  `audit.event.read` (Dirección, Administrador, Calidad, Oficial de datos y Auditor). Cuando
  lleguen los módulos de negocio, conviene decidir si quien puede ver un registro ve también su
  historial; es una decisión suya.
- **Cada módulo nuevo** debe registrar sus eventos con «antes → después», marcar sus campos
  restringidos y agregar sus rutas al recorrido de escrituras (instrucciones en
  [`apps/api/README.md`](../../apps/api/README.md)). La prueba falla si se olvida.
- **Escrituras muy simultáneas en una misma empresa** esperan su turno para sellar su evento: el
  sello de cada evento depende del anterior. Para el tamaño de ARZA TECH no se nota. Si algún día
  se volviera lento, se puede sellar en lote, en segundo plano.
- **Decisión suya: la prueba de arranque de la API.** Falla en `pnpm check` por la carga del equipo
  (ver «Resultado de `pnpm check`»). Hay dos salidas: darle más tiempo de espera (como se hizo en
  B05, que la subió de 10 a 18 segundos) o correr las pruebas de los paquetes de a uno. Ninguna
  cambia lo que la prueba comprueba, pero no la toqué sin su visto bueno.

## Decisiones tomadas

Aprobadas por usted antes de empezar:

1. **Exportación inmediata en CSV**, máximo 10.000 eventos, registrada en `aud_exports`; en
   segundo plano desde B14.
2. **La copia del último sello fuera del servidor queda pendiente.**
3. **Los eventos de seguridad no llevan sello**; quedan de solo inserción, como ya estaban.
4. **Nada se borra:** sin borrado automático; las particiones de cada mes se crean solas.
5. **Revisión externa** antes de integrar.

Tomadas durante la construcción (técnicas, sin cambiar lo que usted ve, salvo donde se dice):

6. **El sello lo calcula la base de datos** (un disparador), no la aplicación: así no se puede
   falsificar ni olvidar, venga el evento de donde venga.
7. **La garantía «nada sin evento» revisa cada transacción** antes de confirmarla, en vez de
   confiar solo en las pruebas: también protege a los comandos, la semilla y el worker.
8. **Las pruebas pueden preparar datos sin evento** con una conexión aparte, marcada para eso. La
   aplicación que se prueba siempre exige el evento.
9. **La semilla registra la creación de cada empresa** («Creó la empresa»), porque también es una
   escritura.
10. **Exportar pide confirmar la identidad**, como las demás acciones sensibles (cambia lo que
    usted ve: aparece «Confirme que es usted» si pasaron más de 30 minutos desde que entró).
11. **Ver el historial de un registro no se anota en el historial de ese registro**, sino como una
    consulta de la auditoría: si no, cada vez que alguien lo mirara aparecería una línea nueva.
12. **La verificación diaria corre a las 3:00 a. m.**, hora de Colombia, cuando nadie trabaja.
13. **Auditoría es un módulo propio en el menú**, con sus cuatro secciones como enlaces arriba
    (cambia lo que usted ve).

## Commits

Ver la lista en el pull request.
