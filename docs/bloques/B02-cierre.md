# Cierre del bloque B02: Esqueleto de la API

- Fecha: 05/10/2026
- Rama: `feat/b02-esqueleto-de-la-api`
- Estado: en revisión (pendiente de la aprobación del Director General)

## Qué se construyó

Este bloque arma la base de la API: el programa arranca, revisa su configuración, deja un
registro ordenado de lo que pasa, se protege de abusos, responde los errores siempre igual y
ofrece dos direcciones para consultar su estado. Todavía no hay usuarios, empresas ni datos de
negocio; eso llega en B03, B08, B10 y B11. La descripción técnica está en
[`apps/api/README.md`](../../apps/api/README.md).

| Pieza                           | Qué hace, en palabras sencillas                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuración validada          | Al arrancar revisa las variables del archivo `.env`. Si falta una obligatoria o está mal escrita, la API no arranca y dice cuál es (nunca muestra su valor)                                                  |
| Registros (Pino)                | Cada petición deja una línea en formato JSON. Las contraseñas, cookies, tokens y códigos de verificación se reemplazan por `[oculto]`                                                                        |
| Identificador de correlación    | Cada petición recibe un número único que aparece en la respuesta (`X-Correlation-Id`) y en todas sus líneas del registro. Sirve para encontrar en el registro qué le pasó a una persona que reporta un error |
| Formato único de error          | Todo error sale con el formato del numeral 14.2. Un error inesperado devuelve un mensaje genérico con el identificador, sin detalles internos                                                                |
| Validación                      | Los datos que llegan se comparan con su esquema. Si no cumplen, la respuesta dice qué campo falló (422)                                                                                                      |
| Cabeceras de seguridad (Helmet) | Las del numeral 15.6, más «no guardar en caché» y «no indexar»                                                                                                                                               |
| Límite de peticiones            | Por defecto, 100 peticiones por minuto por dirección IP. Si se supera, responde 429                                                                                                                          |
| Cerrado por defecto             | Toda dirección queda cerrada salvo que se declare pública. Hoy cualquier dirección no pública responde 401, porque el inicio de sesión llega en B08                                                          |
| `/health`                       | Revisa la base de datos, las colas y el almacenamiento de archivos. Responde `ok` (200) si todo funciona y `degraded` (503) si algo falla, con `up` o `down` por cada pieza                                  |
| `/version`                      | Versión de la API (0.1.0), ambiente y commit                                                                                                                                                                 |
| Documentación OpenAPI           | Página `/api/docs` generada automáticamente desde los esquemas. Solo existe en local y en pruebas. Copia guardada en `apps/api/openapi.json`                                                                 |

Además se cumplió el pendiente aprobado al cierre de B01: la regla «el dominio nunca depende de
la infraestructura» ya se verifica automáticamente, está anotada en la ADR-001 y B01 quedó
marcado como terminado.

**Tablas nuevas:** ninguna. **Puntos de la API nuevos:** `GET /health` y `GET /version`
(públicos, solo lectura, con su esquema de respuesta) y `GET /api/docs` (solo local y pruebas).

## Cómo se probó

- `pnpm check` termina en verde: formato, análisis, tipos, fronteras, código sin uso, 71 pruebas,
  compilación y secretos.
- 42 pruebas nuevas en la API, 4 en los contratos y 2 de fronteras. Cobertura de la API: 95 % de líneas (el
  mínimo exigido es 90 %).

| Criterio de aceptación                                     | Prueba que lo demuestra                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La API no arranca si falta una variable de entorno         | `test/startup.test.ts` ejecuta el programa real sin `DATABASE_URL` y comprueba que termina con error y nombra la variable. También `load-config.test.ts`       |
| Un error inesperado devuelve el formato del 14.2 sin traza | `test/request-chain.test.ts`: provoca un error con un texto interno y comprueba que la respuesta es 500, cumple el formato y no contiene ese texto ni la traza |
| /health informa base de datos, colas y archivos            | `test/health-and-version.test.ts` (todo arriba → 200; una pieza caída → 503) y `probes.test.ts` (cada revisión falla bien si la pieza no responde)             |
| Permiso denegado                                           | `test/access.test.ts`: una dirección que exige sesión responde 401; una sin declarar también; y ninguna dirección real de la API queda sin declarar            |

También se comprobó a mano en el navegador integrado: `/health`, `/version`, una dirección
inexistente y `/api/docs` se ven como se describe abajo, y el registro muestra el identificador
de correlación en cada línea.

## Cómo lo prueba usted, paso a paso

Use PowerShell en la carpeta del proyecto (`C:\Users\yeaze\arza-one`).

### Preparación

```bash
git checkout feat/b02-esqueleto-de-la-api
```

```bash
pnpm install
```

El archivo `.env` ya existe en su equipo (lo copié de `.env.example` durante las pruebas). En
otro equipo, créelo con `Copy-Item .env.example .env`.

```bash
pnpm --filter @arza/api dev
```

Deje esa terminal abierta: la API queda funcionando en http://localhost:4000. Verá líneas de
texto en formato JSON; son los registros.

### En el navegador

1. **Estado.** Abra http://localhost:4000/health. Debe ver
   `{"status":"degraded","checks":{"database":"down","queues":"down","files":"down"}}`.
   «down» es lo esperado: la base de datos, las colas y el almacenamiento todavía no están
   instalados (llegan con el entorno local completo, B06).
2. **Versión.** Abra http://localhost:4000/version. Debe ver
   `{"version":"0.1.0","environment":"local","commit":"unknown"}`.
3. **Formato de error.** Abra http://localhost:4000/esto-no-existe. Debe ver un error con
   `"code":"NOT_FOUND"`, el mensaje «El recurso solicitado no existe.» y un `correlation_id`.
4. **Identificador en el registro.** Copie ese `correlation_id`, vaya a la terminal y busque el
   mismo número en las últimas líneas (Ctrl+F en la terminal, si la suya lo permite).
5. **Documentación.** Abra http://localhost:4000/api/docs. Verá la página «ARZA ONE API» con las
   direcciones `/health` y `/version`. Haga clic en `/version`, luego en **Try it out** y en
   **Execute**: verá la respuesta y sus cabeceras.
6. **Cabeceras de seguridad.** En la página de `/version`, pulse F12, abra la pestaña **Network**
   (Red), recargue la página y haga clic en la fila `version`. En **Response Headers** busque
   `x-correlation-id`, `strict-transport-security`, `content-security-policy` y
   `x-robots-tag: noindex, nofollow`.

### Límite de peticiones y configuración inválida

7. **Límite de peticiones.** Detenga la API con Ctrl+C. En `.env`, cambie
   `RATE_LIMIT_MAX_REQUESTS=100` por `RATE_LIMIT_MAX_REQUESTS=3` y vuelva a ejecutar
   `pnpm --filter @arza/api dev`. Recargue http://localhost:4000/version cuatro veces: la cuarta
   debe mostrar `"code":"RATE_LIMITED"` y «Ha realizado demasiadas peticiones…». Después
   devuelva el valor a `100`.
8. **Variable faltante.** Detenga la API. En `.env`, ponga `#` al comienzo de la línea
   `DATABASE_URL=…` y vuelva a ejecutar `pnpm --filter @arza/api dev`. Debe ver
   «La API no puede arrancar: la configuración no es válida» y `DATABASE_URL: falta; es
obligatoria`, y la API no queda funcionando. Quite el `#` al terminar.

### Opcional: ver la base de datos y las colas en «up»

Requiere abrir Docker Desktop primero. **No pude ensayar estos comandos**, porque Docker estaba
apagado en su equipo; las revisiones sí están probadas contra piezas que no responden.

```bash
docker run --rm -d --name arza-pg -p 5432:5432 -e POSTGRES_USER=app_user -e POSTGRES_PASSWORD=REEMPLAZAR -e POSTGRES_DB=arza_one postgres:17
```

```bash
docker run --rm -d --name arza-valkey -p 6379:6379 valkey/valkey:8
```

Recargue http://localhost:4000/health: `database` y `queues` deben pasar a `up`. `files` sigue
en `down` hasta B06, que instala el almacenamiento (Garage). Para apagarlos:

```bash
docker stop arza-pg arza-valkey
```

## Pruebas de permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado: sí aplica.** La API queda cerrada por defecto y una prueba verifica que
  toda dirección declare cómo se accede a ella (ver «Cómo se probó»).
- **Aislamiento entre empresas: no aplica todavía.** No existen empresas ni registros. Empieza en
  B03 (seguridad por fila).
- **Auditoría: no aplica todavía.** Este bloque no escribe datos. Empieza en B11.

## Decisiones tomadas

Las seis decisiones del plan las aprobó usted: variables mínimas, `/health` y `/version` fuera
de `/api/v1`, límite de peticiones en memoria, GlitchTip en B07, `/health` sin detalles
internos y su prueba sin servicios locales. Además tomé estas:

1. **NestJS 11 en lugar de 12.** La biblioteca que conecta NestJS con los esquemas (nestjs-zod,
   capítulo 9) todavía no admite la versión 12. Igual que con TypeScript 6 en B01: se actualiza
   cuando la admita.
2. **Tres variables opcionales nuevas, fuera del anexo F:** `API_PORT` (puerto local, 4000 por
   defecto), `LOG_LEVEL` (detalle de los registros, `info` por defecto) y `GIT_COMMIT` (commit
   desplegado; lo fijará el despliegue en B07). Están en `.env.example`. Le propongo agregarlas
   al anexo F en la próxima revisión del manual.
3. **Tamaño máximo de una petición: 1 MB.** Lo que lo supere recibe el error
   `PAYLOAD_TOO_LARGE` (413). Los archivos no pasan por aquí: se suben directo al almacenamiento
   (numeral 13.2, B14).
4. **Nombres de los esquemas en la documentación:** `HealthResponse_Output`, `VersionResponse_Output`
   y `ErrorResponse_Output`. La terminación `_Output` la pone nestjs-zod; nombrarlos de otra forma
   hace fallar esa biblioteca.
5. **Bibliotecas nuevas** (todas con licencia permisiva y mantenimiento activo): NestJS,
   `@nestjs/throttler`, `@nestjs/swagger`, `nestjs-zod`, `zod`, `nestjs-pino`, `pino`, `pino-http`,
   `helmet`, `uuid`, `pg`, `ioredis`, `@aws-sdk/client-s3`, `express` (la usa NestJS por debajo;
   se declara porque el código usa sus tipos), `reflect-metadata` y `rxjs` (exigidas por NestJS) y,
   solo para pruebas, `@nestjs/testing`, `supertest` y `@vitest/coverage-v8`. No hizo falta
   `unplugin-swc`. Licencias: MIT, salvo el SDK de AWS, `rxjs` y `reflect-metadata` (Apache 2.0).
6. **Telemetría bloqueada.** La página de documentación (swagger-ui) trae un componente que envía
   estadísticas de uso al instalarse; se bloqueó su ejecución en `pnpm-workspace.yaml`.
7. **Regla del analizador para NestJS.** NestJS declara sus módulos como clases vacías con una
   etiqueta (`@Module`). Se configuró la regla que prohíbe clases vacías para que las acepte solo
   cuando llevan esa etiqueta. No se desactivó ninguna regla.
8. **Primera versión de la API: 0.1.0.**

## Pendientes

| Pendiente                                                                                                   | Responsable      | Cuándo                      |
| ----------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------- |
| Revisar y aprobar este bloque (ver el pull request)                                                         | Director General | Ahora                       |
| Agregar `API_PORT`, `LOG_LEVEL` y `GIT_COMMIT` al anexo F del manual                                        | Director General | Próxima revisión del manual |
| Contar el límite de peticiones en Valkey y recargar la API automáticamente al editar código (`pnpm dev`)    | Claude Code      | B06                         |
| Conteo del límite por usuario, sesiones y protección CSRF                                                   | Claude Code      | B08                         |
| Que `/health` use las conexiones compartidas de la base de datos y de las colas en lugar de abrir una nueva | Claude Code      | B03 (base de datos) y B06   |
| Enviar los errores inesperados a GlitchTip                                                                  | Claude Code      | B07                         |
| Pruebas de integración con base de datos real (`pnpm test:int`, Testcontainers)                             | Claude Code      | B03                         |
| Actualizar a NestJS 12 cuando nestjs-zod lo admita                                                          | Claude Code      | Cuando salga la versión     |
