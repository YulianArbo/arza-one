# Servidor de producción

Guía para preparar el servidor de producción y conectarlo con GitHub (numerales 10.1 a 10.6; bloque
B44). Se hace **una sola vez**. Antes, prepare el servidor de vigilancia
([servidor-de-vigilancia.md](servidor-de-vigilancia.md)): producción le envía sus avisos.

## Cómo queda el servidor

```text
Internet ──► 80 / 443 ──► Caddy (certificados TLS, HTTPS obligatorio)
                             ├─ https://[dominio]           → redirige a www
                             ├─ https://www.[dominio]       → sitio público (web)
                             ├─ https://app.[dominio]       → aplicación interna (web, /app)
                             ├─ https://clientes.[dominio]  → portal del cliente (web, /portal)
                             └─ https://api.[dominio]       → API
           22 (SSH, solo con llave) ──► administración y despliegues

Red interna de Docker: API, worker, PostgreSQL (con pgBackRest), Valkey, Garage, Gotenberg y
ClamAV. Salen a internet solo: Caddy (certificados), el worker (correo), PostgreSQL y restic
(copias al depósito externo) y ClamAV (firmas de virus).
```

Lo mismo que el servidor de pruebas (SSH solo con llave, sin root, fail2ban, cortafuegos con 80, 443
y SSH, actualizaciones automáticas, reloj en UTC; vea [servidor-de-pruebas.md](servidor-de-pruebas.md)),
más:

| Control                          | Cómo se cumple                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Copias cifradas fuera (10.5)     | pgBackRest (base) y restic (archivos) a un depósito S3 de **otro proveedor**, cifradas con `BACKUP_PASSWORD` |
| RPO de 15 minutos (10.5)         | PostgreSQL entrega cada archivo de cambios a pgBackRest, como máximo cada 5 minutos                          |
| Copias programadas (10.5)        | Temporizadores del servidor: completa los domingos, diferencial a diario, mensual, anual y archivos a diario |
| Vigilancia (10.7)                | Avisos al servidor de vigilancia: copias, procesador, memoria y disco; errores a GlitchTip                   |
| Despliegue con aprobación (10.6) | Solo el usuario autorizado, solo versiones vX.Y.Z y dentro de la ventana de publicación                      |

## Paso 1. Contratar el servidor, el depósito de copias y el dominio

1. **Servidor:** 4 núcleos, 8 GB, 160 GB SSD, Ubuntu Server 24.04 LTS, centro de datos con
   ISO/IEC 27001 y acuerdo de tratamiento de datos (numeral 10.2). Opciones en
   [proveedores-de-servidor-y-dominio.md](proveedores-de-servidor-y-dominio.md). Active el segundo
   factor en la consola del proveedor.
2. **Depósito de copias (decisión 4 de B44):** recomendamos Backblaze B2
   (https://www.backblaze.com/cloud-storage); también sirven Wasabi o Cloudflare R2. Debe ser **otro
   proveedor** distinto al del servidor. Cree un depósito privado (por ejemplo `arza-one-copias`) y
   una llave de aplicación solo para ese depósito. Anote: dirección (endpoint), región, nombre, llave
   y secreto.
3. **Datos fuera de Colombia:** si el servidor o el depósito están fuera del país, firme el contrato
   de transmisión internacional y declárelo en la política PL-DG-002 (Decreto 1074 de 2015).

## Paso 2. Apuntar el dominio

En el administrador de registros (DNS) del dominio cree registros **A** hacia la dirección del
servidor para: `@` (el dominio solo), `www`, `app`, `clientes` y `api`. Configure el correo con SPF,
DKIM y DMARC según su proveedor de correo (numeral 10.4).

## Paso 3. Llave de los despliegues

Igual que en pruebas ([servidor-de-pruebas.md](servidor-de-pruebas.md), paso 3), pero una llave
**nueva** solo para producción.

## Paso 4. Preparar el servidor

Entre por SSH con el usuario que le dio el proveedor y ejecute:

```bash
git clone https://github.com/<organización>/arza-one.git && cd arza-one/infra/server
sudo bash provision.sh --role production --admin <su usuario> \
  --admin-key "<su llave pública>" --deploy-key "<llave pública de los despliegues>" \
  --domain <su dominio, por ejemplo arzatech.co> --email <correo para los certificados>
```

Al final el guion muestra **dos llaves que no se vuelven a mostrar**. Guárdelas en el gestor de
contraseñas:

- `BACKUP_PASSWORD`: la llave de las copias. Sin ella **no se puede restaurar nada**. Guárdela
  también en sobre sellado en poder del Director General (numeral 10.5).
- `MONITOR_TOKEN`: la llave con la que Uptime Kuma lee `/ops/status`.

## Paso 5. Completar el archivo del servidor

Como administrador, edite `/srv/arza-one/.env` (`sudo -u deploy nano /srv/arza-one/.env`) y llene
las líneas vacías:

| Variable                                                       | Qué poner                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PUBLIC_SITE_TAX_ID`                                           | NIT de ARZA TECH S.A.S. (el que está en Administración)                                         |
| `SMTP_*`, `MAIL_FROM`                                          | Datos del proveedor de correo; remitente del dominio (por ejemplo `ARZA ONE <no-responder@…>`)  |
| `PDF_SEAL_PKCS12`, `PDF_SEAL_PASSPHRASE`                       | Certificado de la empresa (.p12) en una línea: `base64 -w 0 certificado.p12`, y su clave        |
| `BACKUP_S3_*`                                                  | Los datos del depósito del paso 1                                                               |
| `FILES_BACKUP_REPOSITORY`                                      | `s3:https://<endpoint>/<depósito>/archivos`                                                     |
| `GLITCHTIP_DSN`                                                | La dirección del proyecto en GlitchTip ([servidor-de-vigilancia.md](servidor-de-vigilancia.md)) |
| `BACKUP_PUSH_URL_DB`, `BACKUP_PUSH_URL_FILES`, `HOST_PUSH_URL` | Las direcciones «push» de los monitores de Uptime Kuma                                          |

**Guarde una copia del archivo completo en el gestor de contraseñas.** Para restaurar en un servidor
nuevo hacen falta estas mismas contraseñas: las de la base de datos y la llave de Garage viajan
dentro de las copias.

## Paso 6. Conectar GitHub

En GitHub, **Settings → Environments → New environment**, cree el ambiente `produccion` con:

| Tipo     | Nombre                       | Valor                                                                         |
| -------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Secreto  | `PRODUCTION_SSH_KEY`         | La llave **privada** de los despliegues (paso 3)                              |
| Secreto  | `PRODUCTION_SSH_KNOWN_HOSTS` | Las líneas de huella que mostró `provision.sh`, con la dirección del servidor |
| Variable | `PRODUCTION_HOST`            | Dirección del servidor                                                        |
| Variable | `PRODUCTION_DOMAIN`          | El dominio raíz (por ejemplo `arzatech.co`)                                   |
| Variable | `PRODUCTION_SSH_PORT`        | Solo si no es 22                                                              |

Y en **Settings → Secrets and variables → Actions → Variables** (del repositorio):

| Variable              | Valor                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| `PRODUCTION_APPROVER` | Su usuario de GitHub: **solo** ese usuario puede publicar en producción (decisión 3) |
| `PRODUCTION_HOST`     | La misma dirección del servidor (el primer paso del flujo la revisa)                 |
| `PRODUCTION_PLATFORM` | Solo si el servidor es ARM: `linux/arm64`                                            |

Si más adelante contrata GitHub Pro, active además en el ambiente `produccion` la regla **Required
reviewers** con su usuario: GitHub pedirá su aprobación antes de cada despliegue.

## Paso 7. Primera publicación

Vea [despliegue-y-reversion.md](despliegue-y-reversion.md), «Publicar en producción». Después:

1. Cree el administrador inicial con el comando de invitación (como en pruebas).
2. Corra la primera copia completa a mano y compruebe que llegó al depósito:
   ```bash
   sudo systemctl start arza-backup@db-full arza-backup@files
   sudo -u deploy bash /srv/arza-one/current/infra/backup/backup.sh status
   ```
3. Haga el ensayo de alertas de [atencion-de-alertas.md](atencion-de-alertas.md) y el primer ensayo
   de restauración de [restauracion.md](restauracion.md).

## Revisar el servidor en cualquier momento

```bash
sudo bash /srv/arza-one/current/infra/server/verify.sh <su usuario>   # endurecimiento
systemctl list-timers 'arza-*'                                        # próximas copias
tail -n 20 /srv/arza-one/backups/copias.log                           # resultado de las copias
```
