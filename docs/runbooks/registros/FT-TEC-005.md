# FT-TEC-005 — Ensayo de restauración de copias

Registro del ensayo mensual (primer lunes de cada mes) del numeral 10.5. Procedimiento:
[restauracion.md](../restauracion.md). Copie la tabla para cada ensayo y guárdelo en Documentos
(módulo M03) como registro del sistema de gestión.

| Campo                                    | Valor                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Fecha (dd/mm/aaaa)                       |                                                                       |
| Responsable                              |                                                                       |
| Dónde se restauró                        | Servidor de pruebas · servidor temporal · ensayo de GitHub (tarea 13) |
| Copia de la base usada                   | Etiqueta de pgBackRest (`backup.sh status`) y minuto restaurado       |
| Copia de archivos usada                  | Identificador de la instantánea de restic                             |
| Inicio y fin                             | hh:mm – hh:mm (hora de Colombia)                                      |
| Tiempo total                             | minutos (RTO: 240 minutos)                                            |
| Datos perdidos frente al momento elegido | minutos (RPO: 15 minutos la base, 24 horas los archivos)              |
| Resultado de `verify-restore.sh`         | Cadena de auditoría íntegra · aislamiento · API sana · cifras         |
| ¿Superado?                               | Sí · No                                                               |
| Observaciones y acciones                 |                                                                       |

## Ensayos registrados

| Fecha | Dónde | Tiempo total | ¿Superado? | Responsable |
| ----- | ----- | ------------ | ---------- | ----------- |
|       |       |              |            |             |
