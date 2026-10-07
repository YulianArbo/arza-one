# Cierre del bloque B03: Base de datos, contexto de empresa y seguridad por fila

- Fecha: 06/10/2026
- Rama: `feat/b03-base-de-datos-contexto-de-empr`
- Estado: en revisión. Pendiente de la aprobación del Director General y de la **revisión externa**,
  porque es un bloque crítico.

## Qué se construyó

La API ya tiene base de datos. Lo central del bloque es la **seguridad por fila**: cada fila sabe a
qué empresa pertenece, y PostgreSQL solo deja ver o tocar las filas de la empresa que la API
declaró al empezar cada operación. Si no se declara ninguna, no muestra nada. Esta protección
vive en la base de datos, no en el código, así que se mantiene aunque el código tenga un error.

La descripción técnica está en [`apps/api/README.md`](../../apps/api/README.md) (sección «Base de
datos») y el detalle de cada columna en [`docs/manual/datos/core.md`](../manual/datos/core.md).

| Pieza                          | Qué hace, en palabras sencillas                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guion de preparación           | `infra/postgres/init/` crea la base de datos (UTF-8, orden alfabético del español de Colombia, hora UTC) y dos usuarios. Las contraseñas salen de `.env`, nunca del código. Lo reutilizarán B06 y B07                        |
| Dos usuarios de base de datos  | `migration_user` crea y cambia las tablas. `app_user` es el que usa la API: no es dueño de nada, no puede saltarse la seguridad por fila, no puede borrar filas ni alterar tablas                                            |
| Tabla de empresas              | `core_tenants`: razón social, nombre comercial, NIT (único), estado (activa, suspendida o cerrada) y ajustes                                                                                                                 |
| Bandeja de salida              | `core_outbox_events`: los avisos internos pendientes de enviar (por ejemplo «contrato firmado»). Se guardan junto con el dato que los origina; los enviará el worker desde B06                                               |
| Columnas de control            | Fecha y autor de creación y de modificación, versión y borrado lógico. Las pone la propia base de datos: la versión sube en cada cambio y el código no puede falsificar quién creó o modificó                                |
| Contexto de empresa            | `DatabaseService.withTenant` abre una transacción con la empresa y el usuario fijados solo para ella. Revisa que los identificadores sean válidos y los envía como parámetros. Si algo falla, no se guarda nada              |
| Datos semilla                  | `pnpm db:seed` crea la empresa ARZA TECH. `pnpm db:seed:demo` agrega dos empresas ficticias («Demo Uno» y «Demo Dos») con un evento cada una y se niega a ejecutarse en producción. Ejecutarlos varias veces no duplica nada |
| `/health`                      | Revisa la base de datos por la conexión compartida de la API, en lugar de abrir una nueva (pendiente de B02)                                                                                                                 |
| Pruebas con base de datos real | `pnpm test:int` crea un PostgreSQL 17 desechable en Docker, con el mismo guion de preparación, aplica las migraciones desde cero y lo destruye al terminar. Ya forma parte de `pnpm check`                                   |

**Tablas nuevas:** `core_tenants` y `core_outbox_events`. **Puntos de la API nuevos:** ninguno.
La empresa de cada petición se tomará de la sesión del usuario, que llega en B08.

## Cómo se probó

- `pnpm check` termina en verde: formato, análisis, tipos, fronteras, código sin uso, 78 pruebas
  unitarias, 36 pruebas con base de datos real, compilación y secretos.
- Cobertura: pruebas unitarias de la API, 94,9 % de líneas; pruebas con base de datos real del
  código de base de datos, 91,4 %. El mínimo exigido es 90 %.
- **Comprobé que las pruebas detectan fallas.** Quité a propósito la seguridad por fila de la
  bandeja de salida y le di a `app_user` permiso de borrar: 8 pruebas fallaron. Luego restauré la
  migración.
- Ensayé a mano todo el recorrido de la sección siguiente: base de datos en Docker, migraciones,
  semillas (dos veces), la API y `/health` en el navegador integrado, Prisma Studio y los comandos
  de aislamiento.

| Criterio de aceptación                                 | Prueba que lo demuestra                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una consulta sin contexto de empresa no devuelve filas | `test/int/tenant-isolation.int.test.ts`, «sin contexto de empresa»: 0 filas en las dos tablas aunque existan, y tampoco se puede escribir                                                                                                                 |
| La prueba de aislamiento con dos empresas pasa         | El mismo archivo: A solo ve lo suyo; no encuentra a B ni buscándola por su identificador; no puede modificarla (0 filas), ni crear filas a nombre de B, ni pasarle una fila suya. El contexto no queda pegado a la conexión cuando termina la transacción |
| Las migraciones aplican desde cero en una base vacía   | `test/int/support/global-setup.ts` las aplica sobre una base recién creada. `migrations.int.test.ts` comprueba que ninguna quedó pendiente ni falló, que repetirlas no cambia nada y que la base coincide con el modelo de Prisma                         |
| Permiso denegado                                       | `database-permissions.int.test.ts`: `app_user` no es dueño ni superusuario. No puede desactivar la seguridad por fila, borrar políticas, eliminar o vaciar tablas, borrar filas, crear tablas, leer el historial de migraciones ni cambiar de usuario     |
| Auditoría                                              | Aún no aplica: la tabla de auditoría llega en B11. `transaction.int.test.ts` prueba la garantía en la que se apoyará: si algo falla, no queda ni el cambio ni su evento                                                                                   |

Otras pruebas:

- `control-columns.int.test.ts`: versión, autoría, identificador inmutable, UUID v7 y reglas de
  integridad.
- `seed.int.test.ts`: semillas idempotentes.
- `tenant-context.test.ts` (unitaria): el contexto se valida y viaja como parámetro, nunca
  pegado al texto SQL.

## Cómo lo prueba usted, paso a paso

Use PowerShell en la carpeta del proyecto (`C:\Users\yeaze\arza-one`) y **abra Docker Desktop
antes de empezar**.

> **Importante sobre su equipo.** Tiene **PostgreSQL 18 instalado directamente en Windows**
> (servicio «postgresql-x64-18»), y ocupa el puerto 5432. No lo toqué. Por eso estos pasos usan
> el puerto **5433** para la base de datos de ARZA ONE.

### Preparación (una sola vez)

```bash
git checkout feat/b03-base-de-datos-contexto-de-empr
```

```bash
pnpm install
```

Abra el archivo `.env` con el Bloc de notas. Su `.env` sigue siendo el de B02, así que:

1. **Agregue estas tres líneas** al final. Elija una palabra cualquiera como contraseña local, por
   ejemplo `local123`. Es solo para su equipo:

   ```text
   POSTGRES_PASSWORD=local123
   APP_DB_PASSWORD=local123
   MIGRATION_DB_PASSWORD=local123
   ```

2. **Cambie las dos líneas de la base de datos** para que usen esa contraseña y el puerto 5433:

   ```text
   DATABASE_URL=postgresql://app_user:local123@localhost:5433/arza_one
   DATABASE_MIGRATION_URL=postgresql://migration_user:local123@localhost:5433/arza_one
   ```

### Crear la base de datos

```bash
docker run --rm -d --name arza-postgres --env-file .env -p 5433:5432 -v "${PWD}/infra/postgres/init:/docker-entrypoint-initdb.d:ro" postgres:17
```

Espere unos 10 segundos y aplique las migraciones:

```bash
pnpm db:migrate
```

Debe terminar con «All migrations have been successfully applied». Ahora cargue la semilla y las
dos empresas ficticias:

```bash
pnpm db:seed:demo
```

Debe decir «Semilla y datos ficticios listos.». Ejecútelo **otra vez**: dice lo mismo y no
duplica nada.

### En el navegador

1. **La API ve la base de datos.** Arranque la API y deje esa terminal abierta:

   ```bash
   pnpm --filter @arza/api dev
   ```

   Abra http://localhost:4000/health. Debe ver `"database":"up"`. Las colas y los archivos siguen en
   `down` hasta B06; por eso el estado general dice `degraded`.

2. **Sin empresa declarada no se ve nada.** Abra **otra** terminal de PowerShell en la carpeta del
   proyecto y ejecute:

   ```bash
   pnpm --filter @arza/api exec prisma studio
   ```

   Abra http://localhost:5555. Es una página para mirar las tablas. Haga clic en `core_tenants` y
   en `core_outbox_events`: las dos aparecen **vacías** («No results found»), aunque acabamos de
   crear tres empresas y dos eventos. Así debe ser: Prisma Studio no declara ninguna empresa y la
   base de datos no le muestra nada, aunque entra con el usuario dueño de las tablas.

   Cierre Prisma Studio con Ctrl+C en esa terminal.

### Ver el aislamiento entre empresas (en la terminal)

Estos comandos hablan directamente con la base de datos como `app_user`, el usuario de la API.
Ejecútelos uno por uno.

1. **Sin empresa:** debe responder `(0 rows)`.

   ```bash
   docker exec arza-postgres psql -U app_user -d arza_one -c "SELECT legal_name FROM core_tenants"
   ```

2. **Declarando «Demo Uno»:** debe mostrar solo «Empresa Demo Uno S.A.S.» y solo su evento.

   ```bash
   docker exec arza-postgres psql -U app_user -d arza_one -c "SELECT set_config('app.tenant_id', '01999a00-0000-7000-8000-0000000000d1', false)" -c "SELECT legal_name, tax_id FROM core_tenants" -c "SELECT event_type, payload FROM core_outbox_events"
   ```

3. **Declarando «Demo Dos»:** debe mostrar solo «Empresa Demo Dos S.A.S.».

   ```bash
   docker exec arza-postgres psql -U app_user -d arza_one -c "SELECT set_config('app.tenant_id', '01999a00-0000-7000-8000-0000000000d2', false)" -c "SELECT legal_name, tax_id FROM core_tenants"
   ```

4. **Permiso denegado:** intentar borrar todas las empresas debe responder
   `ERROR: permission denied for table core_tenants`.

   ```bash
   docker exec arza-postgres psql -U app_user -d arza_one -c "DELETE FROM core_tenants"
   ```

### Todas las verificaciones

Con Docker Desktop abierto (puede detener antes la API con Ctrl+C):

```bash
pnpm check
```

Tarda unos minutos y debe terminar sin errores. Al final verá «no leaks found».

### Al terminar

```bash
docker stop arza-postgres
```

El contenedor no guarda los datos: al volver a crearlo, repita «Crear la base de datos».

## Decisiones tomadas

Las ocho decisiones del plan las aprobó usted:

1. Prisma 7.10 estable, no la 8.0 de prueba.
2. Pruebas con base de datos real dentro de `pnpm check`.
3. NIT ficticio `900000000-0` para ARZA TECH.
4. Ningún punto nuevo en la API.
5. Autoría sin vínculo con la tabla de usuarios hasta B08.
6. Columnas de control mantenidas por la base de datos.
7. Auditoría desde B11.
8. Bibliotecas nuevas.

Además tomé estas:

1. **`app_user` no puede borrar filas.** El borrado es lógico (capítulo 12.1), así que ninguna
   tabla le concede `DELETE`. Si algún día un borrado físico se justifica (retención o supresión
   de datos personales), esa migración lo concede de forma explícita.
2. **La seguridad por fila aplica también al dueño de las tablas** (`FORCE ROW LEVEL SECURITY`).
   Ni siquiera `migration_user` ve datos sin declarar una empresa.
3. **Los datos semilla escriben como `app_user`, dentro de cada empresa**, igual que la API. Así
   también quedan sujetos a la seguridad por fila.
4. **Tres variables nuevas en `.env.example`:** `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y
   `MIGRATION_DB_PASSWORD`. Las usa el guion que crea la base de datos local. Le propongo
   agregarlas al anexo F en la próxima revisión del manual.
5. **Reglas de integridad en la base de datos**, además de las del código: razón social y NIT no
   vacíos, estado de empresa permitido y nombres de evento con el formato del numeral 13.3
   (`dominio.evento`).
6. **El código de los datos semilla vive en `apps/api/src/platform/database/seed/`**, no en
   `apps/api/prisma/` como sugiere el numeral 11.1. Así se compila y se prueba con el resto de la
   API sin agregar otra herramienta.
7. **La API revisa su configuración antes de cargar NestJS y Prisma.** Si falta una variable, se
   detiene en una fracción de segundo. Sin este cambio, la prueba de arranque quedaba al borde de
   su tiempo límite. No se cambió ningún límite de las pruebas.
8. **La cobertura de los datos semilla se mide en las pruebas con base de datos real**, con el
   mismo mínimo del 90 %. Solo allí pueden probarse; no se bajó ningún umbral.
9. **Testcontainers no ejecuta complementos de instalación opcionales** (`cpu-features`, `ssh2`,
   `protobufjs`). Sirven para conectarse a Docker por SSH, y aquí no se usa. Prisma sí descarga su
   motor de migraciones al instalarse; quedó autorizado en `pnpm-workspace.yaml`.
10. **Licencias:** `prisma`, `@prisma/client` y `@prisma/adapter-pg` tienen licencia Apache 2.0;
    `@testcontainers/postgresql`, MIT. Todas tienen mantenimiento activo.

## Pendientes

| Pendiente                                                                                                                 | Responsable      | Cuándo                      |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------- |
| Revisar y aprobar este bloque (ver el pull request)                                                                       | Director General | Ahora                       |
| Revisión externa (bloque crítico): seguridad por fila, permisos de `app_user` y la migración                              | Revisor externo  | Antes de integrar a main    |
| Agregar `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y `MIGRATION_DB_PASSWORD` al anexo F                                       | Director General | Próxima revisión del manual |
| Decidir si se conserva el PostgreSQL 18 instalado en Windows. Si se desinstala, se puede usar el puerto 5432              | Director General | Cuando quiera               |
| Fijar la empresa de cada petición a partir de la sesión del usuario (paso 6 del numeral 13.1)                             | Claude Code      | B08                         |
| Vincular `created_by` y `updated_by` con `iam_users`                                                                      | Claude Code      | B08                         |
| Publicar los eventos de la bandeja de salida desde el worker. Necesita leer las de todas las empresas de forma controlada | Claude Code      | B06                         |
| Base de datos con datos persistentes y `pnpm infra:up` / `pnpm infra:reset` con Docker Compose                            | Claude Code      | B06                         |
| Que `/health` revise las colas por la conexión compartida                                                                 | Claude Code      | B06                         |
| Probar las migraciones «sobre la versión anterior» en la integración continua (aún no hay versión anterior)               | Claude Code      | B05                         |
| Actualizar a Prisma 8 cuando salga la versión estable                                                                     | Claude Code      | Cuando salga                |
