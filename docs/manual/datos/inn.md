# Innovación y propiedad intelectual · B40

El módulo M15 gestiona el banco de ideas, la hoja de ruta de productos propios, el portafolio de propiedad intelectual (marcas, registros de software y dominios) y la vigilancia tecnológica (ficha 17.16). En la web está en **Gobierno › Innovación**. Todo colaborador propone ideas desde la portada y ve las suyas.

## Tablas

| Tabla               | Para qué                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inn_ideas`         | Banco de ideas (FT-INN-005), `IDE-AAAA-NNNN`: quién la propuso, estado, quién la evalúa, la evaluación de viabilidad (cinco calificaciones en JSON, total, concepto y el registro FT-INN-003 del motor de formatos) y la decisión.                              |
| `inn_roadmap_items` | Hoja de ruta (FT-INN-004): producto (texto libre), hito, trimestre `AAAA-Tn`, estado, responsable, idea aprobada de la que nace y, al liberarse, la versión, la fecha y el registro de software propuesto.                                                      |
| `inn_ip_assets`     | Portafolio (RE-INN-001, FT-INN-001, FT-INN-002), `PI-AAAA-NNNN`: tipo, nombre, titular, número de registro, clases de Niza, entidad, fechas de radicación, concesión y vencimiento, estado, responsable, certificado y el vencimiento cuya renovación ya se avisó. |
| `inn_ip_authors`    | Cadena de titularidad: cada autor y el soporte escrito de su cesión (contrato laboral firmado, contrato de Contratos o documento firmado).                                                                                                                       |
| `inn_tech_watch`    | Vigilancia tecnológica (FT-INN-006): tema, fuente, hallazgo, relevancia y fecha.                                                                                                                                                                                 |
| `inn_competitors`   | Análisis de competencia (RE-INN-002): nombre, segmento, sitio web, fortalezas, debilidades y fecha del análisis.                                                                                                                                                 |

Todas llevan `tenant_id` y RLS. Las crea la migración `20261124000000_inn_innovation_ip`, que además admite `inn_idea` como registro al que se une un formato digital (FT-INN-003).

## Reglas

- **Estados de la idea.** Inscrita → en evaluación → aprobada → en desarrollo → implementada, o archivada. Quien la propuso la corrige mientras sigue inscrita.
- **Independencia (decisión 3).** Nadie evalúa ni decide sobre su propia idea (403 `INN_SELF_DECISION`; la base también lo verifica). Evalúan y aprueban Calidad y la Dirección.
- **Viabilidad (decisión 4).** El FT-INN-003 se diligencia en pantalla: mercado, viabilidad técnica, alineación con la estrategia, costo frente a beneficio y riesgos (5 = riesgo bajo), de 1 a 5, más el concepto (viable, viable con ajustes, no viable). Queda como registro del motor de formatos y el worker genera su PDF. Para aprobar, la idea debe tener evaluación y un concepto distinto de «no viable». Si la empresa no tiene publicado el FT-INN-003, responde 409. **Campos por validar** frente al formato original.
- **Hoja de ruta (decisiones 7 y 9).** El producto es texto libre; la pantalla muestra los ya escritos. Un hito nace, si se indica, de una idea aprobada, en desarrollo o implementada. Al **liberar** una versión, la plataforma crea el registro de software «propuesto» ante la Dirección Nacional de Derecho de Autor y le da al responsable del hito la tarea «Radicar el registro de …». Lo liberado ya no se edita.
- **Portafolio.**
  - El registro de software no vence; las clases de Niza solo aplican a marcas.
  - Un activo vigente exige vencimiento (salvo el software) y número de registro (salvo el dominio). Radicado o vigente exige fecha de radicación.
  - Si no se escribe la entidad, se toma la del tipo: SIC para marcas, Derecho de Autor para software, registrador para dominios.
- **Cadena de titularidad (decisión 8).** Cada autor tiene exactamente un soporte de cesión:
  - una persona de la empresa: su contrato laboral firmado en Talento humano (se muestra solo el código y la fecha de firma, nunca el salario);
  - un contrato del módulo Contratos, por su código (solo si quien registra puede verlo);
  - el documento de cesión firmado (PDF revisado por el antivirus).

  Un registro de software **no pasa a radicado ni a vigente** sin al menos un autor, y no se puede quitar su último autor (422 `INN_CHAIN_INCOMPLETE`).

- **Renovación (decisión 6).** Cada día a las 6:45 (`inn.daily-work`) el worker revisa los activos vigentes:
  - una **marca** a seis meses de vencer y un **dominio** a 60 días le dan a su responsable la tarea «Renovar …» en Mis tareas (flujo `inn.ip`);
  - una sola tarea por vencimiento; al renovar (cambiar la fecha de vencimiento) se vuelve a avisar el nuevo;
  - lo que pasó su fecha sin renovarse queda **vencido**.
- **Descargas.** El portafolio RE-INN-001 en CSV (13 columnas, **por validar** frente al formato original), el PDF de la evaluación de viabilidad y el certificado de cada activo. Cada descarga queda en la auditoría.

## Permisos

| Permiso              | Quién lo tiene                                                  | Para qué                                                    |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `inn.read` (nuevo)   | Dirección, Calidad, Líder técnico, Auditor                      | Ver todo el módulo                                          |
| `inn.idea.create`    | Calidad y Líder técnico; los demás roles, solo lo propio         | Proponer ideas y ver las propias                            |
| `inn.idea.evaluate`  | Dirección, Calidad                                              | Iniciar la evaluación y diligenciar el FT-INN-003           |
| `inn.idea.approve`   | Dirección, Calidad                                              | Aprobar, archivar y avanzar ideas                           |
| `inn.roadmap.manage` | Calidad                                                         | Hoja de ruta y liberaciones                                 |
| `inn.ip.manage`      | Calidad                                                         | Portafolio, autores y certificados                          |
| `inn.watch.manage`   | Calidad, Líder técnico                                          | Vigilancia y competencia                                    |

## API

Rutas bajo `/v1/innovation`: `ideas`, `my/ideas`, `ideas/{id}` (corregir), `ideas/{id}/evaluation`, `ideas/{id}/viability`, `ideas/{id}/decision`, `ideas/{id}/progress`, `ideas/{id}/viability/download-link`, `roadmap`, `roadmap/{id}`, `roadmap/{id}/release`, `ip-assets`, `ip-assets/export`, `ip-assets/{id}`, `ip-assets/{id}/authors`, `ip-assets/{id}/authors/{authorId}`, `ip-assets/{id}/certificate/download-link`, `watch`, `watch/{id}`, `competitors`, `competitors/{id}` y `people`. Los cambios usan `If-Match`.

## Para quien continúe

- El módulo vive en `apps/api/src/modules/inn` y se publica como `@arza/api/inn` para el worker. Compile la API antes de analizar el worker.
- Innovación no lee tablas de otros módulos: pide a Talento humano `signedEmploymentContractOfUser`, a Contratos `visibleContractByCode` y a Documentos `recordSystemForm` y `systemFormPdf`.
- Rutas de pruebas en `apps/api/test/support/api-paths-inn.ts`; recorrido de auditoría en `apps/api/test/int/audit/support/inn-route-calls.ts`.
