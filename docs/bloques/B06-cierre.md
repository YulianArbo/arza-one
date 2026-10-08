# Cierre del bloque B06: Entorno local completo

- Fecha: 08/10/2026
- Rama: `feat/b06-entorno-local-completo`
- Estado: en revisión. Pendiente de la aprobación del Director General (no es un bloque crítico:
  no requiere revisión externa).

## Qué se construyó

Hasta B05, para trabajar había que encender la base de datos con un comando largo, y faltaban
cinco piezas: las colas, los archivos, los PDF, el antivirus y el correo de prueba. Desde B06,
cuatro comandos dejan todo funcionando en cualquier equipo con Docker Desktop:

| Comando            | Qué hace, en palabras sencillas                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:local`   | Crea el archivo `.env` con contraseñas al azar que solo sirven en su equipo. Si un puerto está ocupado, escoge otro y le avisa        |
| `pnpm infra:up`    | Enciende las seis piezas en Docker, prepara el almacenamiento de archivos y carga los datos ficticios (incluidas Demo Uno y Demo Dos) |
| `pnpm dev`         | Enciende la API, el **worker** y la web. Al guardar un cambio, la API y el worker se reinician solos                                  |
| `pnpm job:ejemplo` | Pide el trabajo de ejemplo: el worker envía un correo de prueba que usted ve en el navegador                                          |

Y además: `pnpm infra:down` (apaga sin borrar), `pnpm infra:reset` (borra los datos ficticios y
empieza de cero) y `pnpm infra:status` (estado de cada pieza).

| Pieza                          | Qué hace                                                                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker Compose local           | [`infra/compose/local.yml`](../../infra/compose/local.yml): PostgreSQL, Valkey, Garage, Gotenberg, ClamAV y Mailpit. Solo escuchan en su equipo, con límite de memoria, reinicio automático, verificación de salud y versiones fijadas |
| **Worker** (`apps/worker`)     | El programa que hace las tareas lentas en segundo plano, con NestJS y BullMQ. Usa la misma conexión limitada a la base de datos que la API y fija la empresa de cada trabajo (seguridad por fila)                                      |
| Trabajo de ejemplo             | Lee el nombre de la empresa y envía un correo de prueba a Mailpit. Si el correo falla, **se reintenta solo**: 6 intentos con esperas de 5, 10, 20, 40 y 80 segundos                                                                    |
| Latido del worker              | Cada 15 segundos el worker deja una señal en Valkey. La imagen Docker del worker se declara enferma si la señal tiene más de 45 segundos (numeral 10.3)                                                                                |
| Límite de peticiones en Valkey | Pendiente de B02. La cuenta de peticiones por dirección ya no vive en la memoria de la API: sobrevive a un reinicio y la comparten todas las copias de la API                                                                          |
| Imagen Docker del worker       | Pendiente de B05. Sin privilegios, sin gestores de paquetes, con verificación de salud. Trivy la analiza en cada cambio: **cero** vulnerabilidades altas o críticas                                                                    |
| Guía de operación              | [`docs/runbooks/entorno-local.md`](../runbooks/entorno-local.md): piezas, comandos y problemas frecuentes                                                                                                                              |

**Tablas nuevas:** ninguna. **Migraciones:** ninguna. **Puntos de la API nuevos:** ninguno. Con
este bloque, `/health` responde por primera vez «ok», con la base de datos, las colas y los
archivos en `up`.

**Bibliotecas nuevas** (aprobadas en el plan): `bullmq` (MIT, colas), `nodemailer` (MIT-0,
correo) y `testcontainers` (MIT, piezas desechables para las pruebas). El worker también usa
`ioredis`, `uuid` y `pg`, que el proyecto ya tenía.

### Problemas reales que se encontraron y corrigieron

Al seguir el README en una copia limpia del proyecto aparecieron cinco problemas. Ninguno se notaba
en el equipo de trabajo:

1. **El puerto 5432 estaba ocupado** por el PostgreSQL instalado en Windows. Ahora `pnpm env:local`
   detecta los puertos ocupados y escoge otros.
2. **`pnpm db:seed` (de B03) fallaba en un equipo nuevo**: compilaba la API sin compilar antes los
   paquetes compartidos. Corregido.
3. **El antivirus tarda unos 6 minutos en arrancar** cada vez. `infra:up` ya no lo espera: lo
   enciende y él termina solo. Nada lo usa hasta B14.
4. **La recarga automática reiniciaba el worker sin motivo** en Windows, incluso a mitad de un
   trabajo. El trabajo no se perdió: BullMQ lo recuperó solo un minuto después. Se corrigió la causa.
5. **El worker no lograba apagarse si Valkey rechazaba la conexión.** Lo descubrió una prueba nueva.
   Ahora espera los trabajos en curso hasta 25 segundos y se apaga igual.

## Cómo se probó

- `pnpm check` en verde: formato, análisis, tipos, fronteras, código sin uso, **247 pruebas
  unitarias**, **58 pruebas con piezas reales** (46 de la API y 12 del worker), compilación,
  **33 pruebas en navegador** y secretos.
- Cobertura: worker 100 % (unitarias y de integración); guiones locales 100 % de líneas; API sobre
  el umbral del 90 %.
- **Copia limpia siguiendo solo el README**, dos veces: `pnpm install`, `pnpm env:local`,
  `pnpm infra:up` (2 minutos 18 segundos en total, con imágenes ya descargadas), `pnpm dev` y
  `pnpm job:ejemplo`. La pantalla «Estado del sistema» dijo «Todo funciona» y el correo llegó a
  Mailpit.
- **Reintento en vivo**: con Mailpit apagado, el trabajo falló dos veces («Trabajo fallido; se
  reintentará»). Al encender Mailpit, el tercer intento entregó el correo.
- **Recarga automática**: al guardar un cambio en la API y en el worker, ambos se reiniciaron solos.
- **Imagen del worker**: se construyó y se encendió contra el entorno local. Quedó «healthy», con
  usuario sin privilegios, procesó un trabajo y se apagó en orden (código de salida 0).

| Criterio de aceptación                                       | Cómo se demuestra                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un equipo nuevo levanta el proyecto siguiendo solo el README | Dos copias limpias del repositorio siguiendo los pasos 2 a 5 del README, sin tocar nada a mano (ver arriba)                                                                                                                               |
| El trabajo de ejemplo se ejecuta y se reintenta al fallar    | `apps/worker/test/int/worker.int.test.ts` (se ejecuta y el correo llega) y `retry.int.test.ts` (falla el primer intento y termina bien en el segundo, con la política real; agotados los intentos queda fallido). También en vivo, arriba |
| `pnpm check` en verde                                        | Ver arriba                                                                                                                                                                                                                                |
| Permiso denegado, aislamiento y auditoría                    | Ver la sección siguiente                                                                                                                                                                                                                  |
| Documentación y cierre escritos                              | Este documento, `README.md`, `apps/worker/README.md`, `apps/api/README.md`, `infra/scripts/README.md`, `docs/runbooks/entorno-local.md`, `docs/runbooks/integracion-continua.md` y `.env.example`                                         |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Aislamiento entre empresas** (`isolation.int.test.ts`):
  - cada trabajo solo ve la empresa que trae;
  - dentro del contexto de la empresa A, la empresa B no existe para el worker;
  - un trabajo de una empresa ajena o inexistente falla sin reintento y no envía nada.
- **Permiso denegado**:
  - el worker se conecta como `app_user`: no es superusuario ni puede saltarse la seguridad por
    fila; sin empresa no ve filas y no puede borrar;
  - un trabajo con datos inválidos se rechaza sin consultar nada;
  - una contraseña de Valkey equivocada se rechaza;
  - sin Valkey, la API no deja pasar peticiones sin contar el límite: las rechaza.
- **Auditoría**: la tabla de auditoría llega en B11, y el trabajo de ejemplo no escribe datos del
  negocio (solo lee el nombre de la empresa y envía un correo). Por eso este bloque no tiene una
  prueba de «la escritura generó su evento de auditoría». Usted lo aprobó en el plan. Lo que sí
  queda registrado es cada trabajo: los terminados se guardan 7 días y los fallidos 30.

## Cómo lo prueba usted, paso a paso

Necesita Docker Desktop abierto. La primera vez, Docker descarga unos 3,5 GB de imágenes.

### 1. Preparar su equipo (una sola vez)

Su archivo `.env` actual es de antes de este bloque y le faltan variables. En una terminal, en la
carpeta del proyecto y con la rama de este bloque:

```bash
git switch feat/b06-entorno-local-completo
```

```bash
pnpm install
```

Cambie el nombre de su `.env` actual a `.env.anterior` (en el Explorador de Windows, o con
`Rename-Item .env .env.anterior` en PowerShell). Luego:

```bash
pnpm env:local
```

Debe decir «Listo: se creó .env…» y que el puerto 5432 está ocupado y usará el 5433. Es lo
correcto: ese puerto lo usa el PostgreSQL de Windows. Si todavía tiene el contenedor de base de datos
de B03, apáguelo antes con `docker stop arza-postgres` (si dice que no existe, no pasa nada).

### 2. Encender el entorno

```bash
pnpm infra:up
```

Al final verá «Entorno local listo» con la lista de servicios. El antivirus termina de arrancar
solo; la primera vez puede tardar hasta 15 minutos. `pnpm infra:status` muestra el estado: cada
pieza debe decir `healthy`.

### 3. Encender la aplicación y verla en el navegador

```bash
pnpm dev
```

Deje esa terminal abierta y espere a ver «Worker listo». Luego abra en el navegador:

1. http://localhost:3000/app/estado-del-sistema. Debe decir **«Todo funciona»**, con Base de
   datos, Colas y caché y Archivos en «Responde».
2. http://localhost:4000/health. Debe decir `"status":"ok"` y las tres piezas en `up`.
3. http://localhost:8025. Es Mailpit, la bandeja de correo falsa. Por ahora está vacía.

### 4. El trabajo de ejemplo

Abra **otra** terminal en la carpeta del proyecto:

```bash
pnpm job:ejemplo demo-uno
```

Dice «Trabajo 1 encolado para la empresa demo-uno». Vuelva a Mailpit (http://localhost:8025) y
actualice la página: está el correo **«Correo de prueba de ARZA ONE para Demo Uno»**. Ábralo para
ver el texto. En la terminal de `pnpm dev` verá una línea con «Trabajo terminado».

### 5. El reintento al fallar

1. Apague la bandeja de correo:

   ```bash
   docker stop arza-one-local-mailpit-1
   ```

2. Pida otro trabajo:

   ```bash
   pnpm job:ejemplo demo-dos
   ```

3. En la terminal de `pnpm dev` aparece «Trabajo fallido; se reintentará». A los 5 segundos sale
   otra igual, y luego a los 10.
4. Antes de un minuto, encienda de nuevo la bandeja:

   ```bash
   docker start arza-one-local-mailpit-1
   ```

5. Espere hasta un minuto. La terminal dice «Trabajo terminado» y en Mailpit (actualice la página)
   está el correo **«Correo de prueba de ARZA ONE para Demo Dos»**. El correo de Demo Uno ya no está
   porque Mailpit guarda los correos en memoria y se borraron al apagarlo. Es lo esperado.

### 6. Opcional

- `pnpm job:ejemplo` (sin empresa) usa la empresa de la plataforma, ARZA TECH.
- `Ctrl + C` en la terminal de `pnpm dev` apaga la aplicación; `pnpm infra:down`, los servicios.
- `pnpm infra:reset` borra los datos ficticios y vuelve a encender todo.

### 7. Las verificaciones en GitHub

En el pull request del bloque, al final de la página, debe ver «All checks have passed», ahora
con tres imágenes en la tarea 8: api, web y **worker**.

## Pendientes

| Pendiente                                                                                                                                       | Responsable      | Cuándo            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------- |
| Enviar los eventos de la bandeja de salida desde el worker (B03 lo había anotado para B06). Se pasó a B16, con su aprobación del plan           | Claude Code      | B16               |
| Usar ClamAV para revisar archivos y Gotenberg para generar PDF. Ya están encendidos y revisados                                                 | Claude Code      | B14 y B20         |
| Al desplegar el worker, dar al contenedor `stop_grace_period: 30s` para que termine los trabajos en curso                                       | Claude Code      | B07               |
| Contraseña de Valkey y servicios equivalentes en el servidor de pruebas                                                                         | Claude Code      | B07               |
| Alertar si hay más de 100 trabajos pendientes o fallidos (numeral 10.7)                                                                         | Claude Code      | B44 (monitoreo)   |
| Docker Desktop tiene asignados 3,7 GB en su equipo; alcanza, pero justo. Si el antivirus se reinicia solo, súbalo a 6 GB (Settings → Resources) | Director General | Si hace falta     |
| Pendientes de B05 que siguen abiertos: protección de `main` (GitHub Pro), instalar Renovate y la excepción de `braces` (vence el 06/11/2026)    | Director General | Ver cierre de B05 |

## Decisiones tomadas

Aprobadas por usted en el plan:

1. El trabajo de ejemplo envía un correo de prueba a Mailpit.
2. La bandeja de salida pasa a B16.
3. `pnpm env:local` crea el `.env` con contraseñas al azar.
4. No hay prueba de auditoría en este bloque.
5. Las bibliotecas bullmq, nodemailer y testcontainers.
6. ClamAV es pesado; queda advertido.

Tomadas durante el trabajo:

7. **Sin Valkey, la API rechaza las peticiones** (error 500) en lugar de dejarlas pasar sin contar
   el límite. El límite es un control de seguridad y no se omite. **`/health` queda sin límite**,
   porque es justamente la ruta que debe informar que Valkey se cayó. Sus revisiones son baratas y
   tienen tiempo máximo, y en los servidores Caddy limitará el tráfico antes (B07). **Revíselo en el
   pull request.**
8. **Prueba de arranque de la API** (`apps/api/test/startup.test.ts`). Antes comprobaba que la API
   arrancaba y respondía `/version`, sin ninguna pieza externa. Con la decisión 7, sin Valkey
   `/version` responde 500. Ahora la prueba comprueba tres cosas: que la API arranca, que `/health`
   informa las colas caídas y que `/version` es rechazada. Exige más que antes, no menos.
   **Revíselo en el pull request.**
9. **Valkey local con contraseña** (`VALKEY_PASSWORD`, variable nueva), como lo tendrán los
   servidores.
10. **`infra:up` carga las dos empresas ficticias** (Demo Uno y Demo Dos), solo en el entorno local,
    para poder probar con ellas.
11. **El antivirus arranca sin esperarlo** (ver «Problemas reales»).
12. **Garage corre con un usuario sin privilegios.** Su imagen no trae intérprete de comandos, así
    que un paso de un solo uso le entrega la carpeta de datos.
13. **Aceleración nativa de msgpackr desactivada** (`pnpm-workspace.yaml`). Es una pieza opcional de
    BullMQ que compila código al instalarse; sin ella BullMQ funciona igual, con JavaScript puro.
14. **`pnpm check` compila primero los tipos** de los paquetes compartidos y de la API (pendiente
    de B05). La integración continua hace lo mismo, ahora también con la API, porque el worker usa
    sus tipos.
15. **La API publica una interfaz para el worker** (`@arza/api/platform`). Es lo único que el worker
    puede tomar de la API (ADR-004).

## Commits

```text
4c040a8 feat(infra): add local docker compose stack with up, down and reset commands
51a08c0 feat(infra): pick free local ports when creating the env file
d5c310f fix(infra): start antivirus in background and run pnpm binaries directly
d22ef3d fix(database): build shared packages before seeding on a fresh clone
fb5afa8 feat(api): count rate limit in valkey through a shared connection
74dd8dd feat(api): add job queue definitions and public platform entry for the worker
071c4bb feat(worker): add bullmq worker with example email job and heartbeat
65a3cd5 fix(infra): load env in dev watcher so node does not watch the whole repo
9a66dfc ci(worker): build and scan the worker image and type the api before linting
a714812 docs(infra): document local environment, worker and valkey usage
3b7948d feat(infra): add infra:status to show local service health
```
