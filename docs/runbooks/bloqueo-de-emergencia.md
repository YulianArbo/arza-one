# Bloqueo de emergencia

Qué hacer si se sospecha un acceso indebido, una cuenta robada o un ataque en curso (numeral 15.6,
PR-TEC-004; bloque B44). Del más suave al más fuerte. Anote cada paso y su hora: el registro sirve
para el informe del incidente.

## 1. Una cuenta comprometida

En la plataforma, como administrador: **Administración → Usuarios →** la persona:

1. **Bloquear la cuenta** (no puede volver a entrar).
2. **Cerrar todas sus sesiones** (sale de inmediato de todos sus equipos).
3. Si tenía segundo factor: **Reiniciar el segundo factor**.
4. Revisar en **Auditoría → Seguridad** y **Auditoría → Eventos** qué hizo esa cuenta y desde
   dónde.

Todo queda en la auditoría y avisa a Administración y Dirección.

## 2. Varias cuentas o no se sabe cuáles

Hay que cerrar **todas las sesiones de la empresa**: todos deben volver a entrar con contraseña y
segundo factor. La API ya tiene esta acción (`POST /v1/sessions/actions/revoke-all`, con auditoría
y alerta), pero **aún no tiene botón en la pantalla** (pendiente registrado en el cierre de B44).
Mientras tanto, el responsable técnico la ejecuta en el servidor y anota en la bitácora la hora y
el motivo (este camino no deja evento en la auditoría de la plataforma):

```bash
d=/srv/arza-one; sudo -u deploy docker compose --project-name arza-one-production --file $d/current/infra/compose/production.yml --env-file $d/.env --env-file $d/current/release.env \
  exec -T postgres psql --username postgres --dbname arza_one \
  --command "UPDATE iam_sessions SET revoked_at = now(), revoked_reason = 'remote_revoke' WHERE revoked_at IS NULL"
```

Pida a las personas afectadas cambiar su contraseña.

## 3. Detener la plataforma

Si el ataque sigue o hay riesgo para los datos, apague la entrada desde el servidor. Los datos
quedan intactos y las copias siguen funcionando:

```bash
d=/srv/arza-one; c="sudo -u deploy docker compose --project-name arza-one-production --file $d/current/infra/compose/production.yml --env-file $d/.env --env-file $d/current/release.env"
$c stop caddy          # nadie entra desde internet (sitio, aplicación, portal y API)
```

Publique un aviso en la página de estado (Uptime Kuma → **Maintenance**). Para volver: `$c start
caddy`.

## 4. Cerrar también la administración del servidor

Si se sospecha del propio servidor: en la consola del proveedor (con segundo factor), cierre el
puerto SSH en el cortafuegos del proveedor o apague el servidor. Las copias externas no dependen de
él: se puede restaurar en un servidor limpio ([restauracion.md](restauracion.md), caso 2).

## Después

1. Rote los secretos que pudieron quedar expuestos ([rotacion-de-secretos.md](rotacion-de-secretos.md)).
2. Exporte la auditoría del periodo afectado (**Auditoría → Exportar**).
3. Registre el incidente en Proyectos (incidentes) y, si comprometió datos personales, en Privacidad:
   el Oficial de Protección de Datos lo reporta a la Superintendencia de Industria y Comercio dentro
   de los 15 días hábiles siguientes (numeral 15.6).
