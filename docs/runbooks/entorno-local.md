# Entorno local

Guía del entorno de trabajo en el equipo (numeral 10.1, ambiente «Local»; bloque B06). Todo corre
en Docker Desktop con datos ficticios. Nada de esto se usa en los servidores de pruebas o
producción (B07).

## Las piezas

| Servicio   | Para qué                                      | Dirección en el equipo  | Memoria máxima |
| ---------- | --------------------------------------------- | ----------------------- | -------------- |
| PostgreSQL | Base de datos                                 | `localhost:5432`        | 2 GB           |
| Valkey     | Colas de trabajos y límite de peticiones      | `localhost:6379`        | 256 MB         |
| Garage     | Archivos privados (interfaz S3)               | `http://localhost:3900` | 512 MB         |
| Gotenberg  | Conversión a PDF (se usa desde B20)           | `http://localhost:3001` | 768 MB         |
| ClamAV     | Antivirus (se usa desde B14)                  | `localhost:3310`        | 1,2 GB         |
| Mailpit    | Bandeja de correo falsa: nada sale a internet | `http://localhost:8025` | 128 MB         |

- Los puertos solo escuchan en el propio equipo (`127.0.0.1`), nunca en la red.
- Si un puerto está ocupado, `pnpm env:local` escoge otro y lo anota en `.env`. Por ejemplo, con
  un PostgreSQL instalado en Windows, la base queda en `localhost:5433`.
- Las imágenes van fijadas a su huella en [`infra/compose/local.yml`](../../infra/compose/local.yml).
- Cada servicio tiene límite de memoria, reinicio automático y verificación de salud (numeral 10.3).
- Docker Desktop necesita unos 4 GB de memoria libres. Si el antivirus se reinicia una y otra vez,
  súbale la memoria a Docker Desktop (Settings → Resources) o, con WSL 2, en el archivo
  `%UserProfile%\.wslconfig`.

## Comandos

| Comando             | Qué hace                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:local`    | Crea `.env` con contraseñas locales al azar y puertos libres. Nunca sobrescribe un `.env` existente                       |
| `pnpm infra:up`     | Enciende los servicios, prepara Garage, aplica las migraciones y carga la semilla con las dos empresas ficticias          |
| `pnpm infra:down`   | Apaga los servicios y conserva los datos                                                                                  |
| `pnpm infra:status` | Muestra el estado de cada servicio: la columna `STATUS` debe decir `healthy`                                              |
| `pnpm infra:reset`  | Borra los datos (base, colas y archivos) y vuelve a encender todo. Conserva la base de firmas del antivirus               |
| `pnpm dev`          | Enciende la API, el worker y la web. Al guardar un cambio en la API o el worker, se recompilan y reinician solos          |
| `pnpm job:ejemplo`  | Encola el trabajo de ejemplo: el worker envía un correo de prueba a Mailpit. Acepta `demo-uno`, `demo-dos` o `plataforma` |

`infra:up` se puede repetir cuantas veces quiera: lo que ya está hecho no se vuelve a hacer. El
antivirus termina de arrancar solo, en segundo plano: tarda unos minutos y la primera vez, mientras
descarga su base de virus, hasta 15.

## Estado de los servicios

```bash
pnpm infra:status
```

La columna `STATUS` debe decir `healthy` en cada servicio. Desde el navegador:

- http://localhost:4000/health: la API revisa la base de datos, las colas y los archivos.
- http://localhost:3000/app/estado-del-sistema: la misma revisión en la web.
- http://localhost:8025: los correos que envió el worker.

## Problemas frecuentes

| Síntoma                                              | Causa y solución                                                                                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Docker no responde»                                 | Docker Desktop está cerrado. Ábralo, espere a «Engine running» y repita                                                                                                                 |
| «port is already allocated» o «bind»                 | Otro programa usa ese puerto. Cambie el puerto en `.env` (por ejemplo `POSTGRES_PORT=5433`) y el mismo número en las direcciones que lo usan (`DATABASE_URL`, `DATABASE_MIGRATION_URL`) |
| `password authentication failed` al migrar           | La base se creó con otras contraseñas. Ejecute `pnpm infra:reset` (borra los datos ficticios y la vuelve a crear con las de `.env`)                                                     |
| `/health` dice `queues: down`                        | Valkey está apagado o `VALKEY_URL` no lleva la contraseña de `VALKEY_PASSWORD`                                                                                                          |
| Toda petición a la API responde 500, salvo `/health` | La API no alcanza Valkey y, sin él, no puede contar el límite de peticiones: rechaza en lugar de dejar pasar sin control. Encienda los servicios con `pnpm infra:up`                    |
| Un correo de prueba no llega                         | Revise que `pnpm dev` esté encendido. Si Mailpit estaba apagado, el worker reintenta durante unos dos minutos y medio (6 intentos); el registro dice «Trabajo fallido; se reintentará»  |
| `Falta el archivo .env`                              | Ejecute `pnpm env:local`                                                                                                                                                                |

## Cómo funciona el trabajo de ejemplo

1. `pnpm job:ejemplo` pone en la cola `platform` un trabajo con la empresa y el destinatario
   ficticio `pruebas@arza-one.test`. Antes de encolarlo valida sus datos.
2. El worker lo toma, fija la empresa en la transacción (seguridad por fila, numeral 13.2), lee su
   nombre y envía el correo a Mailpit.
3. Si el envío falla, BullMQ lo reintenta: 6 intentos con esperas de 5, 10, 20, 40 y 80 segundos.
   Si los datos son inválidos o la empresa no existe, falla de una vez, porque reintentar no
   arreglaría nada.
4. Los trabajos terminados se guardan 7 días y los fallidos 30, para revisarlos.
5. Cada 15 segundos el worker deja un latido en Valkey. La verificación de salud de su contenedor
   falla si el latido tiene más de 45 segundos.
