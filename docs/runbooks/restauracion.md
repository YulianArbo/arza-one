# Restauración de copias

Cómo volver a poner en pie los datos de producción desde las copias externas (numeral 10.5, bloque
B44). Las copias las sacan solas los temporizadores del servidor
([servidor-de-produccion.md](servidor-de-produccion.md)); **una copia que no se ha restaurado no
cuenta como copia**: el ensayo mensual está al final.

## Qué hay en las copias

| Qué                      | Herramienta                              | Frecuencia                                                                                  | Se conserva                                                                 | Se pierde como máximo |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| Base de datos            | pgBackRest                               | Completa los domingos, diferencial a diario y cada archivo de cambios (al menos cada 5 min) | 30 días a cualquier minuto; una mensual por 12 meses; una anual por 10 años | 15 minutos (RPO)      |
| Archivos (Garage)        | restic                                   | Diaria (3:00 a. m.)                                                                         | 30 diarias y 12 mensuales                                                   | 24 horas (RPO)        |
| Configuración            | Repositorio                              | En cada cambio                                                                              | Todo el historial                                                           | Nada                  |
| Contraseñas del servidor | Gestor de contraseñas (copia del `.env`) | En cada cambio                                                                              | —                                                                           | Nada                  |

Todo viaja y se guarda **cifrado** con `BACKUP_PASSWORD`. Sin esa llave (gestor de contraseñas y
sobre sellado del Director General) no se puede restaurar nada.

Ver las copias que hay:

```bash
sudo -u deploy bash /srv/arza-one/current/infra/backup/backup.sh status
```

## Caso 1. Se borró o dañó información (volver a un minuto)

1. Decida el minuto **anterior** al daño, en hora UTC (Colombia + 5 horas). Ejemplo: si el error
   ocurrió el 24/11/2026 a las 10:32 a. m. de Colombia, use `2026-11-24 15:30:00`.
2. Avise por la página de estado que habrá una suspensión.
3. Restaure (detiene la aplicación mientras tanto):
   ```bash
   sudo -u deploy bash /srv/arza-one/current/infra/backup/restore.sh db '2026-11-24 15:30:00'
   ```
4. Compruebe: `sudo -u deploy bash /srv/arza-one/current/infra/backup/verify-restore.sh`.

Todo lo que se hizo después de ese minuto se pierde. Si solo hay que recuperar unos registros,
restaure primero en el **servidor de pruebas** (caso 3) y copie de allí solo lo necesario.

## Caso 2. Se perdió el servidor completo

Tiempo objetivo (RTO): **4 horas** para la aplicación y la API; 8 horas para el portal y el sitio.

1. Contrate un servidor nuevo y prepárelo con `provision.sh --role production`
   ([servidor-de-produccion.md](servidor-de-produccion.md), pasos 1 a 4). Apunte el DNS a la
   dirección nueva.
2. **Reemplace** `/srv/arza-one/.env` por la copia del gestor de contraseñas (las contraseñas de la
   base y la llave de Garage viven dentro de las copias: con unas nuevas no funcionan).
3. Despliegue la última versión publicada (`Actions → Despliegue a producción`, con la misma
   etiqueta). El despliegue crea una base vacía; la restauración la reemplaza.
4. Restaure todo:
   ```bash
   sudo -u deploy bash /srv/arza-one/current/infra/backup/restore.sh all
   sudo -u deploy bash /srv/arza-one/current/infra/backup/verify-restore.sh
   ```
5. Actualice en GitHub `PRODUCTION_HOST` y `PRODUCTION_SSH_KNOWN_HOSTS`, y registre el simulacro o
   el incidente en FT-TEC-006.

## Caso 3. Restaurar en el servidor de pruebas

Para revisar datos sin tocar producción. **Atención:** son datos reales; después del ensayo se
borran. En el servidor de pruebas, con una carpeta aparte y la copia del `.env` de producción:

```bash
export ARZA_BASE_DIR=/srv/ensayo-restauracion ARZA_PROJECT=arza-one-ensayo
# copie allí el .env de producción y la carpeta releases/<versión> con el enlace current
bash $ARZA_BASE_DIR/current/infra/backup/restore.sh all
bash $ARZA_BASE_DIR/current/infra/backup/verify-restore.sh
```

Al terminar, borre todo: `docker compose --project-name arza-one-ensayo ... down --volumes` y la
carpeta.

## Ensayo mensual (primer lunes de cada mes) — FT-TEC-005

1. Siga el caso 3 en el servidor de pruebas (o en un servidor temporal).
2. Anote en [FT-TEC-005](registros/FT-TEC-005.md): fecha, quién, copias usadas, tiempo total,
   resultado de `verify-restore.sh` y observaciones.
3. Además, cada cambio de la infraestructura repite el ensayo completo en GitHub (tarea 13 de la
   integración continua): despliega, saca todas las copias, borra todo, restaura y mide el tiempo.

## Simulacro anual de pérdida total — FT-TEC-006

Una vez al año, siga el caso 2 con un servidor temporal (sin cambiar el DNS de producción) y
registre el resultado en [FT-TEC-006](registros/FT-TEC-006.md).
