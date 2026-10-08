# Cierre del bloque B08: Identidad, cuentas, inicio de sesión y sesiones

- Fecha: 08/10/2026
- Rama: `feat/b08-identidad-cuentas-inicio-de-se`
- Estado: en revisión. **Bloque crítico: requiere revisión externa** antes de integrarlo, además
  de la aprobación del Director General.

## Qué se construyó

Desde este bloque, ARZA ONE sabe quién es cada persona. Se entra solo por invitación; nadie puede
registrarse por su cuenta. Usted aprobó cuatro decisiones antes de empezar (ver «Decisiones
tomadas»).

| Pieza                                 | Qué hace, en palabras sencillas                                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitación por comando                | `pnpm iam:invitar` crea la cuenta y el worker envía un correo con un enlace que sirve **una sola vez** y vence en **72 horas**. La pantalla de usuarios con su permiso llega en B10                                                          |
| Activar la cuenta                     | Desde el enlace, la persona escribe su nombre y elige su contraseña                                                                                                                                                                          |
| Iniciar y cerrar sesión               | Con correo y contraseña. La sesión vence a las **8 horas sin uso** o a las **12 horas** en total                                                                                                                                             |
| Contraseñas                           | Mínimo 12 caracteres, sin obligar a mezclar símbolos; se rechazan las **72 957 contraseñas filtradas** más comunes. Se guardan con Argon2id: ni nosotros podemos leerlas                                                                     |
| Espera y bloqueo                      | Tras cada intento fallido hay que esperar más (1, 2, 4 y 8 segundos). Al **quinto**, el acceso con ese correo queda **bloqueado 15 minutos**, se registra un evento de seguridad y queda la alerta lista para el aviso de B16                |
| El error no revela el correo          | Correo inexistente o contraseña equivocada reciben **el mismo mensaje**, tardan lo mismo y se bloquean igual                                                                                                                                 |
| Recuperar la contraseña               | Enlace de un solo uso de **30 minutos**. Al cambiarla se **cierran todas las sesiones** y llega un correo de aviso                                                                                                                           |
| Cambiar la contraseña desde el perfil | Pide la actual, **cierra todas las sesiones (también la de ese momento)** y avisa por correo                                                                                                                                                 |
| Protección contra peticiones falsas   | Toda operación que cambia datos exige un código secreto de la sesión y venir de nuestros propios dominios (protección CSRF)                                                                                                                  |
| Auditoría mínima                      | Cada operación deja un registro que **nadie puede modificar ni borrar**. B11 le agrega la cadena de verificación                                                                                                                             |
| Pantallas                             | Iniciar sesión, Activar cuenta, Recuperar contraseña, Crear contraseña nueva y Mi perfil. El menú del usuario muestra quién entró, «Mi perfil» y «Cerrar sesión». La aplicación y el portal piden iniciar sesión y luego vuelven a donde iba |
| Correos                               | Invitación, recuperación y aviso de cambio de contraseña, en español, con fechas en hora de Colombia                                                                                                                                         |

**Tablas nuevas:** `iam_users`, `iam_sessions`, `iam_tokens`, `iam_login_attempts`, `aud_events` y
`aud_security_events`, todas con la empresa (`tenant_id`) y la protección por fila. Diccionario en
[`docs/manual/datos/iam.md`](../manual/datos/iam.md). **Migración:** una
(`20261009000000_iam_identity_and_audit`). **Puntos de la API:** ocho bajo `/v1/auth` y `/v1/me`
(lista en [`apps/api/README.md`](../../apps/api/README.md)). **Bibliotecas nuevas:** ninguna. Argon2id
viene incluido en Node.js. La lista de contraseñas filtradas es un archivo de SecLists (licencia
MIT, [origen](../../apps/api/data/README.md)).

**Variables nuevas:** la API exige `CSRF_SECRET` (ya estaba en `.env.example` y `pnpm env:local` la
genera; el servidor de pruebas la crea con `generate-env.sh`). El worker exige `APP_URL` para los
enlaces de los correos.

### Problemas reales que las pruebas encontraron y se corrigieron

1. **El enlace de activación se perdía en el navegador real.** Al quitar la llave de la barra de
   direcciones, la página se volvía a montar y decía «El enlace no está completo». Ninguna prueba
   simulada lo vio; lo encontró la prueba real en el navegador. Ya está corregido y probado.
2. **Un clic antes de que la página termine de cargar** recargaba el formulario y se perdía lo
   escrito. Ahora el botón de enviar espera a que la página esté lista.
3. **Un aviso falso en la pantalla de inicio de sesión**: escribir `?motivo=toString` en la dirección
   habría mostrado un aviso vacío. Ahora solo se aceptan los motivos conocidos.

## Cómo se probó

- **Recorrido real completo en el navegador**, con base de datos, worker y bandeja de correo
  locales: invitar con el comando → llega el correo → activar la cuenta → iniciar sesión → la sesión
  se mantiene al recargar → Mi perfil con fechas en formato colombiano → cambiar la contraseña →
  se cerró la sesión → la contraseña anterior ya no sirve → llega el correo de aviso → entrar con
  la nueva lleva de vuelta a Mi perfil.
- `pnpm check` en este equipo: formato, análisis, tipos, fronteras y código sin uso en verde;
  **102 pruebas unitarias de la API**, 80 de la web, 34+ del worker y las de los paquetes;
  **115 pruebas con base de datos real de la API** y 13 del worker; compilación; **50 pruebas en
  navegador**; sin secretos. Una sola prueba, `apps/api/test/startup.test.ts` (de B02), falló por
  tiempo dos veces cuando corren todas a la vez; sola pasó 2 de 2. Es la misma lentitud de este
  equipo anotada desde B03; **no se modificó**. La integración continua de GitHub es la que decide
  (ver el pull request).
- Cobertura: API 96 % de líneas en pruebas unitarias y 98 % en pruebas con base de datos real; web 99 %.
- **Reloj de prueba:** las pruebas adelantan el tiempo para comprobar el bloqueo de 15 minutos, la
  inactividad de 8 horas, el total de 12 horas y el vencimiento de los enlaces, sin esperar.

| Criterio de aceptación                                  | Cómo se demuestra                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Las reglas del numeral 15.1 se cumplen y están probadas | Alta solo por invitación de 72 h (`invitation.int.test.ts`); contraseñas de 12+ sin composición, lista filtrada y Argon2id (`policies.test.ts`, `infrastructure.test.ts`); cookie HttpOnly, Secure, SameSite=Lax, 256 bits, solo huella, 8 h y 12 h (`login.int.test.ts`, `sessions.int.test.ts`); espera y bloqueo de 15 min al quinto (`login.int.test.ts`); recuperación de 30 min que cierra sesiones y avisa (`passwords.int.test.ts`) |
| El mensaje de error no revela si un correo existe       | `login.int.test.ts`: correo inexistente y contraseña equivocada dan el mismo código y mensaje; un correo sin cuenta se bloquea igual. `passwords.int.test.ts`: recuperar responde igual exista o no                                                                                                                                                                                                                                         |
| Cambiar la contraseña cierra todas las sesiones         | `passwords.int.test.ts`: dos sesiones abiertas quedan en cero, al restablecer y al cambiar desde el perfil (también la actual). Comprobado además en el navegador real                                                                                                                                                                                                                                                                      |
| `pnpm check` en verde                                   | Ver el pull request                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Permiso denegado, aislamiento y auditoría               | Ver la sección siguiente                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Documentación y cierre                                  | Este documento, [`iam.md`](../manual/datos/iam.md), las guías de [`apps/api`](../../apps/api/README.md), [`apps/web`](../../apps/web/README.md) y [`apps/worker`](../../apps/worker/README.md), y el OpenAPI regenerado                                                                                                                                                                                                                     |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** sin sesión, `/v1/me`, la sesión, la salida y el cambio de contraseña
  responden 401; sin el código antifalsificación, con el de otra sesión o desde otro sitio, 403 y
  nada cambia; una cuenta invitada, bloqueada o inactiva no entra; una cuenta desactivada pierde el
  acceso de inmediato; un enlace inventado, usado, vencido o de otro propósito no sirve. En la base,
  `app_user` no puede modificar ni borrar la auditoría, ni borrar cuentas o sesiones, ni escribir
  intentos sin la función, ni cambiar las funciones de búsqueda.
- **Aislamiento entre empresas** (`isolation-and-audit.int.test.ts`): dentro de la empresa A no se
  ve ninguna cuenta, sesión, intento ni auditoría de la B; A no puede crear cuentas en B; una persona
  de B solo ve su perfil; un enlace de A solo cambia la cuenta de A; un trabajo de correo con la
  empresa equivocada no encuentra la cuenta; sin empresa, `app_user` no ve ninguna fila.
- **Auditoría:** cada prueba de inicio de sesión, bloqueo, invitación, activación, recuperación y
  cambio de contraseña comprueba su registro. Las acciones registradas están en
  [`iam.md`](../manual/datos/iam.md).

## Cómo lo prueba usted, paso a paso

Necesita Docker Desktop abierto.

### 1. Preparar su equipo (una sola vez)

Su archivo `.env` es de antes de B06. En una terminal, en la carpeta del proyecto:

```bash
git switch feat/b08-identidad-cuentas-inicio-de-se
```

```bash
pnpm install
```

Cambie el nombre de su `.env` a `.env.anterior` (en PowerShell: `Rename-Item .env .env.anterior`) y
cree uno nuevo:

```bash
pnpm env:local
```

**Importante en su equipo:** usted tiene dos contenedores propios, `redis` y `mailpit`, que ocupan
los puertos 6379, 1025 y 8025. Abra el nuevo `.env` en un editor y cambie estos números (en las dos
direcciones `@localhost:6379` y en las líneas de abajo):

- `VALKEY_PORT=6380` y en `VALKEY_URL` cambie `:6379` por `:6380`
- `SMTP_PORT=1026`
- `MAILPIT_UI_PORT=8026`

Si `POSTGRES_PORT` quedó en 5432 y tiene encendido el PostgreSQL de Windows, cámbielo a 5434 y haga
lo mismo en `DATABASE_URL` y `DATABASE_MIGRATION_URL`.

### 2. Encender todo

```bash
pnpm infra:up
```

Al final dice «Entorno local listo»: ya aplicó la migración nueva y cargó las empresas ficticias.

```bash
pnpm dev
```

Espere a que la terminal se calme (un minuto o dos).

### 3. Invitarse a sí mismo

En **otra** terminal, en la carpeta del proyecto:

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez"
```

Debe decir «Invitación creada…». Use solo correos ficticios terminados en `.test`.

### 4. Abrir el correo y activar la cuenta

1. Abra la bandeja de prueba: http://localhost:8026 (o el número que puso en `MAILPIT_UI_PORT`).
2. Abra «Invitación a ARZA ONE» y haga clic en el enlace.
3. Fíjese: la dirección del navegador ya **no** muestra la llave.
4. Escriba su nombre y una contraseña. Pruebe primero con `123456789012`: debe decir que aparece en
   listas de contraseñas filtradas. Luego use una frase suya de 12 caracteres o más.
5. Al activar, llega a «Iniciar sesión» con el aviso «Su cuenta quedó activa».

### 5. Iniciar sesión y probar el bloqueo

1. Entre con su correo y contraseña: llega a la aplicación. En el menú del usuario (arriba a la
   derecha) verá su nombre.
2. Recargue la página: sigue dentro.
3. Cierre sesión desde el menú. Escriba una contraseña equivocada: «El correo o la contraseña no
   son correctos». Escriba un correo que no existe: **el mismo mensaje**.
4. Equivóquese cinco veces seguidas (esperando los segundos que le pida): al quinto verá que el
   acceso quedó bloqueado 15 minutos, **incluso con la contraseña correcta**.

### 6. Recuperar y cambiar la contraseña

1. En «Iniciar sesión», haga clic en «¿Olvidó su contraseña?», escriba su correo y envíe. Escriba
   también un correo que no existe: el mensaje es el mismo.
2. En la bandeja, abra «Recuperación de su contraseña» y cree una nueva. Llega también el correo
   «Su contraseña de ARZA ONE cambió». La recuperación levanta el bloqueo del paso anterior.
3. Entre y abra **Mi perfil** desde el menú del usuario. Abra la aplicación también en otra
   ventana (o en otro navegador) con la misma cuenta.
4. Cambie la contraseña desde Mi perfil: lo lleva a iniciar sesión. En la otra ventana, recargue:
   también le pide iniciar sesión. **Se cerraron todas las sesiones.**

### 7. Al terminar

Detenga `pnpm dev` con Ctrl + C y apague los servicios:

```bash
pnpm infra:down
```

## Pendientes

- **Segundo factor** (B09): hoy se entra solo con contraseña. La columna `mfa_required` ya existe.
  B09 también trae la pantalla «Sesiones activas» y el cierre de sesiones desde otro dispositivo.
- **Pantalla de usuarios y permisos** (B10): invitar, bloquear y desbloquear desde la aplicación,
  con el permiso `iam.user.invite`. Hasta entonces se invita con el comando.
- **Cadena de verificación de la auditoría, partición por mes y consulta** (B11).
- **Aviso de la alerta de bloqueo** al responsable técnico (B16): el evento ya queda en la bandeja
  de salida.
- **Retiro automático del colaborador** (numeral 15.1, «Retiro») llega con Talento humano (M12),
  que emite el evento `employee.terminated`. Una cuenta inactiva ya pierde el acceso de inmediato.
- **Llave foránea de «creado por» hacia `iam_users`** en todas las tablas. B03 la había anunciado para
  B08; se deja para cuando exista la administración de usuarios (B10), porque cambia todas las
  tablas y las pruebas de B03 que usan usuarios ficticios.
- **Conservar lo escrito si la sesión vence** en medio de un formulario (16.5): hoy se pide iniciar
  sesión de nuevo y luego vuelve a la pantalla. Con formularios largos (desde B12) se guardará el
  borrador.
- **Límite de correos de recuperación por cuenta**: hoy lo frena el límite de 10 por minuto por IP.
  Se puede agregar uno por cuenta si se ve abuso.
- **Inicio de sesión desde un dispositivo nuevo** (alerta del numeral 15.5): B09.
- **Revisión externa** del bloque (es crítico), antes de integrarlo.

## Decisiones tomadas

Aprobadas por usted antes de empezar:

1. **Invitación por comando** en B08; la pantalla con permisos, en B10. Así no se adelanta B10.
2. **Auditoría mínima ahora**: tablas de solo inserción con las columnas del manual; B11 las
   completa.
3. **Correo único en toda la plataforma**: para entrar basta el correo; quien trabaje para dos
   empresas usa un correo distinto en cada una.
4. **Lista de contraseñas filtradas de SecLists** (MIT), solo las de 12 caracteres o más.

Tomadas durante la construcción (técnicas, sin cambiar lo que usted ve):

5. **Cómo se sabe la empresa al entrar**: unas funciones muy estrechas de la base de datos solo
   dicen a qué usuario y empresa pertenece un correo, una sesión o un enlace. Todo lo demás pasa
   dentro de la empresa con la protección por fila. Ninguna devuelve datos personales.
6. **Intentos con correos que no existen**: se guardan sin empresa, para aplicarles la misma espera
   y el mismo bloqueo. Ninguna empresa puede verlos.
7. **Argon2id incluido en Node.js** en lugar de una biblioteca, con los parámetros mínimos de OWASP.
8. **El enlace del correo lleva la llave después de `#`**: los navegadores no envían esa parte al
   servidor, así que no queda en ningún registro.
9. **El worker crea el enlace al enviar el correo**: la llave nunca queda guardada en la cola.
10. **El código antifalsificación** se firma con `CSRF_SECRET` (anexo F). El origen se exige cuando el
    navegador lo informa, que es siempre en las operaciones que cambian datos.
11. **El portal y la aplicación interna comparten la pantalla de inicio de sesión**; cada persona
    llega a su superficie según el tipo de cuenta.
12. **Esperas en las pruebas**: este equipo es lento, así que se alinearon los tiempos máximos de
    la web con los de la API (20 s por prueba, 5 s para que aparezca una pantalla simulada, 10 s por
    verificación en el navegador). Ninguna verificación se quitó ni se suavizó. La primera corrida
    de las pruebas en navegador justo después de compilar puede fallar por tiempo en este equipo
    (Windows revisa los archivos recién creados); la segunda pasa, y en GitHub siempre pasa.

## Commits

Ver la lista en el pull request.
