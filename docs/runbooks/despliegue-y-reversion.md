# Despliegue y reversión

Guía de operación del despliegue automático al ambiente de pruebas (numeral 10.6, capítulo 22;
bloque B07). Producción tendrá su propio flujo con aprobación del Director General (B44).

## Qué pasa al integrar un cambio a `main`

1. La integración continua revisa el commit ([integracion-continua.md](integracion-continua.md)).
2. Si todo queda en verde, arranca el flujo
   [**Despliegue a pruebas**](../../.github/workflows/despliegue-pruebas.yml):
   1. Construye las cuatro imágenes (web, API, worker y migraciones) y las publica en el registro
      privado de GitHub con el commit como nombre de versión.
   2. Entra al servidor por SSH con la llave de despliegue y sigue los pasos de
      [`deploy.ts`](../../infra/scripts/deploy/deploy.ts):

| #   | Paso                                                                         | Si falla                              |
| --- | ---------------------------------------------------------------------------- | ------------------------------------- |
| 1   | Sube los archivos de la versión a `/srv/arza-one/releases/<versión>`         | La versión anterior sigue encendida   |
| 2   | Descarga las imágenes                                                        | Igual                                 |
| 3   | Enciende base de datos, colas y archivos; prepara Garage                     | Igual                                 |
| 4   | **Copia la base de datos** a `/srv/arza-one/backups` (guarda las 10 últimas) | Igual                                 |
| 5   | Aplica las migraciones y los datos ficticios (Demo Uno y Demo Dos)           | Igual                                 |
| 6   | Cambia el enlace `/srv/arza-one/current` y enciende la versión nueva         | **Vuelve sola a la versión anterior** |
| 7   | Pruebas de humo desde GitHub, por internet                                   | **Vuelve sola a la versión anterior** |
| 8   | Prueba de aislamiento entre empresas en la base desplegada                   | **Vuelve sola a la versión anterior** |
| 9   | Registra el resultado y borra versiones viejas (guarda 5)                    | —                                     |

3. Al final revisa desde fuera que solo respondan los puertos 80, 443 y SSH.

### Pruebas de humo

| Prueba                                                                                    | Qué demuestra                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Sin la contraseña adicional responde 401 y «noindex»                                      | Permiso denegado y ambiente no indexable (numeral 10.4) |
| La bandeja de correo también pide la contraseña                                           | Igual, en `correo.pruebas.[dominio]`                    |
| HTTP redirige a HTTPS                                                                     | TLS obligatorio                                         |
| La web responde en `/healthz`                                                             | La web está viva                                        |
| La API responde «ok» en `/api/health`                                                     | Base de datos, colas y archivos responden               |
| `/api/version` reporta el commit desplegado y «staging»                                   | Se publicó la versión correcta                          |
| `app_user` no salta la seguridad por fila; sin empresa no ve ninguna; con la A no ve la B | Aislamiento entre empresas (ADR-007)                    |

Cada prueba se repite hasta 3 minutos: la primera vez Caddy tarda en obtener el certificado.

### Por qué la reversión no toca la base de datos

Las migraciones se escriben compatibles hacia atrás (expandir, migrar, contraer; la integración
continua lo exige, tarea 7). La versión anterior funciona con la base ya migrada, así que volver
atrás es solo encender las imágenes anteriores. Si alguna vez hiciera falta volver también la
base, está la copia del paso 4 (ver «Restaurar la copia» abajo).

## Dónde ver qué pasó

- **GitHub → Actions → Despliegue a pruebas**: cada ejecución, con el motivo si falló.
- **GitHub → Environments → pruebas** (en la portada del repositorio, «Deployments»): el historial
  de despliegues con fecha, commit y quién lo originó. Es el registro de auditoría de los
  despliegues mientras llega la auditoría de la plataforma (B11).
- **En el servidor**, la bitácora `/srv/arza-one/deployments.log`, una línea por despliegue:

  ```bash
  ssh suadmin@<IP> sudo tail -n 5 /srv/arza-one/deployments.log
  ```

  `"result":"deployed"` (publicada), `"rolled_back"` (falló y volvió sola a `previous`) o
  `"failed"` (falló antes de cambiar, o no había versión anterior a la cual volver).

Un despliegue revertido deja el flujo en **rojo** a propósito: alguien debe revisar el motivo.

## Operaciones a mano

Todas desde una terminal conectada al servidor: `ssh suadmin@<IP>`.

### Volver a desplegar el último commit de `main`

En GitHub: **Actions → Despliegue a pruebas → Run workflow**.

### Volver a una versión anterior a mano

```bash
ls -1t /srv/arza-one/releases
```

Escoja la versión (el commit) y, como `deploy`:

```bash
sudo -u deploy bash -c 'v=<versión>; d=/srv/arza-one; ln -sfn $d/releases/$v $d/current.next && mv -T $d/current.next $d/current && docker compose --project-name arza-one-staging --file $d/current/infra/compose/staging.yml --env-file $d/.env --env-file $d/current/release.env up --detach --wait --remove-orphans'
```

Si la imagen de esa versión ya se borró del servidor (más de 30 días), vuelva a ejecutar el flujo
de despliegue con ese commit desde GitHub.

### Ver el estado y los registros de los servicios

```bash
sudo -u deploy bash -c 'd=/srv/arza-one; docker compose --project-name arza-one-staging --file $d/current/infra/compose/staging.yml --env-file $d/.env --env-file $d/current/release.env ps'
```

Cambie `ps` por `logs --tail 100 api` (o `web`, `worker`, `caddy`) para ver los registros.

### Una migración falló a medias

Prisma marca la migración como fallida y no deja aplicar otras. La versión anterior sigue
encendida. Corrija la migración en un cambio nuevo; en pruebas (datos ficticios) lo más rápido es
restaurar la copia previa (abajo) y volver a desplegar.

### Restaurar la copia de la base

Solo en pruebas (datos ficticios). Detiene la API y el worker mientras restaura:

```bash
ls -1t /srv/arza-one/backups
```

```bash
sudo -u deploy bash -c 'd=/srv/arza-one; c="docker compose --project-name arza-one-staging --file $d/current/infra/compose/staging.yml --env-file $d/.env --env-file $d/current/release.env"; $c stop api worker && $c exec -T postgres pg_restore --username postgres --dbname arza_one --clean --if-exists < $d/backups/<archivo>.dump; $c start api worker'
```

## Ventanas de publicación

En pruebas se publica cada vez que se integra a `main`. Las ventanas del numeral 10.6 (martes a
jueves antes de las 4:00 p. m., nunca festivo ni víspera de festivo) aplican a producción: el flujo
las revisa solo y se niega fuera de ellas, salvo una corrección urgente de seguridad.

## Publicar en producción (B44)

Producción **nunca** se publica sola: la publica el Director General (el usuario de
`PRODUCTION_APPROVER`) sobre una versión etiquetada. Preparación una sola vez:
[servidor-de-produccion.md](servidor-de-produccion.md).

1. **Crear la versión.** En GitHub: **Releases → Draft a new release → Choose a tag**, escriba la
   versión nueva (por ejemplo `v1.0.0`) sobre `main`, genere las notas de versión con el botón
   **Generate release notes** y publíquela. Las notas son el registro del cambio para Calidad
   (numeral 10.6).
2. **Lanzar el despliegue.** **Actions → Despliegue a producción → Run workflow**: escriba la versión
   (`v1.0.0`). Marque «Corrección urgente de seguridad» solo si de verdad lo es: es lo único que
   permite publicar fuera de la ventana, y queda registrado.
3. **Qué hace el flujo:** revisa que usted sea el usuario autorizado y que la etiqueta exista;
   construye las cinco imágenes de esa etiqueta; revisa la ventana; en el servidor copia la base,
   aplica las migraciones y la semilla de la plataforma (nunca datos ficticios), enciende la versión
   nueva y hace las pruebas de humo de `www`, `app`, `clientes` y `api`. Si fallan, **vuelve sola** a
   la versión anterior y el flujo queda en rojo.
4. **Registro:** el historial queda en **Settings → Environments → produccion** y en el servidor
   (`/srv/arza-one/deployments.log`). Registre el cambio en el módulo de Calidad con el enlace de las
   notas de versión.

Las operaciones a mano de arriba sirven igual en producción cambiando `arza-one-staging` por
`arza-one-production` y `staging.yml` por `production.yml`. **Excepción:** en producción no use
`pg_restore` sobre la base: la restauración se hace con las copias externas
([restauracion.md](restauracion.md)), que no pierden los últimos minutos.
