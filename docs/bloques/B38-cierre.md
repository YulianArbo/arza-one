# Cierre del bloque B38 — Calidad: procesos, riesgos, no conformidades y acciones

- Módulo: M14 · Fase F7 · Depende de B15
- Construido por Claude Code el 21/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b38-calidad-procesos-riesgos-no-co`, desde la rama de B37 (`84d99ba`), que ya tiene las pantallas de SST.
- Antes de empezar se abrió el PR #88 para llevar a `main` las pantallas de SST que quedaron fuera (decisión 1).
- Documentación del módulo: `docs/manual/datos/qms.md`.

## Qué se construyó

- **Reportar una no conformidad.** Cualquier colaborador entra a **Calidad**, cuenta qué se detectó y la fecha, y luego ve el estado de lo que reportó. Calidad recibe un aviso.
- **Queja procedente → no conformidad.** Cuando se aprueba la respuesta de una queja o un reclamo procedente en Servicio, la no conformidad se crea sola en el mismo paso, enlazada al radicado de la PQRSF. Su descripción no lleva datos de quien se quejó.
- **Incidente de SST → no conformidad.** Calidad puede abrir una no conformidad enlazada a un incidente de SST. Un mismo origen abre una sola no conformidad.
- **Flujo de la no conformidad**, como en la ficha 17.15:
  - Detectada → contenida → en análisis → con plan → verificada → cerrada eficaz o reabierta.
  - **Contener** pide la corrección inmediata, la clasificación (salida no conforme, no conformidad menor o mayor) y el proceso.
  - **Analizar** pide el método (cinco porqués o espina de pescado con las 6M) y la causa raíz.
  - **Registrar el plan** exige al menos una acción con responsable y fecha.
  - Queda **verificada** sola cuando todas sus acciones resultan eficaces. La Dirección o Calidad la cierra o la reabre.
- **Acciones correctivas y de mejora.**
  - Calidad las registra con responsable y fecha compromiso. El responsable recibe un aviso y la ve en **Mi espacio**.
  - El responsable la marca ejecutada con la evidencia.
  - **La eficacia la verifica otra persona**: ni el responsable ni quien la ejecutó. La plataforma y la base de datos lo impiden.
  - Si no fue eficaz, la no conformidad se reabre y vuelve a análisis.
- **Escalamiento.** Cada mañana (6:15) una acción vencida sin ejecutar avisa al responsable, a Calidad y a la Dirección. Se repite cada 7 días.
- **Bitácora de acciones (RE-SGC-002).** Muestra cada acción con su origen, hallazgo, causa raíz, responsable, fechas, estado y verificación. Se descarga en CSV para Excel; la descarga queda en la auditoría.
- **Riesgos y oportunidades.** Probabilidad e impacto de 1 a 5; la plataforma calcula el valor y el nivel (bajo, moderado, alto o crítico) y marca los que ya debían revisarse.
- **Mapa de procesos.** Usa los 10 procesos del organigrama (no hay una segunda lista). Calidad registra el tipo (estratégico, misional, de apoyo o de evaluación) y la caracterización.
- **Contexto y partes interesadas.** Matriz DOFA-PESTEL por año y matriz de partes interesadas.
- **Lecciones aprendidas.** Las registra Calidad y las lee todo el personal.
- **Portada de Calidad** con no conformidades abiertas, acciones vencidas, acciones por verificar y riesgos altos o críticos.
- Calidad salió de «Bloques posteriores» en el menú y quedó en **Gobierno**.

### Criterios de aceptación

| Criterio                                                                          | Cómo se cumple                                                                                          | Prueba                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una queja procedente crea la no conformidad enlazada                              | Se crea en la misma operación que aprueba la respuesta, con el radicado como origen                     | `apps/api/test/int/service/pqrsf.int.test.ts`                                                                                                                                |
| La bitácora coincide con RE-SGC-002                                               | 17 columnas en el orden propuesto, en pantalla y en CSV                                                 | `apps/api/test/int/qms/actions-log.int.test.ts` y `quality.test.tsx`. **El formato RE-SGC-002 no está en el repositorio: las columnas quedan por validar (ver Pendientes).** |
| Toda no conformidad exige corrección, causa raíz y acción con responsable y fecha | La API y la base de datos lo exigen paso a paso                                                         | `nonconformities.int.test.ts`                                                                                                                                                |
| La eficacia la verifica alguien distinto de quien ejecutó                         | 403 `QMS_SELF_VERIFICATION` y regla en la base                                                          | `nonconformities.int.test.ts`                                                                                                                                                |
| Las acciones vencidas escalan a la Dirección                                      | Trabajo diario `qms.daily-work`, cada 7 días                                                            | `actions-log.int.test.ts`                                                                                                                                                    |
| Permiso denegado, aislamiento entre empresas y auditoría                          | Cada grupo de rutas tiene su prueba de 403 y de otra empresa; las 21 rutas que escriben dejan auditoría | `test/int/qms/*`, `write-routes-audited.int.test.ts`                                                                                                                         |

## Decisiones (aprobadas el 21/11/2026)

1. PR aparte (#88) para llevar a `main` las pantallas de SST que faltaban.
2. Dos partes de trabajo: datos, API y pruebas; luego pantallas y cierre. Van en un solo PR porque comparten rama.
3. Permiso nuevo `qms.read` (Dirección, Calidad, Auditor). Los demás ven lo que reportaron y sus acciones. Permiso nuevo `qms.lesson.read` para todo rol interno. Total: 214 permisos.
4. La queja o el reclamo procedente abre la no conformidad en la misma operación. El aviso viejo de la PQRSF para Calidad se reemplazó por el de la no conformidad.
5. Calidad abre la no conformidad de un incidente de SST; las acciones de investigación siguen en SST.
6. Clasificación: salida no conforme, no conformidad menor y mayor.
7. Análisis: cinco porqués o espina de pescado (6M); la causa raíz es obligatoria.
8. Verifica la eficacia alguien distinto del responsable y de quien ejecutó. Si no fue eficaz, la no conformidad se reabre.
9. Escala de riesgos 1–5 × 1–5: bajo hasta 4, moderado hasta 9, alto hasta 16, crítico desde 17. **Por validar** frente a FT-SGC-003.
10. Columnas de la bitácora RE-SGC-002 propuestas. **Por validar.**
11. Escalamiento al día siguiente del vencimiento, repetido cada 7 días.
12. No se cargó el mapa real de ARZA: se usan los procesos del organigrama y Calidad los caracteriza.

Decisiones técnicas tomadas durante la construcción:

- `qms_processes` guarda la caracterización de un proceso del núcleo (`org_unit_id`) en lugar de repetir código, nombre y responsable. Así hay una sola lista de procesos.
- La acción de una no conformidad es «correctiva»; la de un riesgo o una mejora, «de mejora».
- Ruta nueva `GET /v1/qms/people` para elegir responsables en los formularios.
- Los formularios compartidos de Talento humano aceptan ahora qué listas refrescar al guardar (`refresh`), para que las de Calidad se actualicen.

## Cómo probarlo en su navegador

Necesita el ambiente local encendido (`pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed` y `pnpm dev`) y tres cuentas de prueba: una con el rol **Calidad**, otra con **Calidad** o **Dirección** (para verificar) y una de **Colaborador**.

1. **Reportar.** Entre con el colaborador. Abra **Calidad** en el menú (grupo Gobierno) y pulse **Reportar una no conformidad**. Escriba qué se detectó y guarde. Abajo aparece en «No conformidades que reporté», como **Detectada**.
2. **Contener.** Entre con Calidad. Vaya a **Calidad › No conformidades**. En la que acaba de reportar, pulse **Contener**, escriba la corrección inmediata, elija la clasificación y el proceso, y guarde. Queda **Contenida**.
3. **Analizar.** Pulse **Analizar causa**. Elija «Cinco porqués», llene al menos un porqué y la causa raíz. Queda **En análisis**.
4. **Acción.** Pulse **Agregar acción**: escriba qué se hará, elija como responsable al colaborador y una fecha. Luego pulse **Registrar plan**. Queda **Con plan**.
5. **Ejecutar.** Entre con el colaborador y abra **Mi espacio**. En «Mis acciones de calidad» pulse **Marcar ejecutada** y escriba la evidencia.
6. **Verificar.** Entre con la segunda cuenta (Calidad o Dirección). Vaya a **Calidad › Bitácora de acciones** y pulse **Verificar eficacia** en esa acción. Elija «Eficaz» y guarde. La no conformidad pasa a **Verificada**.
   - Pruebe también que quien ejecutó la acción **no** puede verificarla: verá un mensaje de que debe hacerlo otra persona.
7. **Cerrar.** En **No conformidades**, pulse **Cerrar como eficaz**. Queda **Cerrada eficaz**.
8. **Queja procedente.** En **Servicio › PQRSF**, tramite una queja, márquela como procedente y apruebe la respuesta con otra persona. En **Calidad › No conformidades** aparece una nueva con origen «Queja o reclamo procedente» y el radicado.
9. **Bitácora.** En **Calidad › Bitácora de acciones** pulse **Descargar bitácora (CSV)** y ábrala en Excel. Compare las columnas con su formato RE-SGC-002.
10. **Riesgos, procesos, contexto y lecciones.** Registre un riesgo con probabilidad 4 e impacto 5: debe salir «Crítico (4 × 5 = 20)». Caracterice un proceso en **Mapa de procesos**, agregue un factor DOFA y una lección.
11. **Permisos.** Con el colaborador, escriba en la barra de direcciones `/app/calidad/riesgos`: debe ver «Sin permiso».

## Cómo se verificó

Pasos de `pnpm check` ejecutados en local el 21/11/2026. El equipo tiene poca memoria libre (unos 760 MB), por eso los paquetes se corrieron uno a la vez.

| Verificación                                                            | Resultado                                                                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato, tipos compartidos, analizador, `typecheck`, límites de módulos | En verde                                                                                                                                     |
| Código sin usar (`knip`)                                                | Halló 6 nombres exportados sin uso; se dejaron internos (`27184f5`)                                                                          |
| Pruebas unitarias                                                       | En verde los 13 paquetes: contratos 270, API 451, worker 42, web 924, UI 60 y demás                                                          |
| Cobertura web                                                           | 85,2 % de ramas (mínimo 85 %). Para llegar se agregaron 9 pruebas de Calidad                                                                 |
| Integración                                                             | 1.582 pasaron en la corrida completa; las 17 que fallaron por conexiones agotadas pasaron al repetirlas. Calidad: 15 de 15. Worker: 25 de 25 |
| Compilación                                                             | En verde; se generan las 7 páginas de Calidad                                                                                                |
| Secretos (`gitleaks`)                                                   | Sin hallazgos en 619 commits                                                                                                                 |

**Errores reales que encontraron las pruebas y se corrigieron:**

- En el análisis con espina de pescado, la causa de la categoría «Método» compartía el nombre interno con el selector del método de análisis y se perdía lo escrito (`f342704`).
- La fecha de apertura de una acción y la fecha de una lección salían con el día siguiente si se registraban después de las 7 p. m. (se calculaban en hora UTC y no en la de Colombia) (`54e76f5`).

**No ejecutado en local:**

- Las pruebas de navegador (`pnpm test:e2e`). El navegador instalado (1243) no corresponde al que pide Playwright 1.65 (1255) e instalarlo es una descarga. Las ejecuta la verificación automática de GitHub (CI) en el PR.
- La cobertura de la integración de la API en una sola corrida completa: las pruebas pasaron en corridas separadas. También la mide la CI.

## Pendientes

- **Validar con su formato RE-SGC-002** las 17 columnas de la bitácora, y **FT-SGC-003** la escala de riesgos. Si cambian, es un ajuste pequeño.
- Las **auditorías internas**, los **indicadores** y la **revisión por la dirección** son del bloque B39. El origen «auditoría» de la no conformidad ya está preparado.
- La evidencia de una acción se registra como texto; adjuntar un archivo ya lo admite la API, pero la pantalla aún no lo ofrece.
- Hallazgo de B37 (no corregido aquí, fuera de alcance): varias listas de SST no se refrescan solas después de guardar con los formularios compartidos. Con el ajuste `refresh` de este bloque se corrige en una línea por formulario.
- El PR #88 (pantallas de SST a `main`) debe fusionarse antes que este.
