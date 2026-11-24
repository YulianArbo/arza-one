# Atención de alertas

Qué hacer con cada alerta del numeral 10.7 (bloque B44) y cómo ensayarlas todas. Las alertas llegan
por correo y Telegram desde Uptime Kuma ([servidor-de-vigilancia.md](servidor-de-vigilancia.md)),
por correo desde GitHub/GlitchTip, y las de seguridad por correo desde la misma plataforma.

Cada alerta atendida se anota en RE-TEC-002 (bitácora del responsable técnico). Si afecta a usuarios
por más de 15 minutos, publique un aviso en la página de estado (Uptime Kuma → **Maintenance**).

## Alertas y qué hacer

| Alerta                                                                                                              | De dónde llega                                       | Qué hacer primero                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sitio, aplicación, portal o API caídos** (2 fallas en 1 min)                                                      | Uptime Kuma                                          | Entrar al servidor y ver `ps` (vea [despliegue-y-reversion.md](despliegue-y-reversion.md), «Ver el estado»). Si un servicio está caído: `up --detach`. Si fue tras un despliegue, volver a la versión anterior. Si el servidor no responde: consola del proveedor; si no vuelve, [restauracion.md](restauracion.md), caso 2 |
| **Error nuevo**                                                                                                     | GlitchTip (correo)                                   | Abrir el error en `errores.[dominio]`: dice la ruta, la versión y el identificador de correlación. Buscarlo en los registros de la API. Radicar en la mesa de ayuda (M08, categoría «ARZA ONE»)                                                                                                                             |
| **Tasa de errores sobre 1 %** (`error_rate`)                                                                        | Uptime Kuma (`/ops/status`)                          | Igual que el anterior; además revisar si coincide con un despliegue reciente y, si es así, volver a la versión anterior                                                                                                                                                                                                     |
| **API lenta** (`slow_api`: percentil 95 sobre 800 ms)                                                               | Uptime Kuma (`/ops/status`)                          | Revisar procesador y memoria (`docker stats`). Si es sostenido, revisar las consultas lentas y la capacidad (numeral 10.2: ampliar al 70 % sostenido)                                                                                                                                                                       |
| **Colas llenas** (`queue_backlog`, más de 100 en espera)                                                            | Uptime Kuma (`/ops/status`)                          | Revisar que el worker esté vivo (`ps`, `logs worker`). Si está caído: `up --detach worker`                                                                                                                                                                                                                                  |
| **Trabajos fallidos** (`queue_failed`, más de 100)                                                                  | Uptime Kuma (`/ops/status`)                          | `logs --tail 200 worker` para ver el motivo (correo, antivirus, Gotenberg). Corregir la causa; los fallidos se borran solos a los 30 días                                                                                                                                                                                   |
| **Procesador o memoria al 80 % por 15 min; disco al 75 %**                                                          | Uptime Kuma (servidor, «push»)                       | `df -h`, `docker system df`, `docker stats`. Disco: `docker image prune --all --filter until=720h`; revisar `/srv/arza-one/backups` (copias previas a despliegues). Si persiste, ampliar el servidor                                                                                                                        |
| **Copia fallida o con más de 26 horas**                                                                             | Uptime Kuma (copias, «push»)                         | `tail /srv/arza-one/backups/copias.log` y `journalctl -u 'arza-backup@*' --since today`. Corregir (credenciales del depósito, espacio) y repetir: `sudo systemctl start arza-backup@db-full`                                                                                                                                |
| **Certificado a 20 días de vencer**                                                                                 | Uptime Kuma (monitores HTTP)                         | Caddy los renueva solo 30 días antes: si avisa, revisar `logs caddy` (DNS mal apuntado, puerto 80 cerrado)                                                                                                                                                                                                                  |
| **Dominio a 20 días de vencer**                                                                                     | Uptime Kuma (dominio, «push»)                        | Renovar en el registrador (y activar la renovación automática)                                                                                                                                                                                                                                                              |
| **Seguridad**: cuenta bloqueada por 5 intentos, ingreso de un administrador, cambio de permisos, exportación masiva | Correo de la plataforma a Administración y Dirección | Revisar en la plataforma **Auditoría → Seguridad** quién, cuándo y desde dónde. Si no fue legítimo: [bloqueo-de-emergencia.md](bloqueo-de-emergencia.md) y PR-TEC-004                                                                                                                                                       |

«Exportación masiva» (decisión 6 de B44): más de 500 registros en una sola exportación, o siempre que
se exporte la auditoría o los datos personales de un titular.

## Ensayo de alertas (antes de abrir producción y una vez al año)

Criterio del bloque B44: **todas las alertas se disparan en un ensayo**. Hágalo con el servidor de
vigilancia ya configurado, sobre producción antes de abrirla al público (o sobre pruebas, con
monitores equivalentes). Marque cada fila cuando llegue el correo **y** el mensaje de Telegram.

`c` es el comando de compose de producción:

```bash
d=/srv/arza-one; c="sudo -u deploy docker compose --project-name arza-one-production --file $d/current/infra/compose/production.yml --env-file $d/.env --env-file $d/current/release.env"
```

| #   | Alerta                    | Cómo provocarla                                                                                                                                    | Cómo volver                                | Llegó |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----- |
| 1   | Caída de la API           | `$c stop api` y esperar 1 minuto                                                                                                                   | `$c start api`                             | [ ]   |
| 2   | Caída del sitio y portal  | `$c stop web` y esperar 1 minuto                                                                                                                   | `$c start web`                             | [ ]   |
| 3   | Error nuevo (GlitchTip)   | En GlitchTip, proyecto «arza-one», botón **Send test event**; confirme el correo de error nuevo                                                    | —                                          | [ ]   |
| 4   | Colas / tiempos (`/ops`)  | En el monitor de `/ops/status`, cambie temporalmente la cabecera por una llave equivocada (responde 401 = caído)                                   | Restaurar la llave                         | [ ]   |
| 5   | Servidor (capacidad)      | `sudo -u deploy bash -c 'curl -s -G "$(sed -n s/^HOST_PUSH_URL=//p /srv/arza-one/.env)" --data-urlencode status=down --data-urlencode msg=ENSAYO'` | Esperar el siguiente minuto (vuelve solo)  | [ ]   |
| 6   | Copia fallida             | Igual que la fila 5 con `BACKUP_PUSH_URL_DB` (y luego `BACKUP_PUSH_URL_FILES`)                                                                     | `sudo systemctl start arza-backup@db-diff` | [ ]   |
| 7   | Copia con más de 26 horas | En Uptime Kuma, baje temporalmente el latido del monitor de copias a 60 s                                                                          | Volver a 93 600 s                          | [ ]   |
| 8   | Certificado               | En el monitor del sitio, suba temporalmente el aviso de certificado a 120 días                                                                     | Volver a 20 días                           | [ ]   |
| 9   | Dominio                   | Igual que la fila 5 con `DOMAIN_PUSH_URL` en el servidor de vigilancia                                                                             | `sudo systemctl start arza-domain-expiry`  | [ ]   |
| 10  | Seguridad                 | Con un usuario de prueba, cinco claves equivocadas; ingresar como administrador; cambiar un permiso; exportar la auditoría                         | Desbloquear y revertir el permiso          | [ ]   |

Anote el resultado (fecha, quién, filas que llegaron y demoras) en RE-TEC-002 y en el cierre del
bloque si es el primer ensayo.
