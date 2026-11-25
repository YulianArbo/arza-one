# Rotación de secretos

Cómo cambiar las contraseñas y llaves de producción (capítulo 22: cada seis meses y ante cualquier
retiro de una persona con acceso; bloque B44). Todas viven en `/srv/arza-one/.env` del servidor y en
su copia del gestor de contraseñas. Después de cada cambio: **actualice la copia del gestor** y anote
la rotación en la bitácora del servidor.

`c` es el comando de compose de producción (vea [atencion-de-alertas.md](atencion-de-alertas.md)).
Genere cada valor nuevo con `openssl rand -hex 32` (o `-hex 24` donde se indica).

| Secreto                                     | Cómo se rota                                                                                                                                                                                     | Efecto                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `CSRF_SECRET`                               | Cambiar el valor y `$c up --detach api`                                                                                                                                                          | Las pantallas abiertas piden recargar                    |
| `APP_DB_PASSWORD` / `MIGRATION_DB_PASSWORD` | `$c exec postgres psql -U postgres -c "ALTER ROLE app_user PASSWORD '<nuevo>'"` (o `migration_user`), cambiar el valor y `$c up --detach api worker`                                             | Unos segundos sin servicio                               |
| `VALKEY_PASSWORD`                           | Cambiar el valor y `$c up --detach valkey api worker`                                                                                                                                            | Unos segundos sin servicio; los trabajos esperan         |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` (Garage)  | Crear una llave nueva en Garage (`$c exec garage /garage key create`, `key allow --read --write --owner`), poner sus valores y `$c up --detach api worker`; luego borrar la vieja (`key delete`) | Ninguno si se sigue el orden                             |
| `MONITOR_TOKEN`                             | Cambiar el valor, `$c up --detach api` y actualizar la cabecera del monitor `/ops/status` en Uptime Kuma                                                                                         | Una alerta falsa si se tarda en actualizar Uptime Kuma   |
| `GLITCHTIP_DSN`                             | En GlitchTip, **Settings → Client Keys**: crear una nueva, ponerla y `$c up --detach api worker`; borrar la vieja                                                                                | Ninguno                                                  |
| `SMTP_PASSWORD`                             | Cambiarla en el proveedor de correo, poner la nueva y `$c up --detach worker`                                                                                                                    | Los correos esperan en la cola                           |
| `PDF_SEAL_PKCS12` / `PDF_SEAL_PASSPHRASE`   | Al renovar el certificado: `base64 -w 0 nuevo.p12`, poner los valores y `$c up --detach worker`                                                                                                  | Los PDF firmados desde ese momento llevan el sello nuevo |
| `BACKUP_S3_KEY` / `BACKUP_S3_SECRET`        | Crear una llave nueva en el proveedor del depósito, ponerla, `$c up --detach postgres` y probar con `backup.sh db-diff`; borrar la vieja                                                         | Un reinicio corto de la base                             |
| Llaves SSH (administrador y despliegue)     | Agregar la nueva en `~/.ssh/authorized_keys` del usuario, probar que entra, borrar la vieja; la del despliegue se actualiza también en el secreto `PRODUCTION_SSH_KEY` de GitHub                 | Ninguno                                                  |

## Secretos que no se rotan con un cambio simple

- **`BACKUP_PASSWORD`** (llave de las copias): las copias ya guardadas siguen cifradas con la llave
  vieja. Solo se cambia si se sospecha que se filtró: se crea un depósito nuevo con la llave nueva,
  se saca una copia completa allí y se conserva la llave vieja (gestor y sobre) mientras existan
  copias viejas que se puedan necesitar.
- **`FIELD_ENCRYPTION_KEY`** (cifrado de campos sensibles, como los secretos del segundo factor): los
  datos ya cifrados se descifran con ella. Hoy no existe el procedimiento automático para volver a
  cifrarlos con una llave nueva (pendiente registrado en el cierre de B44). Si se sospecha una
  filtración, trátelo como incidente (PR-TEC-004).
- **`GARAGE_RPC_SECRET`** y **`GARAGE_ADMIN_TOKEN`**: solo los usa Garage dentro del servidor; se
  cambian con Garage detenido (`$c stop garage`, cambiar, `$c up --detach garage`).
