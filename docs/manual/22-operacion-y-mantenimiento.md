# 22. Operación y mantenimiento

| **Actividad**                                                  | **Frecuencia**                          | **Responsable**                              | **Registro**          |
|----------------------------------------------------------------|-----------------------------------------|----------------------------------------------|-----------------------|
| **Revisar monitoreo, alertas y trabajos fallidos**             | Diaria                                  | Responsable técnico                          | RE-TEC-002            |
| **Verificar la copia de seguridad y la cadena de auditoría**   | Diaria (automática con alerta)          | Responsable técnico                          | FT-TEC-005            |
| **Aplicar actualizaciones de seguridad del sistema operativo** | Automática; reinicio semanal programado | Responsable técnico                          | Bitácora del servidor |
| **Actualizar dependencias (solicitudes de Renovate)**          | Semanal                                 | Responsable técnico con Claude Code          | Pull requests         |
| **Ensayar la restauración de copias**                          | Mensual                                 | Responsable técnico                          | FT-TEC-005            |
| **Revisar capacidad del servidor y costos**                    | Mensual                                 | Responsable técnico                          | Informe               |
| **Revisar accesos y roles**                                    | Trimestral                              | Dirección y administrador                    | Informe de revisión   |
| **Rotar secretos y credenciales de servicio**                  | Semestral y ante cualquier retiro       | Responsable técnico                          | Bitácora              |
| **Revisar la matriz legal y los textos publicados**            | Semestral                               | Dirección, Oficial de Datos, asesor jurídico | RE-DG-001             |
| **Simulacro de pérdida total y de incidente de seguridad**     | Anual                                   | Dirección y responsable técnico              | FT-TEC-006            |
| **Prueba de intrusión externa**                                | Anual y antes de cambios mayores        | Tercero                                      | Informe               |
| **Disposición documental y depuración de datos vencidos**      | Mensual                                 | Calidad y Oficial de Datos                   | Acta de disposición   |

**Soporte a usuarios y cambios**

- Las fallas y solicitudes sobre la plataforma se radican en la mesa de ayuda (M08) con la categoría «ARZA ONE» y siguen PR-SAC-001.

- Todo cambio funcional se solicita, se prioriza, se especifica como bloque y sigue el ciclo del capítulo 23. Los cambios en este manual se tramitan con FT-SGC-001.

- Las guías de operación (docs/runbooks) cubren: despliegue, reversión, restauración, rotación de secretos, bloqueo de emergencia, alta de un nuevo ambiente y atención de cada alerta.

- El manual de usuario se construye dentro de la plataforma como artículos de la base de conocimiento enlazados desde la ayuda de cada pantalla.
