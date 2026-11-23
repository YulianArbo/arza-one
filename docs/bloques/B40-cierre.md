# Cierre del bloque B40 — Innovación y propiedad intelectual

- Módulo: M15 · Fase F7 · Depende de B15
- Construido por Claude Code el 22/11/2026, con el plan aprobado por el propietario («Apruebo todo», 10 decisiones).
- Rama `feat/b40-innovacion-y-propiedad-intelec`, desde `c5a8c65` (`main` con B38 y B39 ya fusionados).
- Documentación del módulo: `docs/manual/datos/inn.md`.

## Qué se construyó

- **Banco de ideas (FT-INN-005).**
  - Cualquier colaborador **propone una idea** desde la portada de Innovación y ve las suyas. Puede corregirla mientras sigue inscrita.
  - Calidad o la Dirección **inician la evaluación** y diligencian en pantalla la **Evaluación de Viabilidad (FT-INN-003)**: cinco criterios de 1 a 5 y un concepto. Queda como registro del motor de formatos, con su PDF.
  - Luego la **aprueban o la archivan** con el motivo, y la llevan a **en desarrollo** e **implementada**.
  - **Nadie evalúa ni decide sobre su propia idea.** Para aprobar hace falta la evaluación y un concepto distinto de «No viable».
- **Hoja de ruta de productos propios (FT-INN-004).**
  - Hitos por producto y trimestre (como 2027-T1), con su responsable y, si aplica, la idea aprobada de la que nacen.
  - Al **liberar una versión**, la plataforma crea el **registro de software «propuesto»** ante la Dirección Nacional de Derecho de Autor y le da al responsable la tarea **«Radicar el registro de …»** en Mis tareas.
- **Portafolio de propiedad intelectual (RE-INN-001, FT-INN-001, FT-INN-002).**
  - Marcas, registros de software y dominios, con titular, número de registro, clases de Niza, entidad, fechas de radicación, concesión y vencimiento, responsable y certificado en PDF.
  - Muestra cuántos días faltan para vencer y la etiqueta **«Renovación por gestionar»**.
  - Se descarga en **CSV** (RE-INN-001).
  - **Cadena de titularidad:** cada autor con el soporte escrito de su cesión. Un registro de software **no pasa a radicado ni a vigente** sin sus autores.
- **Alertas de renovación.** Cada día a las 6:45, una **marca a seis meses** de vencer o un **dominio a 60 días** le dan a su responsable la tarea **«Renovar …»** en Mis tareas. Se avisa una sola vez por vencimiento. Lo que pasa su fecha sin renovarse queda **vencido**.
- **Vigilancia tecnológica (FT-INN-006) y análisis de competencia (RE-INN-002).** Calidad y el Líder técnico registran hallazgos (tema, fuente, hallazgo, relevancia) y competidores (segmento, fortalezas y debilidades).
- **Menú:** «Innovación» en el grupo Gobierno, con cuatro partes: Banco de ideas, Hoja de ruta, Propiedad intelectual, y Vigilancia y competencia.

### Criterios de aceptación

| Criterio                                                 | Cómo se cumple                                                                                                     | Prueba                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| El portafolio coincide con RE-INN-001                    | 13 columnas en pantalla y en CSV                                                                                   | `portfolio.int.test.ts`, `innovation-portfolio.test.tsx`. **El formato RE-INN-001 no está en el repositorio: las columnas quedan por validar.** |
| Una marca próxima a vencer genera tarea con seis meses   | Trabajo diario `inn.daily-work`; tarea al responsable; una sola por vencimiento                                    | `renewal.int.test.ts`, `innovation.test.ts` (fechas)                                                                                            |
| Cada versión liberada propone su registro                | La liberación crea el registro «propuesto» y la tarea de radicarlo                                                 | `roadmap-watch.int.test.ts`                                                                                                                     |
| La cadena de titularidad enlaza con la cesión            | Cada autor con contrato laboral, contrato de cesión o documento firmado; el software no se radica sin autores      | `portfolio.int.test.ts`                                                                                                                         |
| Permiso denegado, aislamiento entre empresas y auditoría | Cada parte tiene su prueba de 403 y de otra empresa. Las 20 rutas nuevas que escriben dejan su evento de auditoría | `test/int/inn/*`, `write-routes-audited.int.test.ts`                                                                                            |

## Decisiones (aprobadas el 22/11/2026)

1. **Permiso nuevo `inn.read`** («Ver innovación y propiedad intelectual») para Dirección, Calidad, Líder técnico y Auditor. El catálogo pasa de 215 a 216 permisos.
2. Quien tiene `inn.read` ve todo; los demás colaboradores, solo las ideas que propusieron.
3. Nadie evalúa ni decide su propia idea; aprobar exige la evaluación de viabilidad. Evalúan y aprueban Calidad y la Dirección.
4. El FT-INN-003 usa el motor de formatos (como el FT-TEC-002), con cinco criterios de 1 a 5 y concepto. **Campos por validar** con el formato original.
5. Columnas del RE-INN-001 propuestas. **Por validar** con el formato original.
6. Alertas: marcas a 6 meses, dominios a 60 días; el software no vence. La tarea va al responsable del activo.
7. La propuesta de registro nace de la hoja de ruta (al liberar una versión), no de las liberaciones de Proyectos.
8. Soportes de cesión: contrato laboral firmado (sin salario), contrato de Contratos o documento firmado. El software no pasa a radicado sin autores.
9. El producto de la hoja de ruta es texto libre, con los ya escritos a la vista.
10. Fuera de este bloque: convertir un hallazgo en idea con un clic y enlazar las liberaciones de Proyectos.

### Decisiones técnicas tomadas durante la construcción

- **Una sola tarea de seguimiento por activo** (flujo `inn.ip`, «Seguimiento de la propiedad intelectual»): sirve para renovar y para radicar. Administración › Flujos puede ajustarla sin programar.
- **Ruta `GET /v1/innovation/people`** (con `inn.read`) para elegir responsables, como hacen Calidad y SST con la suya.
- **Una ruta para corregir la idea propia** (`PATCH /v1/innovation/ideas/{id}`), mientras sigue inscrita.
- **El certificado se adjunta desde la ficha del activo** (botón «Adjuntar certificado»), con la misma revisión de antivirus de los demás archivos.
- **Datos ficticios de demostración** (`pnpm db:seed:demo`): una marca a 150 días de vencer, un dominio a 45 días y un registro de software propuesto, todos con números inventados.

## Cómo probarlo en su navegador

Antes de empezar: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed:demo` y `pnpm dev`. Use las cuentas ficticias de prueba.

1. **Entre como un colaborador** (rol Colaborador).
   - En el menú, **Gobierno › Innovación**. Debe ver solo «Proponer una idea» y «Ideas que propuse».
   - Pulse **Proponer una idea**, escriba un nombre y qué propone, y pulse **Proponer**. La idea aparece abajo como **Inscrita**, con un código como IDE-2026-0001.
   - Pulse **Corregir**, cambie el nombre y guarde.
2. **Entre como Calidad.**
   - En Innovación verá los cuatro indicadores (ideas inscritas, en evaluación, activos por renovar y registros propuestos) y las cuatro partes del módulo.
   - Abra **Banco de ideas**. En la idea del colaborador pulse **Iniciar evaluación**.
   - Pulse **Evaluar viabilidad**, califique los cinco criterios, elija el concepto y guarde. Debe aparecer «Viabilidad: N de 25» y el código FT-INN-003-….
   - Pulse **Aprobar o archivar**, elija **Aprobar** y escriba por qué. La idea queda **Aprobada**. Luego **Pasar a desarrollo** y **Marcar implementada**.
   - Proponga usted una idea: en ella **no** debe aparecer «Iniciar evaluación» (nadie evalúa la propia).
   - Unos segundos después, **Descargar evaluación (PDF)** debe bajar el formato diligenciado.
3. **Hoja de ruta.**
   - Pulse **Agregar hito**: producto «ARZA ONE», un título, el trimestre (por ejemplo 2027-T1) y el responsable.
   - Pulse **Liberar versión**, escriba «1.0.0» y pulse **Liberar**. El hito queda **Liberado** con el enlace «Registro propuesto PI-…».
   - Entre como el responsable del hito: en **Mis tareas** debe estar «Radicar el registro de ARZA ONE 1.0.0».
4. **Propiedad intelectual.**
   - Con los datos ficticios verá una marca con **«Renovación por gestionar»** (faltan 150 días) y un dominio a 45 días.
   - Abra el registro de software propuesto (**Ver ficha y autores**). Pulse **Actualizar**, cambie el estado a **Radicado**, ponga la fecha de radicación y guarde: debe rechazarlo porque no tiene autores.
   - Pulse **Agregar autor**: elija una persona de la empresa con contrato laboral firmado, o deje «Es un autor externo», escriba el nombre, elija **Documento de cesión firmado** y adjunte un PDF. Cuando diga «Disponible», pulse **Agregar autor**.
   - Vuelva a pasarlo a **Radicado**: ahora sí lo acepta.
   - Pulse **Adjuntar certificado**, suba un PDF y luego **Descargar certificado**.
   - En la lista, **Descargar portafolio (CSV)** y ábralo en Excel.
5. **Alertas de renovación.** Mañana después de las 6:45 (o cuando corra el trabajo diario), el responsable de la marca de demostración tendrá en **Mis tareas** «Renovar marca …». Si cambia la fecha de vencimiento a una más lejana, la etiqueta de renovación desaparece.
6. **Vigilancia y competencia.** Registre un hallazgo y un competidor, y edítelos.
7. **Permisos.** Como Auditor puede ver todo pero no ve botones para registrar. Como Colaborador, si escribe a mano la dirección `/app/innovacion/propiedad-intelectual`, la plataforma no le muestra el portafolio.

## Cómo se probó

Verificaciones ejecutadas en este equipo el 22/11/2026:

- **Pruebas de Innovación:** contratos 9/9, integración 16/16 (ideas, portafolio, hoja de ruta y vigilancia, renovación), pantallas 16/16.
- **Recorrido de auditoría** (toda ruta que escribe deja su evento): 493/493, con las 20 rutas nuevas.
- **Suite completa de integración:** se corrió entera. El equipo se quedó sin memoria y hubo fallos de conexión a la base. Por eso se repitió por partes: los 45 archivos que fallaron pasaron solos (244/244), y Innovación, migraciones, documentos, calidad y servicio también (36/36).
- La primera repetición del recorrido de auditoría encontró **un fallo real, ya corregido.** La preparación de Innovación publica todos los formatos piloto, entre ellos la Lista de Verificación FT-SGC-002. Con ese formato publicado, las pruebas de Documentos que corrían después no podían aprobar versiones. Las llamadas de Innovación ahora van al final del recorrido, como las de Activos.
- **Pruebas de pantallas completas:** 924 de 929. Las 5 restantes (finanzas, formatos, privacidad, servicio; ninguna de Innovación) se pasaron del tiempo por falta de memoria y pasan solas (25/25). La cobertura de la web no se pudo medir completa en este equipo: la confirma la integración continua.
- Tipos (13 paquetes), límites entre módulos (0 violaciones), código sin usar (knip, 0), secretos (gitleaks, sin hallazgos) y compilación (`pnpm build`, 7/7 con las 6 pantallas nuevas): en verde.
- Análisis de estilo: limpio en los 73 archivos cambiados. El análisis de todo el repositorio se queda sin memoria en este equipo.
- Revisión de formato: en verde salvo los archivos sueltos del propietario.
- **No se ejecutaron:** las pruebas de navegador (`pnpm test:e2e`), porque el navegador de Playwright instalado no coincide con la versión pedida y descargarlo necesita su autorización. Tampoco se revisó en el navegador a mano.

## Pendientes

- **Validar el FT-INN-003** (criterios de viabilidad) y el **RE-INN-001** (columnas del portafolio) frente a los formatos originales, que no están en el repositorio. Si cambian, el FT-INN-003 se ajusta sin programar en Documentos › Formatos.
- **Revisar en su navegador** los pasos de arriba: las pruebas automáticas de navegador no se ejecutaron en este equipo (ver «Cómo se probó»).
- Mejoras que quedaron fuera (decisión 10): convertir un hallazgo de vigilancia en idea con un clic y enlazar las liberaciones de Proyectos con la propuesta de registro.
- Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron. Son los únicos archivos que no pasan la revisión de formato en su equipo.
