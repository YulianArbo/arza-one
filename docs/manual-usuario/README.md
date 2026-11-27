# Manual de usuario de ARZA ONE

Manual para las personas que usan la plataforma (punto 20 del anexo E). Está escrito en español
claro, un capítulo por módulo (decisión 7 de B45). Empiece por **Primeros pasos**.

| Capítulo                                              | Para quién                                    |
| ----------------------------------------------------- | --------------------------------------------- |
| [Primeros pasos](00-primeros-pasos.md)                | Todas las personas                            |
| [M00 Núcleo](M00-nucleo.md)                           | Administrador de la plataforma                |
| [M00 Multiempresa](M00-multiempresa.md)               | Operador de la plataforma; Dirección          |
| [M01 Identidad y control de acceso](M01-identidad.md) | Administrador y Dirección                     |
| [M02 Terceros](M02-terceros.md)                       | Comercial, Servicio, Finanzas, Talento humano |
| [M03 Gestión documental y SGC](M03-documentos.md)     | Todas las personas; Calidad                   |
| [M04 Flujos, tareas y avisos](M04-tareas-y-avisos.md) | Todas las personas                            |
| [M05 Comercial](M05-comercial.md)                     | Comercial y Dirección                         |
| [M06 Contratos y firma electrónica](M06-contratos.md) | Dirección, Comercial y Talento humano         |
| [M07 Proyectos](M07-proyectos.md)                     | Líder técnico y equipo de proyecto            |
| [M08 Servicio al cliente](M08-servicio.md)            | Servicio al cliente                           |
| [M09 Portal del cliente](M09-portal.md)               | Clientes; Servicio y Comercial                |
| [M10 Finanzas](M10-finanzas.md)                       | Administrativo y financiero, Contador         |
| [M11 Compras y activos](M11-compras-y-activos.md)     | Todas las personas que compran; Finanzas      |
| [M12 Talento humano](M12-talento-humano.md)           | Talento humano, jefes y colaboradores         |
| [M13 Seguridad y salud en el trabajo](M13-sst.md)     | SST y todas las personas                      |
| [M14 Calidad](M14-calidad.md)                         | Calidad y líderes de proceso                  |
| [M15 Innovación](M15-innovacion.md)                   | Calidad, Dirección y quien proponga ideas     |
| [M16 Dirección](M16-direccion.md)                     | Dirección, Calidad y líderes de proceso       |
| [M17 Sitio web](M17-sitio-web.md)                     | Dirección y Oficial de datos                  |
| [M18 Privacidad](M18-privacidad.md)                   | Oficial de datos                              |
| [M19 Auditoría](M19-auditoria.md)                     | Auditor, Dirección y administrador            |
| [M20 Asistente de IA](M20-asistente.md)               | Todas las personas; Oficial de datos          |

M16 se agregó con B46, M20 con B47 y Multiempresa (M00) con B48.

## Publicarlo como documento controlado

El manual se publica en **Documentos** como documento controlado, con versión y constancia de lectura
por cargo (numeral 18.1, forma A). El código lo asigna Calidad (por ejemplo, MN-TEC-003) y se
registra en el Listado Maestro.

1. **Generar el PDF.** El responsable técnico lo genera con el convertidor de documentos de la
   plataforma (Gotenberg), desde esta carpeta, en Git Bash y con los servicios locales encendidos
   (`pnpm infra:up`):

   ```bash
   { printf '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual de usuario</title></head><body>'
     for f in 00-primeros-pasos.md M*.md; do printf '{{ toHTML "%s" }}' "$f"; done
     printf '</body></html>'; } > index.html
   args=(-F files=@index.html); for f in 00-primeros-pasos.md M*.md; do args+=(-F "files=@$f"); done
   curl -s -o manual-de-usuario.pdf "${args[@]}" http://127.0.0.1:3002/forms/chromium/convert/markdown
   rm index.html
   ```

2. **Cargarlo.** Calidad radica una Solicitud de Acción Documental de creación, adjunta el PDF y
   sigue el trámite de siempre: análisis, aprobación por otra persona y publicación.
3. **Pedir la lectura.** Al publicar, elija como destinatarios todos los cargos: cada persona recibe
   la tarea de lectura y el informe muestra quién confirmó.

No suba el PDF generado al repositorio: la versión oficial es la publicada en la plataforma.
