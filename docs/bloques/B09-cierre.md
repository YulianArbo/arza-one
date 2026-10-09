# Cierre del bloque B09: Segundo factor y seguridad de sesión

- Fecha: 09/10/2026
- Rama: `feat/b09-segundo-factor-y-seguridad-de`
- Estado: en revisión. **Bloque crítico: requiere revisión externa** antes de integrarlo, además
  de la aprobación del Director General.

## Qué se construyó

Desde este bloque, la contraseña sola ya no basta para entrar a ARZA ONE: se pide también un código
de seis dígitos que muestra una aplicación del celular (Google Authenticator, Microsoft
Authenticator o similar). Usted aprobó cinco decisiones antes de empezar (ver «Decisiones
tomadas»).

| Pieza                                | Qué hace, en palabras sencillas                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrar en dos pasos                  | Primero la contraseña; después el código del celular. Entre los dos pasos hay **10 minutos**. Al completar el segundo paso la sesión recibe una llave nueva                                                                                                   |
| Configuración obligatoria            | Una persona interna sin segundo factor solo ve «Configurar el segundo factor»: escanea un código QR, escribe el primer código y recibe sus **10 códigos de recuperación**. **El servidor** le niega todo lo demás (no es solo la pantalla)                    |
| Códigos de recuperación              | Diez, de un solo uso, para entrar si pierde el celular. Se muestran una sola vez; se pueden copiar, descargar o imprimir, y hay que marcar «Guardé mis códigos» para seguir                                                                                   |
| Secreto cifrado                      | El secreto del celular se guarda cifrado con una llave que vive fuera de la base de datos (`FIELD_ENCRYPTION_KEY`). La base misma rechaza un secreto sin cifrar                                                                                               |
| Un código sirve una sola vez         | Aunque alguien vea el código en su pantalla, ya no le sirve                                                                                                                                                                                                   |
| Cinco códigos equivocados            | Igual que con la contraseña: al quinto en 15 minutos (sumando todas las sesiones de la persona) la cuenta se bloquea **15 minutos**, se cierran las sesiones a medias y queda una alerta grave                                                                |
| Sesiones activas                     | Nueva pantalla en Mi perfil: cada equipo con sesión abierta (navegador, sistema, dirección IP, cuándo entró y última actividad), con «Cerrar sesión» por equipo y «Cerrar todas las demás». **El cierre surte efecto en la siguiente petición de ese equipo** |
| «Confirme que es usted»              | Antes de una acción delicada, si pasaron más de **30 minutos** desde que demostró quién es, se piden contraseña y código. Aplica a: generar códigos nuevos, cambiar de celular y desactivar el segundo factor. Los bloques siguientes lo reutilizan           |
| Segundo factor en Mi perfil          | Estado (activo desde cuándo, códigos que quedan, si es obligatorio), «Generar códigos nuevos», «Cambiar de celular» y «Desactivar» (solo si es opcional)                                                                                                      |
| Dispositivo nuevo                    | El navegador guarda una marca al azar. Si la cuenta entra desde un equipo que no conocía, queda un evento de seguridad y llega un correo. El primer equipo de la cuenta no avisa (sería ruido)                                                                |
| Avisos por correo                    | Activó, cambió de celular, desactivó o le reiniciaron el segundo factor; generó códigos nuevos; usó un código de recuperación; entró desde un equipo nuevo. Fechas en hora de Colombia; nunca llevan códigos                                                  |
| Comandos para el responsable técnico | `pnpm iam:reiniciar-segundo-factor --correo …` para quien perdió el celular y los códigos; `pnpm iam:invitar … --exige-segundo-factor` para un administrador de cliente                                                                                       |

**Tablas nuevas:** `iam_mfa_factors`, `iam_recovery_codes` e `iam_known_devices`, con empresa
(`tenant_id`), protección por fila y sin permiso de borrar. `iam_sessions` gana tres columnas
(etapa del inicio, última confirmación de identidad y equipo). Diccionario en
[`docs/manual/datos/iam.md`](../manual/datos/iam.md). **Migración:** una
(`20261010000000_iam_second_factor_and_devices`). Las sesiones abiertas antes de ella
quedan «a medias»: la API solo les deja hacer el segundo paso, así que cada persona interna
configura su segundo factor antes de seguir.

**Puntos de la API:** nueve nuevos y tres que cambian (lista en
[`apps/api/README.md`](../../apps/api/README.md)). **Pantallas:** «Segundo factor», «Configurar el
segundo factor», «Sesiones activas», la sección de segundo factor en Mi perfil y la ventana
«Confirme que es usted».

**Bibliotecas nuevas (aprobadas):** `otpauth` 9.5 (MIT, la que nombra el manual en 9.1) para los
códigos, y `lean-qr` 2.7 (MIT, sin dependencias, actualizada en septiembre) para dibujar el QR en la
misma página: el secreto no se envía a ningún servicio externo. Descarté `qrcode` porque arrastra
dependencias viejas.

**Variable nueva:** la API exige `FIELD_ENCRYPTION_KEY`. En su equipo la crea `pnpm env:local`; en
el servidor de pruebas la crea `generate-env.sh`. **Un servidor ya creado necesita agregarla a
mano** (ver «Pendientes»).

### Problemas reales que se encontraron y se corrigieron

1. **Una debilidad en mi propio diseño (encontrada en la revisión).** El conteo de «cinco códigos
   equivocados» era por sesión: quien supiera la contraseña podía entrar de nuevo cada cuatro
   intentos y seguir probando sin bloquearse nunca. Ahora se cuenta por persona en todas sus
   sesiones, y al bloquear se cierran también sus sesiones a medias. Hay una prueba que lo
   demuestra.
2. **«9:21 a. m..»**: en Mi perfil la fecha quedaba con dos puntos. Lo vio el recorrido en el
   navegador real; ya está corregido y la prueba compara el texto exacto.
3. **«Si usted no hizo este cambio»** aparecía también en el aviso de un inicio de sesión nuevo o
   de un código usado, donde no encaja. Ahora dice «Si no fue usted».
4. **«Copiar» fallaba sin avisar** si el navegador niega el portapapeles. Ahora lo dice y sugiere
   descargar o imprimir.
5. **Cobertura por debajo del mínimo** (lo detectó `pnpm check`): los casos de uso nuevos que solo
   funcionan contra la base de datos se miden ahora con las pruebas de base real, como hizo B08 con
   los suyos (mismo umbral del 90 %), y agregué pruebas de los caminos de error de la web hasta
   pasar el 85 % de ramas. No se bajó ningún umbral.

## Cómo se probó

- **Recorrido real completo en el navegador**, con base de datos, worker y bandeja de correo
  locales (en una copia aparte del proyecto, con datos ficticios): invitar → activar → iniciar
  sesión → **la aplicación la llevó a «Configurar el segundo factor» y la API respondió 403 al
  pedir el perfil** → intentar abrir Mi perfil escribiendo la dirección la devolvió a la
  configuración → QR → **en la base, el secreto guardado empieza por `v1.` y no contiene la clave**
  → primer código → diez códigos → Mi perfil con «Activo desde…» → abrir una segunda sesión desde
  «otro equipo» (Android) → cerrarla desde «Sesiones activas» → **el otro equipo recibió 401 en su
  siguiente petición** → salir y entrar con un código de recuperación escrito en minúsculas y con
  espacios → llegaron los correos «Activó el segundo factor», «Nuevo inicio de sesión» y «Usó un
  código de recuperación (le quedan 9)».
- `pnpm check` en este equipo, **en verde en una sola corrida completa**: formato, análisis, tipos,
  fronteras y código sin uso; **151 pruebas unitarias de la API**, 120 de la web, 34 del worker y
  las de los paquetes; **178 pruebas con base de datos real de la API** y 13 del worker;
  compilación; **62 pruebas en navegador** (con accesibilidad WCAG 2.2 AA en modo claro y oscuro de
  las pantallas nuevas); sin secretos. En corridas anteriores falló una vez la prueba de arranque
  de B02 por tiempo (la lentitud de este equipo anotada desde B03; sola pasó 2 de 2) y otra vez la
  condición de carrera de «Pendientes»; ninguna se modificó.
- Cobertura: API 97 % de líneas en pruebas unitarias y 99 % en pruebas con base de datos real;
  web 98 % de líneas y 90 % de ramas; worker 100 %.
- **Reloj de prueba:** las pruebas adelantan el tiempo para comprobar los 10 minutos del segundo
  paso, los 15 de la configuración, los 30 de la confirmación de identidad y los 15 del bloqueo.
- **Vectores oficiales:** el cálculo de los códigos se comprueba con los ejemplos del estándar
  RFC 6238.

| Criterio de aceptación                                            | Cómo se demuestra                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un usuario interno sin segundo factor no pasa de la configuración | `second-factor-setup.int.test.ts`: con la contraseña solo recibe una sesión «a medias»; `/v1/me`, `/v1/me/sessions`, `/v1/me/mfa`, cambiar la contraseña y confirmar identidad responden 403; la sesión vence a los 10 minutos. `session-chain.test.ts` prueba la guarda. En la web, `session-provider.test.tsx` y `second-factor.spec.ts` (navegador). Comprobado además en el navegador real |
| El secreto TOTP se guarda cifrado                                 | `second-factor-setup.int.test.ts`: lee la columna directamente, no contiene el secreto, solo descifra con la llave y no descifra con el contexto de otra persona; la base rechaza un secreto sin cifrar. `field-cipher.test.ts`. Comprobado en la base real                                                                                                                                    |
| Cerrar una sesión desde otro dispositivo surte efecto inmediato   | `active-sessions.int.test.ts`: la sesión cerrada responde 401 en su siguiente petición y la actual sigue; «cerrar todas las demás» igual. Comprobado en el navegador real con un segundo equipo                                                                                                                                                                                                |
| `pnpm check` en verde                                             | Ver el pull request                                                                                                                                                                                                                                                                                                                                                                            |
| Permiso denegado, aislamiento y auditoría                         | Ver la sección siguiente                                                                                                                                                                                                                                                                                                                                                                       |
| Documentación y cierre                                            | Este documento, [`iam.md`](../manual/datos/iam.md), las guías de [`apps/api`](../../apps/api/README.md), [`apps/web`](../../apps/web/README.md), [`apps/worker`](../../apps/worker/README.md) y del [servidor de pruebas](../runbooks/servidor-de-pruebas.md), y el OpenAPI regenerado                                                                                                         |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** una sesión a medias recibe 403 en toda ruta que no sea del segundo paso;
  sin el código antifalsificación no se configura ni se cierra nada (403); una acción delicada sin
  confirmación reciente responde 403 y la contraseña sola no basta si hay segundo factor; un
  usuario interno no puede desactivarlo; quien ya tiene segundo factor no puede configurar otro
  desde una sesión a medias (409); un código usado o de recuperación gastado no sirve; sin sesión, 401. En la base, `app_user` no puede borrar factores, códigos ni dispositivos.
- **Aislamiento entre empresas:** la empresa A no ve factores, dispositivos, sesiones ni eventos de
  seguridad de la B (`isolation-and-audit.int.test.ts`); sin empresa, `app_user` no ve ninguna fila
  de las tablas nuevas; cerrar la sesión de otra persona de la misma empresa o de otra empresa
  responde **404** y esa sesión sigue abierta (`active-sessions.int.test.ts`); el secreto cifrado
  de una persona no descifra con el contexto de otra empresa.
- **Auditoría:** cada configuración, verificación (acierto y fallo), confirmación de identidad,
  cambio, desactivación, códigos nuevos, cierre de sesiones, bloqueo y reinicio deja su registro;
  las pruebas lo comprueban. Las acciones y los eventos de seguridad están en
  [`iam.md`](../manual/datos/iam.md).

## Cómo lo prueba usted, paso a paso

Necesita Docker Desktop abierto y **un celular con una aplicación de autenticación** (Google
Authenticator o Microsoft Authenticator, gratuitas).

### 1. Preparar su equipo

```bash
git switch feat/b09-segundo-factor-y-seguridad-de
```

```bash
pnpm install
```

Si ya rehízo su `.env` en B08, ábralo y confirme que la línea `FIELD_ENCRYPTION_KEY=` tiene un
valor largo (no `REEMPLAZAR`). Si dice `REEMPLAZAR` o su `.env` es de antes de B06, siga el paso 1
del [cierre de B08](B08-cierre.md) para crear uno nuevo con `pnpm env:local` (con los cambios de
puertos que allí se indican).

### 2. Encender todo

```bash
pnpm infra:up
```

```bash
pnpm dev
```

Espere a que la terminal se calme (un minuto o dos). Nota: al probar en una copia aparte borré los
datos ficticios locales, así que `pnpm infra:up` vuelve a crear las empresas de prueba y tendrá que
invitarse de nuevo.

### 3. Invitarse y activar la cuenta

En **otra** terminal:

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez"
```

Abra la bandeja de prueba (http://localhost:8026 o el número de su `MAILPIT_UI_PORT`), abra
«Invitación a ARZA ONE», haga clic en el enlace, escriba su nombre y una contraseña de 12 caracteres
o más.

### 4. Configurar el segundo factor (criterio 1)

1. Inicie sesión con el correo y la contraseña. **No llega a la aplicación**: llega a «Configurar
   el segundo factor».
2. Pruebe escribir en la barra de direcciones `http://localhost:3000/app/perfil`: lo devuelve a la
   configuración.
3. Haga clic en «Mostrar el código QR» y escanéelo con la aplicación del celular.
4. Escriba el código de seis dígitos que muestra el celular y haga clic en «Confirmar».
5. Aparecen sus **10 códigos de recuperación**. Pruebe «Descargar». El botón «Continuar» está
   apagado hasta que marque «Guardé mis códigos…». Márquelo y continúe.
6. En la bandeja de correo llegó «Activó el segundo factor en ARZA ONE».

### 5. Entrar con el código

1. Cierre sesión desde el menú del usuario (arriba a la derecha).
2. Inicie sesión: después de la contraseña le pide el código. Escriba un código **equivocado**: dice
   que no es correcto. Escriba el bueno: entra.
3. Abra **Mi perfil**: la sección «Segundo factor» dice desde cuándo está activo y que le quedan 10
   códigos. Como usuario interno, **no aparece «Desactivar»**.

### 6. Cerrar una sesión desde otro equipo (criterio 3)

1. Abra otro navegador (o una ventana privada) y entre con la misma cuenta y un código nuevo del
   celular. Llega el correo «Nuevo inicio de sesión en su cuenta de ARZA ONE».
2. En la primera ventana vaya a Mi perfil › «Ver sesiones activas». Verá las dos; la suya dice «Esta
   sesión».
3. En la otra, haga clic en «Cerrar sesión» y confirme.
4. Vuelva a la segunda ventana y recargue: **le pide iniciar sesión de nuevo**.

### 7. Entrar con un código de recuperación y confirmar su identidad

1. Cierre sesión. Inicie sesión y, en el código, haga clic en «No tengo el celular: usar un código
   de recuperación». Escriba uno de sus códigos: entra. Llega el correo «Usó un código de
   recuperación» con los que le quedan. Ese código ya no sirve una segunda vez.
2. La ventana «Confirme que es usted» aparece en las acciones delicadas cuando pasaron más de 30
   minutos desde que entró: si quiere verla, deje la aplicación abierta media hora y luego haga clic
   en «Generar códigos nuevos» en Mi perfil.

### 8. El secreto está cifrado (criterio 2), si quiere verlo con sus ojos

```bash
docker exec arza-one-local-postgres-1 psql -U postgres -d arza_one -c "select secret_encrypted from iam_mfa_factors"
```

Verá un texto que empieza por `v1.` y no se parece en nada a la clave que mostró la pantalla.

### 9. Al terminar

Detenga `pnpm dev` con Ctrl + C:

```bash
pnpm infra:down
```

## Pendientes

- **Servidor de pruebas:** si ya está creado, antes del próximo despliegue hay que agregar
  `FIELD_ENCRYPTION_KEY` a su archivo de secretos. El comando exacto está en la
  [guía del servidor](../runbooks/servidor-de-pruebas.md#variables-nuevas-de-cada-bloque). No toqué
  el servidor ni sus secretos.
- **Procedimiento para rotar `FIELD_ENCRYPTION_KEY`** (el anexo F lo pide). El formato ya guarda la
  versión de la llave (`v1.`) para permitirlo; falta el procedimiento. Hoy, cambiar la llave
  obligaría a reiniciar el segundo factor de todos.
- **Pantalla de usuarios** (B10): reiniciar el segundo factor de otra persona, cerrar sesiones
  ajenas y «cerrar todas las sesiones de la empresa» (numeral 15.7) necesitan permisos. Hasta
  entonces, el reinicio se hace con `pnpm iam:reiniciar-segundo-factor`.
- **Administradores de cliente** (B10): hoy se marcan a mano con `--exige-segundo-factor` al
  invitarlos; B10 lo hará según el rol.
- **Aviso de las alertas al responsable técnico** (B16): los eventos graves ya quedan en la bandeja
  de salida.
- **Pantallas de seguridad en el portal** (bloque del portal): las personas del portal ya usan
  «Segundo factor» y «Configurar el segundo factor», pero Mi perfil y Sesiones activas solo existen
  en la aplicación interna.
- **Primera configuración solo con la contraseña:** quien conoce la contraseña de una cuenta que
  todavía no ha configurado su segundo factor podría configurarlo con su propio celular. Es lo
  normal en estos sistemas y lo mitigan el correo «Activó el segundo factor» y la invitación de un
  solo uso; conviene que cada persona lo configure el mismo día que activa su cuenta.
- **Condición de carrera en `pnpm check`** (de antes de B09): la primera corrida falló porque dos
  tareas regeneraron a la vez el cliente de base de datos; la segunda pasó. No cambié la
  configuración de las tareas para no salirme del bloque; conviene revisarlo.
- **Revisión externa** del bloque (es crítico), antes de integrarlo.

## Decisiones tomadas

Aprobadas por usted antes de empezar:

1. **Bibliotecas** `otpauth` y una para el QR (resultó `lean-qr`, ver arriba).
2. **Obligatoriedad:** siempre para los internos (no se puede desactivar); en el portal, opcional
   salvo los marcados con `--exige-segundo-factor`, hasta que B10 lo decida por rol.
3. **Comando de reinicio** del segundo factor para el responsable técnico.
4. **Sin «recordar este equipo»:** el código se pide en cada inicio de sesión.
5. **Servidor de pruebas:** actualicé el guion y la configuración; agregar la variable al servidor
   existente queda en sus manos.

Tomadas durante la construcción (técnicas, sin cambiar lo que usted ve):

6. **Sesión «a medias»:** la contraseña correcta crea una sesión que solo atiende el segundo paso,
   y al completarlo cambia de llave. Así el servidor es la barrera, no la pantalla.
7. **Las sesiones abiertas antes de la migración quedan «a medias»**: no tienen la marca de inicio
   completo, así que la API solo les deja hacer el segundo paso. Un control del proyecto prohíbe
   desactivar la protección por fila en una migración, que era lo que exigía cerrarlas allí. Una
   persona del portal con sesión abierta verá una vez la configuración, hasta que esa sesión venza
   (12 horas como máximo).
8. **El conteo de códigos equivocados se lee de la auditoría** de la persona (ver «Problemas
   reales», punto 1), sin una tabla nueva.
9. **Se acepta el código anterior y el siguiente** (30 segundos antes o después) por diferencias de
   reloj del celular, pero cada código sirve una sola vez.
10. **Códigos de recuperación de 16 caracteres** (unos 79 bits) sin letras que se confunden (I, L,
    O, 0, 1); se aceptan en minúsculas, con espacios o sin guiones.
11. **El primer equipo de una cuenta no genera aviso** de dispositivo nuevo.
12. **Cambiar de celular o desactivar el segundo factor cierra las demás sesiones**, como cambiar
    la contraseña.
13. **«Confirme que es usted» pide contraseña y código** (o código de recuperación); falla igual que
    el segundo paso y cuenta para el bloqueo.

## Commits

Ver la lista en el pull request.
