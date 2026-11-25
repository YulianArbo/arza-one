# FT-TEC-006 — Simulacro de pérdida total y de incidente de seguridad

Registro del simulacro anual (capítulo 22). Procedimientos: [restauracion.md](../restauracion.md)
(caso 2) y [bloqueo-de-emergencia.md](../bloqueo-de-emergencia.md). Guárdelo en Documentos (M03).

| Campo                                        | Valor                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Fecha (dd/mm/aaaa)                           |                                                                             |
| Participantes                                | Dirección · responsable técnico · otros                                     |
| Escenario                                    | Pérdida total del servidor · cuenta comprometida · otro                     |
| Servidor usado                               | Temporal (sin cambiar el DNS de producción) · otro                          |
| ¿Se tuvo a mano el `.env` y BACKUP_PASSWORD? | Sí · No (desde el gestor de contraseñas / sobre sellado)                    |
| Hora de inicio y de servicio restablecido    | hh:mm – hh:mm (hora de Colombia)                                            |
| Tiempo total frente al RTO                   | minutos (RTO: 4 horas la aplicación y la API; 8 horas el portal y el sitio) |
| Resultado de `verify-restore.sh`             |                                                                             |
| Alertas recibidas durante el simulacro       |                                                                             |
| ¿Superado?                                   | Sí · No                                                                     |
| Lecciones y acciones (responsable y fecha)   |                                                                             |
