# @arza/api

API del backend de ARZA ONE (NestJS 11). Es el único componente que escribe en la base de datos
(capítulo 8.2). Este documento describe la plataforma transversal construida en el bloque B02;
los módulos de negocio se agregan en `src/modules/` a partir de B03.

## Cómo se ejecuta

| Comando                           | Qué hace                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter @arza/api dev`     | Compila y arranca la API en http://localhost:4000          |
| `pnpm --filter @arza/api start`   | Arranca la versión ya compilada (`dist/`)                  |
| `pnpm --filter @arza/api test`    | Pruebas unitarias y de la cadena de petición con cobertura |
| `pnpm --filter @arza/api test -u` | Regenera `openapi.json` después de cambiar un contrato     |

Las variables de entorno se leen del archivo `.env` de la raíz del proyecto (ver `.env.example`).

## Puntos de la API

| Ruta                         | Acceso  | Respuesta                                                                     |
| ---------------------------- | ------- | ----------------------------------------------------------------------------- |
| `GET /health`                | Público | 200 si la base de datos, las colas y los archivos responden; 503 si alguno no |
| `GET /version`               | Público | Versión, ambiente (`local`, `staging`, `production`) y commit                 |
| `GET /api/docs`              | Público | Documentación interactiva. Solo en local y pruebas; no existe en producción   |
| `GET /api/docs/openapi.json` | Público | El mismo documento en formato OpenAPI 3.1                                     |

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

Los pasos 5 (CSRF), 6 (contexto de empresa), 8 (autorización), 9 (idempotencia) y 11
(auditoría) llegan en B03, B08, B10 y B11.

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
Detrás de Caddy, la IP real se toma de `X-Forwarded-For` (solo de proxies de red local). El
conteo vive en memoria; pasa a Valkey en B06 y se agrega el conteo por usuario en B08.

### Cabeceras de seguridad (numeral 15.6)

`Strict-Transport-Security`, `Content-Security-Policy` (`default-src 'none'`),
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`,
`Cache-Control: no-store` y `X-Robots-Tag: noindex`. La página `/api/docs` permite estilos en
línea porque Swagger UI los necesita. CORS solo admite `APP_URL`, `PORTAL_URL` y `PUBLIC_URL`.

## Pruebas

- `src/**/*.test.ts`: unitarias (configuración, identificador, registros, revisiones de /health).
- `test/*.test.ts`: la API completa en memoria con Supertest, con la misma cadena que en
  producción. Las piezas externas de `/health` se simulan; `test/support/sample.controller.ts`
  agrega rutas de ensayo que solo existen en las pruebas.
- `test/startup.test.ts`: arranca el programa compilado real y comprueba que no arranca sin
  una variable obligatoria.
- Cobertura mínima: 90 % de líneas, funciones e instrucciones y 85 % de ramas (capítulo 21.1).
