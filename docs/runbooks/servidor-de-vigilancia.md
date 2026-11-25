# Servidor de vigilancia (Uptime Kuma y GlitchTip)

Guía para preparar el servidor que vigila producción y recibe sus errores (numeral 10.7, ADR-026,
bloque B44). Vive **fuera** del servidor de producción: si producción se cae por completo, desde aquí
se sigue avisando. Se hace una sola vez, antes de preparar producción.

## Qué hay en este servidor

| Dirección              | Qué es                                      | Quién entra                                       |
| ---------------------- | ------------------------------------------- | ------------------------------------------------- |
| `estado.[dominio]`     | Página de estado pública (numeral 10.4)     | Cualquiera                                        |
| `vigilancia.[dominio]` | Tablero de Uptime Kuma: monitores y alertas | Responsable técnico (usuario, clave y 2.º factor) |
| `errores.[dominio]`    | GlitchTip: errores de la API y del worker   | Responsable técnico (usuario y clave)             |

## Paso 1. Servidor y dominio

Un servidor pequeño (2 núcleos, 2 a 4 GB, Ubuntu Server 24.04), de **otro proveedor o región** que
producción. En el DNS cree registros A hacia él para `estado`, `vigilancia` y `errores`.

## Paso 2. Preparar el servidor

```bash
git clone https://github.com/<organización>/arza-one.git && cd arza-one/infra/server
sudo bash provision.sh --role monitoring --admin <su usuario> \
  --admin-key "<su llave pública>" --deploy-key "<otra llave pública>" \
  --domain <su dominio> --email <correo para los certificados>
```

Complete en `/srv/arza-vigilancia/.env` el correo de las alertas (`ALERT_FROM` y
`ALERT_EMAIL_URL`, por ejemplo `smtp+tls://usuario:clave@smtp.proveedor.com:587`) y guarde una copia
del archivo en el gestor de contraseñas. Luego encienda los servicios:

```bash
cd /srv/arza-vigilancia
sudo -u deploy docker compose --file infra/compose/monitoring.yml --env-file .env run --rm glitchtip-migrate
sudo -u deploy docker compose --file infra/compose/monitoring.yml --env-file .env up --detach
```

## Paso 3. Uptime Kuma

Abra `https://vigilancia.[dominio]`, cree el usuario administrador y active el segundo factor
(**Settings → Security**).

**Notificaciones** (**Settings → Notifications**): cree dos y márquelas «por defecto»:

1. **Correo (SMTP)** al responsable técnico.
2. **Telegram** (decisión 7 de B44): cree un bot con @BotFather, copie su token, escríbale un mensaje
   y obtenga el número del chat como explica la misma pantalla de Uptime Kuma.

**Monitores** (numeral 10.7). Para todos: intervalo de 30 segundos y **1 reintento** (alerta a la
segunda falla seguida, dentro del minuto):

| Monitor                            | Tipo                    | Dirección / ajuste                                                                                   |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Sitio público                      | HTTP(s)                 | `https://www.[dominio]/healthz`                                                                      |
| Aplicación interna                 | HTTP(s)                 | `https://app.[dominio]/app` (acepta 200 a 399)                                                       |
| Portal del cliente                 | HTTP(s)                 | `https://clientes.[dominio]/portal` (acepta 200 a 399)                                               |
| API                                | HTTP(s) - Palabra clave | `https://api.[dominio]/health`, palabra `"ok"`                                                       |
| Tiempos, errores y colas de la API | HTTP(s)                 | `https://api.[dominio]/ops/status`, cabecera `Authorization: Bearer <MONITOR_TOKEN>`; intervalo 60 s |
| Copias de la base                  | Push                    | Intervalo del latido: 93 600 s (26 horas)                                                            |
| Copias de los archivos             | Push                    | Intervalo del latido: 93 600 s (26 horas)                                                            |
| Servidor de producción             | Push                    | Intervalo del latido: 180 s                                                                          |
| Vencimiento del dominio            | Push                    | Intervalo del latido: 93 600 s                                                                       |

En los cuatro monitores HTTP active **Certificate Expiry Notification** y en **Settings →
Notifications → TLS Certificate Expiry** deje solo **20 días** (numeral 10.7).

Cada monitor «Push» muestra una dirección secreta. Cópielas en el `.env` de producción
(`BACKUP_PUSH_URL_DB`, `BACKUP_PUSH_URL_FILES`, `HOST_PUSH_URL`) y la del dominio en el `.env` de
este servidor (`DOMAIN_PUSH_URL`).

**Página de estado** (**Status Pages → New**): nombre «ARZA ONE», dirección `arza`, dominio
`estado.[dominio]`; agregue los cuatro monitores HTTP (sin el de `/ops/status`).

## Paso 4. GlitchTip

1. Cree el primer usuario desde la consola (el registro abierto está apagado):
   ```bash
   sudo -u deploy docker compose --file infra/compose/monitoring.yml --env-file .env \
     exec glitchtip ./manage.py createsuperuser
   ```
2. En `https://errores.[dominio]` cree la organización «ARZA TECH» y un proyecto «arza-one»
   (plataforma Node). Copie su **DSN** al `GLITCHTIP_DSN` del `.env` de producción.
3. En el proyecto, **Settings → Alerts**: alerta por **correo** con cada error **nuevo** (numeral
   10.7). La tasa de errores sobre 1 % la vigila Uptime Kuma con `/ops/status`.

## Mantenimiento

- Actualizar las imágenes: cambie la versión en `infra/compose/monitoring.yml` (por pull request),
  copie el archivo al servidor y repita `run --rm glitchtip-migrate` y `up --detach`.
- GlitchTip guarda los errores 90 días. Uptime Kuma guarda su configuración en el volumen
  `uptime-kuma-data`: después de cambiar monitores, exporte una copia (**Settings → Backup**) al
  gestor de contraseñas.
