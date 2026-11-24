# Guías de operación

| Guía                                                                      | Bloque   | Para qué                                                                                                   |
| ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| [Integración continua](integracion-continua.md)                           | B05      | Qué revisa GitHub en cada cambio, qué hacer si falla, Renovate y la protección de `main`                   |
| [Entorno local](entorno-local.md)                                         | B06      | Servicios en Docker del equipo, comandos `infra:*`, trabajo de ejemplo y problemas frecuentes              |
| [Proveedores de servidor y dominio](proveedores-de-servidor-y-dominio.md) | B07      | Opciones para contratar el servidor de pruebas y el dominio, con sus páginas oficiales                     |
| [Servidor de pruebas](servidor-de-pruebas.md)                             | B07      | Preparar y endurecer el servidor (una vez) y conectarlo con GitHub                                         |
| [Despliegue y reversión](despliegue-y-reversion.md)                       | B07, B44 | Despliegue automático a pruebas, publicación aprobada en producción, reversión y operaciones a mano        |
| [Servidor de producción](servidor-de-produccion.md)                       | B44      | Preparar producción, sus copias y su conexión con GitHub                                                   |
| [Servidor de vigilancia](servidor-de-vigilancia.md)                       | B44      | Uptime Kuma, GlitchTip, página de estado y los monitores del numeral 10.7                                  |
| [Restauración](restauracion.md)                                           | B44      | Volver a un minuto, pérdida total del servidor, ensayo mensual (FT-TEC-005) y simulacro anual (FT-TEC-006) |
| [Atención de alertas](atencion-de-alertas.md)                             | B44      | Qué hacer con cada alerta y el ensayo de todas las alertas                                                 |
| [Rotación de secretos](rotacion-de-secretos.md)                           | B44      | Cómo cambiar cada contraseña y llave de producción                                                         |
| [Bloqueo de emergencia](bloqueo-de-emergencia.md)                         | B44      | Cuenta comprometida, cierre de sesiones, apagar la entrada y qué hacer después                             |
| [Alta de un ambiente](alta-de-un-ambiente.md)                             | B44      | Levantar un ambiente nuevo con el mismo guion                                                              |

Registros: [FT-TEC-005](registros/FT-TEC-005.md) (ensayo de restauración) y
[FT-TEC-006](registros/FT-TEC-006.md) (simulacro anual).
