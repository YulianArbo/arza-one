# FT-TEC-007 — Lista de verificación de salida a producción

Formato del anexo E del Manual Maestro MN-TEC-002 (numeral 21.4). Se diligencia antes de salir a
producción. El Director General firma el acta [FT-TEC-008](FT-TEC-008-acta-de-salida-a-produccion.md)
solo cuando los 24 puntos dicen «Sí».

> **Código provisional.** FT-TEC-007 y FT-TEC-008 son los siguientes códigos libres después de
> FT-TEC-006 (B44). Confírmelos contra el Listado Maestro RE-SGC-001 antes de publicarlos
> (decisión 5 de B45).

**Fecha de diligenciamiento:** \_\_\_\_/\_\_\_\_/\_\_\_\_\_\_ · **Versión que sale:** v\_\_.\_\_.\_\_ · **Diligenció:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

La columna «Estado al cerrar B45» dice qué había el 25/11/2026, cuando se construyó este formato.
La última columna la llena quien verifica, con la fecha y el nombre o enlace de la evidencia.

| N.º | Verificación                                                                                                       | Evidencia                        | Responsable                        | Estado al cerrar B45                                                                                                                                    | Cumple (Sí/No, fecha, evidencia) |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Los diez recorridos críticos del numeral 21.2 pasan en el ambiente de pruebas                                      | Informe de Playwright            | Responsable técnico                | Automatizados en la integración continua. Falta correrlos en el servidor de pruebas con la versión que sale.                                            |                                  |
| 2   | Cero hallazgos de seguridad altos o críticos en análisis estático, dependencias, imágenes y análisis dinámico      | Informes                         | Responsable técnico                | Semgrep, osv-scanner, Trivy, gitleaks y ZAP corren en cada cambio (B43). Guardar los informes de la versión que sale.                                   |                                  |
| 3   | Revisiones externas H1 a H4 con hallazgos cerrados                                                                 | Informes de hito                 | Director General con un tercero    | Pendiente: no se han contratado.                                                                                                                        |                                  |
| 4   | Prueba de intrusión realizada y remediada                                                                          | Informe del tercero              | Director General con un tercero    | Pendiente: no se ha contratado.                                                                                                                         |                                  |
| 5   | Pruebas de aislamiento entre empresas y entre clientes en verde                                                    | Resultado de CI                  | Responsable técnico                | En verde en cada cambio (pruebas de integración y recorrido 9 del 21.2).                                                                                |                                  |
| 6   | Pruebas de rendimiento dentro de las metas                                                                         | Informe de k6                    | Responsable técnico                | k6 corre en la integración continua con las metas del 21.1 (B43). Guardar el informe de la versión que sale.                                            |                                  |
| 7   | Copia de seguridad restaurada con éxito en un servidor limpio                                                      | FT-TEC-005                       | Responsable técnico                | Ensayo automático en la CI (B44, 27 s). Falta el ensayo en el servidor real, registrado en [FT-TEC-005](../runbooks/registros/FT-TEC-005.md).           |                                  |
| 8   | Monitoreo y todas las alertas probadas                                                                             | FT-TEC-003                       | Director General con Claude Code   | Parcial (B44, decisión 9): falta el ensayo real de los diez pasos de [atención de alertas](../runbooks/atencion-de-alertas.md).                         |                                  |
| 9   | Servidor endurecido: puertos, accesos, actualizaciones, cifrado                                                    | Lista del numeral 10.2           | Responsable técnico                | El guion `provision.sh --role production` lo deja así (B44). Falta contratar el servidor y correrlo.                                                    |                                  |
| 10  | Secretos de producción generados, únicos y custodiados en el gestor de contraseñas                                 | Registro                         | Director General                   | Pendiente. Guía: [rotación de secretos](../runbooks/rotacion-de-secretos.md).                                                                           |                                  |
| 11  | Correo con SPF, DKIM y DMARC verificados                                                                           | Prueba de entrega                | Responsable técnico                | Pendiente: depende del proveedor de correo y del dominio.                                                                                               |                                  |
| 12  | Términos, política de datos, política de cookies y cláusula de firma aprobados por el asesor jurídico y publicados | Concepto; web_legal_texts        | Director General y asesor jurídico | Pendiente. `pnpm puesta:revisar` comprueba que estén publicados con el concepto adjunto.                                                                |                                  |
| 13  | Registro de actividades de tratamiento aprobado; contratos de transmisión con proveedores firmados                 | M18                              | Oficial de datos                   | Pendiente. Se registran en Privacidad › Actividades de tratamiento y › Encargados.                                                                      |                                  |
| 14  | Banner de cookies verificado: nada no necesario antes de aceptar                                                   | Prueba                           | Responsable técnico                | Automatizado (recorrido 10 del 21.2). Repetir a mano en producción con el navegador.                                                                    |                                  |
| 15  | Parámetros tributarios y exportación contable validados por el Contador                                            | Acta                             | Contador                           | Pendiente. Guion de aceptación [M10](../aceptacion/M10-finanzas.md).                                                                                    |                                  |
| 16  | Listado Maestro cargado y conciliado con RE-SGC-001                                                                | Informe de importación           | Calidad                            | Herramienta lista (B19). Falta la carga real ([carga inicial](carga-inicial.md), paso 3).                                                               |                                  |
| 17  | Usuarios reales creados con el rol mínimo y segundo factor activo                                                  | Informe de accesos               | Responsable técnico y Dirección    | Herramientas listas (B45): `pnpm puesta:cargar` y la descarga de Administración › Revisión de accesos. Falta la carga real.                             |                                  |
| 18  | Accesibilidad: sin violaciones graves; prueba manual con teclado                                                   | Informe                          | Responsable técnico                | axe corre en las pruebas de navegador. Falta la prueba manual con teclado.                                                                              |                                  |
| 19  | Guías de operación completas y ensayadas: despliegue, reversión, restauración, incidente                           | docs/runbooks                    | Responsable técnico                | Guías completas (B44) y [plan de reversión](plan-de-reversion.md). Falta ensayarlas en los servidores reales.                                           |                                  |
| 20  | Manual de usuario publicado y capacitación realizada                                                               | RE-SST-002 o lista de asistencia | Calidad y Talento humano           | [Manual](../manual-usuario/README.md) y [plan de capacitación](plan-de-capacitacion.md) listos. Falta publicarlo como documento controlado y capacitar. |                                  |
| 21  | Inventario de componentes y avisos de licencias de terceros publicados                                             | SBOM                             | Responsable técnico                | La CI genera el SBOM y los avisos (B43). Publicar el texto «Avisos de software de terceros» en el sitio.                                                |                                  |
| 22  | Datos de prueba eliminados del ambiente de producción                                                              | Verificación                     | Responsable técnico                | `pnpm puesta:revisar` comprueba que no haya empresas de demostración ni cuentas de prueba.                                                              |                                  |
| 23  | Plan de reversión definido y responsable disponible durante la puesta en marcha                                    | Plan                             | Director General                   | [Plan de reversión](plan-de-reversion.md) escrito. Falta nombrar al responsable y su reemplazo.                                                         |                                  |
| 24  | Acta de aprobación de salida a producción firmada por el Director General                                          | Acta                             | Director General                   | Formato [FT-TEC-008](FT-TEC-008-acta-de-salida-a-produccion.md) listo para firmar al final.                                                             |                                  |

## Cómo comprobar los puntos que revisa la plataforma

En el servidor de producción, con la versión que sale ya desplegada:

```powershell
pnpm puesta:revisar
```

El comando solo lee. Cada línea dice «CUMPLE» o «NO CUMPLE» con el número del punto (12, 16, 17 y
22). Adjunte el archivo `revision-puesta-en-marcha-<fecha>.csv` como evidencia. Si un punto dice
«NO CUMPLE», no firme el acta.

## Guiones de aceptación por módulo

Además de esta lista, el numeral 21.3 exige la aprobación del líder de cada proceso. Los guiones
están en [docs/aceptacion](../aceptacion/README.md); cada uno termina con su firma.
