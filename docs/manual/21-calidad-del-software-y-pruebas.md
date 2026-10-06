# 21. Calidad del software y pruebas

## 21.1 Estrategia de pruebas

| **Tipo**                  | **Qué comprueba**                                                           | **Herramienta**                            | **Cuándo**                     | **Meta**                                                                                    |
|---------------------------|-----------------------------------------------------------------------------|--------------------------------------------|--------------------------------|---------------------------------------------------------------------------------------------|
| **Unitarias**             | Reglas de negocio, cálculos, máquinas de estado, políticas de permiso       | Vitest                                     | Cada cambio                    | 90 % de líneas en dominio y aplicación; 100 % en cálculos de dinero, plazos y permisos      |
| **Integración**           | Casos de uso contra PostgreSQL real, seguridad por fila, migraciones, colas | Vitest, Supertest, Testcontainers          | Cada cambio                    | Todo punto de la API con camino feliz, validación, permiso denegado y otra empresa          |
| **Contrato**              | Que la API cumple el esquema publicado                                      | Esquemas Zod y OpenAPI                     | Cada cambio                    | Sin diferencias                                                                             |
| **Extremo a extremo**     | Recorridos completos en navegador                                           | Playwright                                 | Antes de integrar y en pruebas | Los recorridos críticos de 21.2 en verde                                                    |
| **Accesibilidad**         | WCAG 2.2 AA                                                                 | axe-core y revisión manual                 | Cada pantalla nueva            | Cero violaciones graves                                                                     |
| **Seguridad**             | Capítulo 15                                                                 | Semgrep, osv-scanner, Trivy, ZAP, gitleaks | Cada cambio y semanal          | Cero hallazgos altos o críticos abiertos                                                    |
| **Rendimiento**           | Tiempos de respuesta con datos voluminosos                                  | k6 (código abierto)                        | Antes de cada versión mayor    | Percentil 95 inferior a 500 ms en consultas y 1 s en escrituras con 50 usuarios simultáneos |
| **Restauración**          | Que las copias sirven                                                       | Guion de restauración                      | Mensual                        | Restauración completa dentro del RTO                                                        |
| **Aceptación de usuario** | Que el módulo sirve al proceso                                              | Guion de prueba por módulo                 | Al cerrar cada bloque          | Aprobación del líder de proceso y del Director General                                      |

## 21.2 Recorridos críticos automatizados

- Invitar a un usuario, activar la cuenta, configurar el segundo factor e iniciar sesión.

- Formulario del sitio → lead → oportunidad → cotización → aceptación del cliente.

- Cotización aceptada → contrato desde plantilla → aprobación → firma de ambas partes → verificación pública del documento.

- Contrato firmado → proyecto → tarea → entregable → aceptación en el portal → solicitud de factura.

- Cliente crea un tiquete en el portal → atención → resolución → encuesta.

- Visitante radica una PQRSF → acuse con radicado → respuesta → cierre; consulta del estado con el radicado.

- Nueva versión de un documento → solicitud documental → aprobación → publicación → constancia de lectura.

- Titular solicita sus datos → verificación → respuesta dentro del plazo.

- Usuario de la empresa A intenta leer y modificar registros de la empresa B por la interfaz y por la API: siempre denegado.

- Visitante rechaza las cookies: no se instala ninguna no necesaria.

## 21.3 Definición de listo y de terminado

| **Un bloque está listo para iniciar cuando…**                      | **Un bloque está terminado cuando…**                                                           |
|--------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| Tiene objetivo, alcance y exclusiones escritos                     | Cumple todos sus criterios de aceptación y los generales del módulo                            |
| Están identificados los datos, los estados y las reglas de negocio | Todas las verificaciones automáticas del numeral 11.4 están en verde                           |
| Están definidos los roles y permisos que intervienen               | Tiene pruebas de permiso denegado y de aislamiento entre empresas                              |
| Se conocen los documentos del SGC que aplica                       | Toda escritura genera evento de auditoría, comprobado por prueba                               |
| Los bloques de los que depende están terminados                    | Las migraciones aplican desde cero y sobre la versión anterior                                 |
| Tiene criterios de aceptación verificables                         | Las pantallas resuelven todos los estados del numeral 16.5 y pasan accesibilidad               |
| El Director General lo priorizó                                    | La documentación del módulo, el OpenAPI y la bitácora del bloque están actualizados            |
|                                                                    | Fue revisado, desplegado en pruebas, probado por el usuario y aprobado por el Director General |

## 21.4 Condiciones para salir a producción

La lista de verificación completa está en el anexo E. En resumen: recorridos críticos en verde; cero hallazgos de seguridad altos o críticos; revisión externa y prueba de intrusión con hallazgos cerrados; restauración de copias ensayada; textos legales aprobados y publicados; validaciones profesionales del numeral 20.5; monitoreo y alertas funcionando; manual de usuario y capacitación realizados; y acta de aprobación firmada por el Director General.
