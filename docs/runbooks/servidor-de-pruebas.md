# Servidor de pruebas

Guía para preparar el servidor del ambiente de pruebas y conectarlo con GitHub (numerales 10.1 a
10.4; bloque B07). Se hace **una sola vez**. Desde ese momento, cada cambio que se integra a `main`
se publica solo (ver [despliegue-y-reversion.md](despliegue-y-reversion.md)).

Antes de empezar, contrate el servidor y el dominio: [proveedores-de-servidor-y-dominio.md](proveedores-de-servidor-y-dominio.md).

## Cómo queda el servidor

```text
Internet ──► 80 / 443 ──► Caddy (certificados TLS, contraseña adicional, no indexable)
                             ├─ https://pruebas.[dominio]/       → web
                             ├─ https://pruebas.[dominio]/api/…  → API
                             └─ https://correo.pruebas.[dominio] → Mailpit (correo falso)
           22 (SSH, solo con llave) ──► administración y despliegues

Red interna de Docker, sin salida a internet: API, worker, PostgreSQL, Valkey, Garage,
Gotenberg, Mailpit. ClamAV sale a internet solo para actualizar sus firmas.
```

| Control (numeral 10.2)      | Cómo se cumple                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Solo 80, 443 y SSH          | Cortafuegos `ufw` con entrada denegada por defecto; solo Caddy publica puertos en Docker               |
| SSH con llave, sin root     | `PermitRootLogin no`, `PasswordAuthentication no`, solo dos usuarios permitidos, cuenta root bloqueada |
| Usuario nominal con sudo    | El administrador que usted escoja. El usuario `deploy` solo despliega: sin sudo, sin terminal          |
| fail2ban                    | Bloquea por una hora la dirección que falle 5 veces en 10 minutos                                      |
| Actualizaciones automáticas | `unattended-upgrades` diario; si una actualización lo pide, reinicia a las 4:00 a. m. (Bogotá)         |
| Reloj                       | NTP activo y el servidor en UTC                                                                        |
| TLS 1.2 o superior          | Caddy obtiene y renueva los certificados de Let's Encrypt; redirige HTTP a HTTPS                       |
| Contraseñas                 | Se generan **dentro del servidor** (`/srv/arza-one/.env`, solo legible por `deploy`) y no salen de él  |

## Paso 1. Crear el servidor en el proveedor

1. Cree un servidor con **Ubuntu Server 24.04 LTS**, al menos 8 GB de memoria, y anote su
   **dirección IP**.
2. El proveedor pide una **llave SSH** para entrar la primera vez. Si no tiene una, créela en su
   equipo (PowerShell o terminal):

   ```bash
   ssh-keygen -t ed25519 -C "su-nombre@arzatech"
   ```

   Acepte la ubicación propuesta y escriba una frase de seguridad. La llave pública es el archivo
   que termina en `.pub` (por ejemplo `C:\Users\<usted>\.ssh\id_ed25519.pub`): esa es la que se
   pega en el proveedor. La otra, la privada, nunca se comparte.

3. Active el **segundo factor** en la cuenta del proveedor.

## Paso 2. Apuntar el dominio al servidor

En el administrador de su dominio cree dos registros tipo **A** con la IP del servidor:

| Nombre           | Tipo | Valor           |
| ---------------- | ---- | --------------- |
| `pruebas`        | A    | IP del servidor |
| `correo.pruebas` | A    | IP del servidor |

Con DuckDNS basta con registrar el subdominio con la IP: los subdominios como `correo.` funcionan
solos. Con sslip.io no hay nada que crear.

## Paso 3. Crear la llave de los despliegues

GitHub necesita su propia llave, distinta de la suya, sin frase de seguridad:

```bash
ssh-keygen -t ed25519 -N "" -C "github-despliegue-pruebas" -f arza-despliegue
```

Quedan dos archivos: `arza-despliegue` (privada, irá a GitHub) y `arza-despliegue.pub` (pública,
irá al servidor). Guarde ambos en el gestor de contraseñas y bórrelos del equipo al terminar.

## Paso 4. Preparar el servidor

Desde la carpeta del proyecto, copie los guiones al servidor (cambie la IP; el usuario inicial
depende del proveedor: `root` en Hetzner y DigitalOcean, `ubuntu` en Oracle):

```bash
scp -r infra/server root@203.0.113.10:/tmp/arza-server
```

Entre al servidor y ejecute la preparación (todo en una línea; cambie los valores):

```bash
ssh root@203.0.113.10
```

```bash
sudo bash /tmp/arza-server/provision.sh --admin suadmin --admin-key "ssh-ed25519 AAAA… su-nombre@arzatech" --deploy-key "ssh-ed25519 AAAA… github-despliegue-pruebas" --domain pruebas.su-dominio.co --email sistemas@su-dominio.co
```

- `--admin`: el nombre de usuario con el que usted administrará el servidor (no puede ser `root`).
- `--admin-key`: el contenido de **su** llave `.pub`.
- `--deploy-key`: el contenido de `arza-despliegue.pub`.
- `--domain`: la dirección de pruebas. `--email`: correo para los avisos de los certificados.

Tarda unos 5 minutos. Al final verá:

1. La **contraseña adicional** del ambiente de pruebas (usuario `revisor`). Guárdela ya en el
   gestor de contraseñas: no se vuelve a mostrar.
2. La revisión final con cada control en `[ok]`.
3. La **huella del servidor** (líneas que empiezan con la IP). Cópielas: van a GitHub.

**Antes de cerrar esa sesión**, abra otra terminal y compruebe que entra con su usuario nuevo:
`ssh suadmin@203.0.113.10`. Desde ahora `root` ya no puede entrar por SSH. Luego borre los
guiones copiados: `sudo rm -rf /tmp/arza-server`.

## Paso 5. Conectar GitHub

En GitHub: **Settings → Secrets and variables → Actions**.

**Variables** (pestaña _Variables_, del repositorio):

| Nombre              | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `STAGING_HOST`      | IP del servidor. **Esta variable enciende el despliegue automático**  |
| `STAGING_DOMAIN`    | `pruebas.su-dominio.co`                                               |
| `STAGING_AUTH_USER` | `revisor`                                                             |
| `STAGING_PLATFORM`  | Solo si el servidor es ARM (Oracle): `linux/arm64`. Si no, no la cree |
| `STAGING_SSH_PORT`  | Solo si cambió el puerto de SSH. Si no, no la cree                    |

**Secretos del ambiente «pruebas»** (_Settings → Environments → pruebas_; si no existe, créelo con
ese nombre exacto):

| Nombre                    | Valor                                                      |
| ------------------------- | ---------------------------------------------------------- |
| `STAGING_SSH_KEY`         | Contenido completo del archivo `arza-despliegue` (privada) |
| `STAGING_SSH_KNOWN_HOSTS` | Las líneas de la huella del servidor del paso 4            |
| `STAGING_AUTH_PASSWORD`   | La contraseña adicional del paso 4                         |

Para el primer despliegue: **Actions → Despliegue a pruebas → Run workflow** (rama `main`). Tarda
unos 15 minutos la primera vez. Al terminar, abra `https://pruebas.su-dominio.co`: el navegador
pide el usuario `revisor` y la contraseña adicional.

## Revisar el servidor en cualquier momento

Cada versión desplegada lleva consigo el guion de revisión:

```bash
ssh suadmin@203.0.113.10 sudo bash /srv/arza-one/current/infra/server/verify.sh suadmin
```

Cada control debe decir `[ok]`. Antes del primer despliegue, use la copia del paso 4:
`sudo bash /tmp/arza-server/verify.sh suadmin`.

Además, cada despliegue revisa desde GitHub, desde fuera, que solo respondan 80, 443 y SSH
(paso «Solo 80, 443 y SSH abiertos» del flujo).

## Variables nuevas de cada bloque

Un servidor creado con una versión anterior de `generate-env.sh` no tiene las variables que
agregan los bloques siguientes, y el despliegue falla con `required variable ... is missing a
value`. Agréguelas **en el servidor**, sin copiar el archivo fuera de él:

| Bloque | Variable               | Para qué                                                  |
| ------ | ---------------------- | --------------------------------------------------------- |
| B09    | `FIELD_ENCRYPTION_KEY` | Llave del cifrado de campos (secretos del segundo factor) |

```bash
ssh suadmin@203.0.113.10 'sudo -u deploy sh -c "grep -q ^FIELD_ENCRYPTION_KEY= /srv/arza-one/.env || echo FIELD_ENCRYPTION_KEY=\$(openssl rand -hex 32) >> /srv/arza-one/.env"'
```

La llave se crea dentro del servidor y no se muestra. **No la cambie después**: los segundos
factores ya configurados dejarían de funcionar y habría que reiniciarlos
(`pnpm iam:reiniciar-segundo-factor`). El anexo F pide rotarla «con procedimiento»; ese
procedimiento todavía no existe (pendiente anotado en el cierre de B09).

B10 no agrega variables. Cada despliegue corre la semilla, que crea el catálogo de permisos y los
16 roles del sistema de cada empresa. Desde B10 cada pantalla exige su permiso, así que después del
primer despliegue con B10 hay que dar el rol de administrador a la primera persona, dentro del
servidor, con la misma forma de comando que usa el despliegue (cambie el correo; la persona debe
estar invitada):

```bash
ssh suadmin@203.0.113.10 'sudo -u deploy sh -c "docker compose --project-name arza-one-staging --file /srv/arza-one/current/infra/compose/staging.yml --env-file /srv/arza-one/.env --env-file /srv/arza-one/current/release.env run --rm --no-deps api node dist/modules/iam/interface/cli/assign-role-main.js --correo ana@demo-uno.test --rol ADMIN_PLATAFORMA"'
```

## Problemas frecuentes

| Síntoma                                                     | Causa y solución                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Host key verification failed` en GitHub                    | `STAGING_SSH_KNOWN_HOSTS` no tiene la huella correcta. Repítala con `ssh-keyscan <IP>` desde su equipo y compárela |
| `Permission denied (publickey)` en GitHub                   | `STAGING_SSH_KEY` no corresponde a la `--deploy-key` del paso 4. Cópiela completa, con las líneas BEGIN y END      |
| Las pruebas de humo fallan en «HTTP redirige a HTTPS» o TLS | El dominio todavía no apunta al servidor (paso 2) o el proveedor bloquea el puerto 80 en su propio cortafuegos     |
| Usted mismo quedó bloqueado por fail2ban                    | Espere una hora, o entre por la consola web del proveedor y ejecute `sudo fail2ban-client unban <su IP>`           |
| Perdió `/srv/arza-one/.env`                                 | Es un ambiente de datos ficticios: genere otro con `generate-env.sh` y borre los volúmenes (`docker volume prune`) |
