# @arza/worker

Procesador de trabajos en segundo plano de ARZA ONE (NestJS 11 con BullMQ sobre Valkey,
ADR-004 y ADR-014). Hace lo que no debe bloquear una petición del usuario: correos, PDF, antivirus,
recordatorios. En B06 tiene un solo trabajo, el de ejemplo; cada bloque agrega los suyos.

## Cómo se ejecuta

| Comando                               | Qué hace                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` (raíz)                     | Enciende el worker con la API y la web; se reinicia solo al guardar cambios                                    |
| `pnpm --filter @arza/worker dev`      | Solo el worker, con recarga automática                                                                         |
| `pnpm --filter @arza/worker start`    | La versión ya compilada (`dist/`)                                                                              |
| `pnpm job:ejemplo [empresa]` (raíz)   | Encola el trabajo de ejemplo. `empresa`: `plataforma` (por defecto), `demo-uno`, `demo-dos` o un identificador |
| `pnpm --filter @arza/worker test`     | Pruebas unitarias con cobertura                                                                                |
| `pnpm --filter @arza/worker test:int` | Pruebas con PostgreSQL, Valkey y Mailpit reales (requiere Docker)                                              |

Las variables se leen del `.env` de la raíz (ver `.env.example`). Requiere `pnpm infra:up`.

## Configuración

`src/config/env-schema.ts` valida al arrancar `NODE_ENV`, `APP_ENV`, `LOG_LEVEL`, `DATABASE_URL`,
`VALKEY_URL`, `APP_URL` (dominio de los enlaces de los correos), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD` (opcionales), `MAIL_FROM` y
`WORKER_CONCURRENCY` (trabajos a la vez por cola; 5 por defecto). Si falta una o tiene formato
inválido, el worker no arranca y dice cuál, sin mostrar su valor. Usa el mismo validador de la API.

## Qué reutiliza de la API

El worker importa solo `@arza/api/platform` y `@arza/api/iam` (el módulo de identidad, para
armar los correos de las cuentas) ([`apps/api/src/platform/index.ts`](../api/src/platform/index.ts)),
la interfaz pública de la plataforma de la API (ADR-004):

- `DatabaseService`: la misma conexión limitada (`app_user`) y el mismo `withTenant`. Cada trabajo
  trae la empresa en sus datos y el worker la fija en la transacción, igual que la API
  (numeral 13.2): la seguridad por fila solo deja ver esa empresa.
- `JOBS`, `QUEUES` y `DEFAULT_JOB_OPTIONS`: las colas, los esquemas de los datos de cada trabajo y
  la política de reintentos, compartidos con quien encola.
- `loadEnv` y `REDACTED_PATHS`: validación de variables y lista de datos que nunca se registran.

## Estructura

| Archivo                      | Qué hace                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                | Valida la configuración y arranca NestJS; al recibir la señal de apagado, cierra en orden                                                                             |
| `src/worker.module.ts`       | Conexiones (base de datos, Valkey, correo), procesadores de las colas y latido                                                                                        |
| `src/queue/queue-workers.ts` | Un procesador de BullMQ por cola. Al apagarse deja de tomar trabajos y espera los que están en curso (25 s como máximo), aunque Valkey no responda                    |
| `src/queue/job-router.ts`    | Envía cada trabajo a su procesador según su nombre. Un nombre desconocido falla sin reintento                                                                         |
| `src/queue/job-log.ts`       | Qué se registra de cada trabajo: identificador, intento, empresa y correlación; nunca sus datos                                                                       |
| `src/jobs/example-email.ts`  | Trabajo de ejemplo (B06): lee el nombre de la empresa en su contexto y envía un correo de prueba                                                                      |
| `src/jobs/account-email.ts`  | Correos de las cuentas (B08): invitación, recuperación y aviso de cambio de contraseña. El enlace se crea al enviar; si la cuenta ya no aplica, no envía ni reintenta |
| `src/mail/mailer.ts`         | Envío por SMTP con nodemailer. Fuera del entorno local exige TLS                                                                                                      |
| `src/heartbeat/heartbeat.ts` | Latido en Valkey cada 15 s, con vencimiento a los 45 s (numeral 10.3)                                                                                                 |
| `src/healthcheck.ts`         | Verificación de salud de la imagen Docker: sale con 1 si no hay latido reciente                                                                                       |
| `src/cli/enqueue-example.ts` | Comando `pnpm job:ejemplo`                                                                                                                                            |

## Reintentos (ADR-014)

Todo trabajo se encola con 6 intentos y espera creciente: 5, 10, 20, 40 y 80 segundos (unos dos
minutos y medio en total). Los terminados se guardan 7 días y los fallidos 30. Un trabajo con
datos inválidos o de una empresa que no existe falla de una vez (`UnrecoverableError`): reintentar
no lo arreglaría. Por eso los trabajos deben ser idempotentes: repetirlos no debe duplicar efectos.

## Registros

JSON con Pino: `service: "worker"`, `environment` y, por trabajo, `job_id`, `job_name`, `attempt`,
`max_attempts`, `tenant_id` y `correlation_id`. Nunca los datos del trabajo (el destinatario es un
dato personal), ni contraseñas o tokens (mismas reglas que la API, capítulo 11.2). La dirección
de Valkey no se registra porque lleva la contraseña.

## Imagen Docker

```bash
docker build -f apps/worker/Dockerfile -t arza-one/worker .
```

Usuario sin privilegios, sin gestores de paquetes y con verificación de salud por latido. Trivy la
analiza en la integración continua. Al desplegarla (B07), el contenedor necesita
`stop_grace_period: 30s` para que el worker termine los trabajos en curso antes de detenerse.

## Pruebas

- Unitarias (`src/**/*.test.ts`): configuración, registros, trabajo de ejemplo (datos inválidos,
  empresa ajena, fallo de correo), enrutador, latido, envío SMTP y trabajos en curso.
  Cobertura del 100 %.
- Integración (`test/int/`), con PostgreSQL y Valkey preparados por la configuración de pruebas de
  la API y un Mailpit desechable:
  - `worker.int.test.ts`: el worker completo procesa el trabajo y el correo llega a Mailpit; una
    empresa inexistente falla una sola vez; el latido queda en Valkey.
  - `retry.int.test.ts`: **el trabajo se reintenta al fallar** con la política real y termina bien
    en el segundo intento; agotados los intentos, queda fallido.
  - `isolation.int.test.ts`: **aislamiento entre empresas** (un trabajo solo ve su empresa) y
    **permiso denegado** (el worker usa `app_user`: sin empresa no ve filas y no puede borrar).
  - `resilience.int.test.ts`: con una contraseña de Valkey equivocada el worker arranca, registra
    los errores y se apaga en orden; con un trabajo que no termina, se apaga al vencer el plazo.
