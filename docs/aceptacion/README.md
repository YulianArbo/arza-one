# Guiones de aceptación por módulo (B45)

Pruebas de aceptación de usuario del numeral 21.1 del Manual Maestro: cada líder de proceso
comprueba, paso a paso, que su módulo sirve al proceso. El Director General firma con él. Son
requisito del acta de salida a producción ([FT-TEC-008](../puesta-en-marcha/FT-TEC-008-acta-de-salida-a-produccion.md)).

## Reglas

- Se prueban en el **servidor de pruebas**, con datos **ficticios**. Nunca en producción ni con datos
  de clientes reales.
- Cada paso se marca «Sí» o «No». Un «No» se describe en «Observación» y se reporta para arreglo.
- Un guion «No aprobado» se repite completo cuando se corrija.
- Los guiones firmados se guardan escaneados en la carpeta de evidencias de la puesta en marcha.

## Guiones

| Módulo | Guion                                             | Aprueba                                        |
| ------ | ------------------------------------------------- | ---------------------------------------------- |
| M00    | [Núcleo](M00-nucleo.md)                           | Director General                               |
| M00    | [Multiempresa](M00-multiempresa.md)               | Director General y responsable técnico         |
| M01    | [Identidad y control de acceso](M01-identidad.md) | Director General                               |
| M02    | [Terceros](M02-terceros.md)                       | Gerente Comercial                              |
| M03    | [Gestión documental](M03-documentos.md)           | Coordinador de Calidad e Innovación            |
| M04    | [Flujos, tareas y avisos](M04-tareas-y-avisos.md) | Coordinador de Calidad e Innovación            |
| M05    | [Comercial](M05-comercial.md)                     | Gerente Comercial                              |
| M06    | [Contratos y firma electrónica](M06-contratos.md) | Director General                               |
| M07    | [Proyectos](M07-proyectos.md)                     | Gerente de Desarrollo y Tecnología             |
| M08    | [Servicio al cliente](M08-servicio.md)            | Líder de Servicio al Cliente                   |
| M09    | [Portal del cliente](M09-portal.md)               | Líder de Servicio al Cliente                   |
| M10    | [Finanzas](M10-finanzas.md)                       | Gerente Administrativo y Financiero y Contador |
| M11    | [Compras y activos](M11-compras-y-activos.md)     | Gerente Administrativo y Financiero            |
| M12    | [Talento humano](M12-talento-humano.md)           | Coordinador de Talento Humano                  |
| M13    | [Seguridad y salud en el trabajo](M13-sst.md)     | Líder de Seguridad y Salud en el Trabajo       |
| M14    | [Calidad](M14-calidad.md)                         | Coordinador de Calidad e Innovación            |
| M15    | [Innovación](M15-innovacion.md)                   | Coordinador de Calidad e Innovación            |
| M16    | [Dirección](M16-direccion.md)                     | Director General                               |
| M17    | [Sitio público](M17-sitio-web.md)                 | Director General                               |
| M18    | [Privacidad](M18-privacidad.md)                   | Oficial de Protección de Datos Personales      |
| M19    | [Auditoría](M19-auditoria.md)                     | Director General                               |
| M20    | [Asistente de IA](M20-asistente.md)               | Oficial de Protección de Datos Personales      |

M16 se agregó con B46, M20 con B47 y Multiempresa (M00) con B48.
