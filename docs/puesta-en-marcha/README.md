# Puesta en marcha de ARZA ONE (B45)

Todo lo necesario para pasar de «construido» a «en producción», según el capítulo 18, el numeral
21.4 y el anexo E del Manual Maestro.

| Documento                                                               | Para qué                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Carga inicial](carga-inicial.md)                                       | Cargar estructura, usuarios, terceros, Listado Maestro y retención                           |
| [Plantillas](plantillas/)                                               | Ejemplos de `areas.csv`, `cargos.csv`, `usuarios.csv` y `terceros.csv`, con datos inventados |
| [FT-TEC-007 Lista de verificación](FT-TEC-007-lista-de-verificacion.md) | Los 24 puntos del anexo E con su evidencia y responsable                                     |
| [FT-TEC-008 Acta de salida](FT-TEC-008-acta-de-salida-a-produccion.md)  | El acta que firma el Director General al final                                               |
| [Plan de reversión](plan-de-reversion.md)                               | Qué hacer si la salida sale mal                                                              |
| [Plan de capacitación](plan-de-capacitacion.md)                         | Sesiones por rol y cómo registrarlas                                                         |
| [Guiones de aceptación](../aceptacion/README.md)                        | Prueba de cada módulo por su líder de proceso                                                |
| [Manual de usuario](../manual-usuario/README.md)                        | Manual para las personas que usan la plataforma                                              |

## Orden sugerido

1. **Servidores y proveedores** (B44): contratar servidor, vigilancia, depósito de copias, dominio
   y correo; correr `provision.sh`; generar y custodiar los secretos.
2. **Validaciones de terceros:** revisión externa, prueba de intrusión, concepto jurídico de los
   textos, validación del Contador, registro de actividades de tratamiento.
3. **Aceptación por módulo** en el servidor de pruebas, con los guiones firmados.
4. **Capacitación** en el servidor de pruebas, registrada en Formación.
5. **Primera publicación** en producción (guía de despliegue).
6. **Carga inicial** de datos reales, en el orden de la guía.
7. **Textos legales** publicados con su concepto y **manual** publicado como documento controlado.
8. **Revisión** `pnpm puesta:revisar` y lista FT-TEC-007 completa.
9. **Acta FT-TEC-008** firmada por el Director General. ARZA ONE queda como fuente oficial y se
   retiran las copias de las carpetas compartidas.

## Comandos de B45

| Comando                                                              | Qué hace                                                  | Cambia datos      |
| -------------------------------------------------------------------- | --------------------------------------------------------- | ----------------- |
| `pnpm puesta:cargar --correo <correo> --carpeta <carpeta>`           | Revisa las plantillas y entrega el informe                | No                |
| `pnpm puesta:cargar --correo <correo> --carpeta <carpeta> --aplicar` | Carga lo nuevo, si la revisión no tiene problemas         | Sí, con auditoría |
| `pnpm puesta:revisar [--empresa <empresa>]`                          | Dice «CUMPLE» o «NO CUMPLE» en los puntos 12, 16, 17 y 22 | No                |

Los informes de carga y de revisión de producción llevan datos reales: se guardan en la carpeta de
evidencias de la empresa, **nunca** en el repositorio.
