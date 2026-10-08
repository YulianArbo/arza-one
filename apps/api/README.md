# @arza/api

API del backend de ARZA ONE (NestJS 11). Es el único componente que escribe en la base de datos
(capítulo 8.2). Este documento describe la plataforma transversal: la cadena de petición (B02),
la base de datos con contexto de empresa y seguridad por fila (B03) y Valkey con las colas de
trabajos (B06). Los módulos de negocio se agregan en `src/modules/`.

## Cómo se ejecuta

| Comando                               | Qué hace                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --filter @arza/api dev`         | Arranca la API en http://localhost:4000; al guardar un cambio se recompila y reinicia sola  |
| `pnpm --filter @arza/api start`       | Arranca la versión ya compilada (`dist/`)                                                   |
| `pnpm --filter @arza/api test`        | Pruebas unitarias y de la cadena de petición con cobertura                                  |
| `pnpm --filter @arza/api test -u`     | Regenera `openapi.json` después de cambiar un contrato                                      |
| `pnpm test:int`                       | Pruebas con PostgreSQL y Valkey reales (requiere Docker)                                    |
| `pnpm db:migrate`                     | Aplica las migraciones pendientes, como `migration_user`                                    |
| `pnpm db:seed`                        | Datos semilla (empresa de la plataforma); idempotente                                       |
| `pnpm db:seed:demo`                   | Semilla más dos empresas ficticias; nunca en producción (`pnpm infra:up` la carga en local) |
| `pnpm --filter @arza/api db:generate` | Regenera el cliente de Prisma tras cambiar el modelo                                        |

Las variables de entorno se leen del archivo `.env` de la raíz del proyecto (ver `.env.example`).
Los servicios locales se encienden con `pnpm infra:up` ([guía](../../docs/runbooks/entorno-local.md)).

## Puntos de la API

| Ruta                         | Acceso  | Respuesta                                                                                                                            |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                | Público | 200 si la base de datos, las colas y los archivos responden; 503 si alguno no. Sin límite de peticiones (ver «Límite de peticiones») |
| `GET /version`               | Público | Versión, ambiente (`local`, `staging`, `production`) y commit                                                                        |
| `GET /api/docs`              | Público | Documentación interactiva. Solo en local y pruebas; no existe en producción                                                          |
| `GET /api/docs/openapi.json` | Público | El mismo documento en formato OpenAPI 3.1                                                                                            |

`/health` y `/version` están fuera de `/api/v1` porque son de operación (los consultan Caddy y
Docker). Los recursos de negocio irán bajo `/api/v1` (capítulo 14.1).

El documento OpenAPI se genera desde los esquemas Zod de `packages/contracts` (ADR-010) y se
guarda en [`openapi.json`](openapi.json). Una prueba falla si el archivo no coincide con el código.

## Cadena de petición (capítulo 13.1)

Cada petición pasa por los mismos eslabones, definidos una sola vez en `src/platform/`:

| Paso | Eslabón                      | Dónde                                     | Si falla                    |
| ---- | ---------------------------- | ----------------------------------------- | --------------------------- |
| —    | Cabeceras de seguridad       | `platform/security/security-headers.ts`   | —                           |
| 2    | Identificador de correlación | `platform/correlation/correlation-id.ts`  | —                           |
| 3    | Límite de peticiones         | `ThrottlerGuard` en `app.module.ts`       | 429 `RATE_LIMITED`          |
| 4    | Acceso (cerrado por defecto) | `platform/access/access.guard.ts`         | 401 `UNAUTHENTICATED`       |
| 7    | Validación con Zod           | `ZodValidationPipe` en `app.module.ts`    | 422 `VALIDATION_FAILED`     |
| 12   | Respuesta validada con Zod   | `ZodSerializerInterceptor`                | 500 `INTERNAL_ERROR`        |
| —    | Formato único de error       | `platform/errors/api-exception.filter.ts` | Siempre el formato del 14.2 |

El paso 6 (contexto de empresa) ya existe en la base de datos (ver «Base de datos»); B08 lo
conecta a la sesión del usuario. Los pasos 5 (CSRF), 8 (autorización), 9 (idempotencia) y 11
(auditoría) llegan en B08, B10 y B11.

### Configuración

`platform/config/env-schema.ts` valida las variables al arrancar. Si falta una obligatoria o
tiene formato inválido, la API no arranca y lista las variables con problema, nunca sus valores.
Solo se exigen las variables que la API usa hoy; cada bloque agrega las suyas.

### Registros

JSON con Pino. Cada línea de una petición lleva `correlation_id`, `service` y `environment`.
Se ocultan los encabezados `Authorization`, `Cookie` y `X-CSRF-Token`, la cookie de respuesta y
los campos `password`, `token`, `otp_code` y `verification_code`. Los cuerpos de las peticiones
no se registran.

### Identificador de correlación

Si la petición trae `X-Correlation-Id` con un UUID válido, se reutiliza; si no, se genera un
UUID v7. Se devuelve siempre en la cabecera `X-Correlation-Id` y en todo error.

### Errores

Todo error sale con el formato del numeral 14.2:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "El recurso solicitado no existe.",
    "details": [],
    "correlation_id": "01a10f6d-79a4-73f1-94d9-da2a6f95a5d5"
  }
}
```

Un error inesperado responde 500 con un mensaje genérico que incluye el identificador; la traza
queda solo en el registro interno. Códigos de la plataforma: `BAD_REQUEST`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED`, `RATE_LIMITED` e
`INTERNAL_ERROR` (`packages/contracts/src/platform/error-response.ts`).

### Acceso

Toda ruta debe declarar cómo se accede a ella con `@Public()` o `@Authenticated()`
(`platform/access/access.decorators.ts`). Sin declaración, la ruta queda cerrada. Una prueba
(`test/access.test.ts`) falla si alguna ruta de la API no lo declara. Hasta B08 no existen
sesiones, así que toda ruta `@Authenticated()` responde 401.

### Límite de peticiones

`RATE_LIMIT_MAX_REQUESTS` peticiones por dirección IP cada `RATE_LIMIT_WINDOW_SECONDS` segundos.
Detrás de Caddy, la IP real se toma de `X-Forwarded-For` (solo de proxies de red local). El conteo
por usuario llega en B08.

Desde B06 el conteo vive en Valkey (`platform/valkey/valkey-throttler-storage.ts`): un guion de
Valkey cuenta y bloquea en un solo paso, así que no se lo saltan peticiones simultáneas, se
conserva si la API se reinicia y es el mismo para todas sus copias. Si Valkey no responde, toda
petición con límite falla con 500: el límite es un control de seguridad y no se omite. `/health`
no tiene límite (`@SkipThrottle`) para poder informar justamente esa caída; sus revisiones son
baratas y tienen tiempo máximo, y en los servidores Caddy limita el tráfico antes (B07).

### Cabeceras de seguridad (numeral 15.6)

`Strict-Transport-Security`, `Content-Security-Policy` (`default-src 'none'`),
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`,
`Cache-Control: no-store` y `X-Robots-Tag: noindex`. La página `/api/docs` permite estilos en
línea porque Swagger UI los necesita. CORS solo admite `APP_URL`, `PORTAL_URL` y `PUBLIC_URL`.

## Base de datos (B03)

PostgreSQL 17 con Prisma 7 (ADR-006). El modelo está en [`prisma/schema.prisma`](prisma/schema.prisma)
y las migraciones en `prisma/migrations/`. El cliente de Prisma se genera en `src/generated/`
(fuera del repositorio) al instalar, compilar o ejecutar `db:generate`. El diccionario de las
tablas está en [`docs/manual/datos/core.md`](../../docs/manual/datos/core.md).

### Dos usuarios de base de datos

[`infra/postgres/init/01-roles-and-database.sh`](../../infra/postgres/init/01-roles-and-database.sh)
crea la base `arza_one` (UTF-8, intercalación ICU `es-CO`, zona UTC) y dos usuarios, con las
contraseñas de `MIGRATION_DB_PASSWORD` y `APP_DB_PASSWORD`:

| Usuario          | Lo usa                                       | Puede                                                                                                               |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `migration_user` | `pnpm db:migrate` (`DATABASE_MIGRATION_URL`) | Es dueño del esquema y de las tablas; aplica migraciones                                                            |
| `app_user`       | La API y los datos semilla (`DATABASE_URL`)  | Solo lo que cada migración le concede. No es dueño ni superusuario, no salta la seguridad por fila y no borra filas |

### Contexto de empresa y seguridad por fila (ADR-007)

Toda lectura o escritura de datos de negocio pasa por `DatabaseService.withTenant`:

```ts
await database.withTenant({ tenantId, userId }, async (transaction) => {
  await transaction.outboxEvent.create({
    data: { tenantId, eventType: 'quote.accepted', payload },
  });
});
```

`withTenant` valida que los identificadores sean UUID, abre una transacción y fija
`app.tenant_id` y `app.user_id` solo para ella (`set_config(..., true)`, equivalente a `SET LOCAL`,
con parámetros). Las políticas RLS comparan cada fila con `core_current_tenant_id()`. Sin contexto
no se ve ni se escribe ninguna fila; al terminar la transacción el contexto desaparece, así que una
conexión reutilizada no lo hereda. Si el trabajo lanza un error, se revierte todo.

### Reglas para cada tabla nueva de negocio

Prisma no expresa estas piezas; van en el SQL de la migración (ver la primera migración):

1. Columna `tenant_id` (primera en los índices compuestos) y las columnas de control.
2. `ENABLE` y `FORCE ROW LEVEL SECURITY` y una política `USING` y `WITH CHECK` con
   `core_current_tenant_id()`.
3. El disparador `core_set_control_columns()`: fija `created_*`, `updated_*` y `version` (sube en
   cada cambio) y ese valor no se puede falsificar desde el código.
4. `GRANT` explícito a `app_user` solo de lo necesario. Sin `DELETE` salvo que el borrado físico
   esté justificado (capítulo 12.1).
5. Pruebas de aislamiento entre empresas y de permiso denegado en `test/int/`.

Las migraciones nuevas se escriben con `prisma migrate diff` y se completan a mano con lo anterior;
`migration_user` no puede crear la base auxiliar que usa `prisma migrate dev`. Una prueba falla si
la base migrada no coincide con el modelo.

## Valkey y colas de trabajos (B06)

`platform/valkey/valkey.module.ts` abre **una sola conexión** a Valkey para toda la API (límite de
peticiones y `/health`). Sin conexión, cada comando falla de inmediato en lugar de quedar en
espera, y ioredis reintenta conectarse solo. La API arranca aunque Valkey no responda.

`platform/queues/` define las colas y los trabajos (ADR-014): el nombre de cada trabajo, el
esquema Zod de sus datos (todo trabajo lleva `tenantId`, `userId` y `correlationId`) y la
política de reintentos (`DEFAULT_JOB_OPTIONS`: 6 intentos con espera creciente). `JobQueue`
valida los datos antes de encolar. El worker procesa los trabajos ([`apps/worker`](../worker/README.md)).

### Interfaz pública para el worker

[`src/platform/index.ts`](src/platform/index.ts) se publica como `@arza/api/platform` (campo
`exports` de `package.json`). Es lo único que el worker puede importar de la API (ADR-004):
configuración, `DatabaseService`, empresas semilla, datos que no se registran y colas. Agregar algo
ahí es ampliar ese contrato.

## Imágenes Docker (B05 y B07)

[`Dockerfile`](Dockerfile) produce dos imágenes, sin gestores de paquetes y con usuario sin
privilegios:

| Imagen      | Cómo se construye                                               | Qué lleva                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API         | `bash infra/scripts/ci/build-image.sh api arza-one/api`         | La API compilada y sus dependencias de producción                                                                                                                                      |
| Migraciones | `bash infra/scripts/ci/build-image.sh migrate arza-one/migrate` | Solo la consola de Prisma ([`infra/migrate`](../../infra/migrate/package.json)), el esquema y las migraciones. El despliegue la ejecuta una vez con `DATABASE_MIGRATION_URL` y termina |

En pruebas la API vive detrás de Caddy en `https://pruebas.[dominio]/api`; Caddy quita el prefijo
`/api` antes de pasarle la petición ([`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile)).

## Pruebas

- `src/**/*.test.ts`: unitarias (configuración, identificador, registros, revisiones de /health).
- `test/*.test.ts`: la API completa en memoria con Supertest, con la misma cadena que en
  producción. Las piezas externas de `/health` se simulan; `test/support/sample.controller.ts`
  agrega rutas de ensayo que solo existen en las pruebas.
- `test/startup.test.ts`: arranca el programa compilado real y comprueba que no arranca sin
  una variable obligatoria; sin Valkey, atiende `/health` y rechaza el resto (no omite el límite).
  Las demás pruebas en memoria cuentan el límite de peticiones en memoria.
- `test/int/*.int.test.ts` (`pnpm test:int`): con PostgreSQL 17 y Valkey 8 reales en Docker
  (Testcontainers). `test/int/support/global-setup.ts` crea la base con el mismo guion de
  `infra/postgres/init`, contraseñas desechables, y aplica las migraciones desde cero; también
  levanta Valkey con contraseña. Cubren aislamiento entre empresas, permisos denegados a
  `app_user`, columnas de control, transacciones, migraciones, semillas, el límite de peticiones
  en Valkey (429, conteo exacto con peticiones simultáneas, conteo compartido entre dos copias de
  la API) y la cola de trabajos. El worker reutiliza la misma preparación.
- Cobertura mínima: 90 % de líneas, funciones e instrucciones y 85 % de ramas (capítulo 21.1).
  Los datos semilla, el conteo en Valkey y `JobQueue` se miden en `test:int`, con el mismo umbral,
  porque solo se prueban con PostgreSQL y Valkey reales. `@prisma/client` figura como dependencia usada en `knip.json` porque solo lo
  importa el cliente generado, que no está en el repositorio.
