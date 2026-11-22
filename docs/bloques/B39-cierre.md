# Cierre del bloque B39 — Calidad: auditorías, indicadores y revisión por la dirección

- Módulo: M14 · Fase F7 · Depende de B38
- Construido por Claude Code entre el 21 y el 22/11/2026, con el plan aprobado por el propietario («Apruebo todo», 11 decisiones).
- Rama `feat/b39-calidad-auditorias-indicadores`, desde `445a87b`: el commit donde el PR #89 (B38) se fusionó en la rama de B37. **La rama `main` todavía no tiene B38** (ver Pendientes).
- Documentación del módulo: `docs/manual/datos/qms.md`.

## Qué se construyó

- **Programa anual de auditorías (PL-SGC-001).** Calidad lo crea con objetivos, alcance y criterios y lo publica. Hay uno por año.
- **Auditorías internas (PL-SGC-002).**
  - Calidad programa cada auditoría con su proceso, su auditor y su fecha. El auditor puede ser cualquier colaborador y recibe un aviso.
  - **Un auditor no audita su propio proceso.** La plataforma lo rechaza si el proceso es el de su cargo (o uno superior) o si su cargo dirige ese proceso. Lo revisa al programar, al reprogramar y otra vez al iniciar.
  - El auditor inicia la auditoría desde **Mi espacio**, diligencia la **lista de chequeo** (RE-SGC-003) y registra los **hallazgos**.
  - Al **emitir el informe**, cada hallazgo de no conformidad mayor o menor **abre sola su no conformidad**, enlazada a la auditoría. Las observaciones y las oportunidades de mejora pueden volverse una **acción de mejora**.
  - El **informe sale en PDF** con el encabezado institucional (RE-SGC-004) y se descarga desde la auditoría.
  - Calidad cierra la auditoría o la cancela con el motivo.
- **Indicadores (RE-SGC-006).**
  - Cada indicador tiene su **ficha**: proceso, nombre, objetivo, fórmula, unidad, meta, si conviene que suba o que baje, frecuencia, fuente y responsable.
  - **Ocho se calculan solos** cada día a las 6:30, con el periodo que acaba de cerrar:
    - acciones eficaces
    - acciones ejecutadas a tiempo
    - no conformidades abiertas
    - cumplimiento del programa de auditorías
    - tiquetes dentro del plazo acordado
    - PQRSF respondidas a tiempo
    - satisfacción de las encuestas
    - incidentes de trabajo

    Si no hay datos para calcular, no inventa un 0 %: espera al día siguiente.

  - Los demás los **registra su responsable** con el análisis y la evidencia. Desde el día 5 del periodo recibe un aviso si falta la medición.
  - La **matriz** muestra por proceso la meta, el último resultado, si cumple y la tendencia (sube, baja o estable). Se descarga en CSV.
  - Cada indicador tiene su **gráfica de tendencia** contra la meta.
- **Revisión por la dirección (RE-SGC-007).**
  - Calidad crea el acta del periodo y pulsa **«Precargar entradas»**. La plataforma trae:
    - las acciones de revisiones anteriores
    - el contexto DOFA del año
    - la satisfacción de los clientes y las PQRSF
    - el último resultado de cada indicador
    - las no conformidades, las acciones y los incidentes
    - las auditorías
    - los riesgos altos y críticos
  - Proveedores, recursos y oportunidades de mejora se escriben a mano en el comentario de cada entrada.
  - Calidad escribe las conclusiones y las **decisiones** (cada una con responsable y fecha) y envía el acta. La Dirección recibe un aviso.
  - **Solo la Dirección** la **devuelve** (con el motivo) o la **aprueba**. Al aprobarse, cada decisión se vuelve una acción de mejora en la bitácora, el acta queda fija (la base de datos no deja cambiarla) y se genera su **PDF**.
- **Mi espacio** muestra «Mis auditorías» y «Mis indicadores». La portada de Calidad enlaza las tres partes nuevas.

### Criterios de aceptación

| Criterio                                                 | Cómo se cumple                                                                                                     | Prueba                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Un auditor no puede auditar su proceso                   | 403 `QMS_AUDITOR_OWN_PROCESS` al programar, al reprogramar y al iniciar                                            | `apps/api/test/int/qms/audits.int.test.ts`                                                                                                     |
| La matriz coincide con RE-SGC-006                        | 15 columnas, en pantalla y en CSV                                                                                  | `indicators.int.test.ts`, `quality-indicators.test.tsx`. **El formato RE-SGC-006 no está en el repositorio: las columnas quedan por validar.** |
| Indicadores automáticos cuando el dato existe            | 8 fuentes; sin datos no hay medición                                                                               | `indicators.int.test.ts`                                                                                                                       |
| Acta con entradas precargadas                            | «Precargar entradas» llena 7 de las 10 entradas                                                                    | `reviews.int.test.ts`, `quality-reviews.test.tsx`                                                                                              |
| Permiso denegado, aislamiento entre empresas y auditoría | Cada parte tiene su prueba de 403 y de otra empresa. Las 27 rutas nuevas que escriben dejan su evento de auditoría | `test/int/qms/*`, `write-routes-audited.int.test.ts`                                                                                           |

## Decisiones (aprobadas el 21/11/2026)

1. Cualquier colaborador puede ser auditor y ejecuta solo lo que le asignaron (`qms.audit.execute` pasó a «solo lo propio»). El rol Auditor sigue siendo de solo lectura.
2. «Su proceso» es el proceso donde está su cargo (o uno superior) o el que su cargo dirige.
3. Hallazgos: no conformidad mayor o menor (abren la no conformidad), observación y oportunidad de mejora (pueden volverse acción de mejora).
4. El programa anual lo publica Calidad, sin aprobación aparte.
5. Permiso nuevo `qms.review.approve`, solo para la Dirección (215 permisos en total).
6. Los 8 indicadores automáticos de la lista anterior.
7. El cálculo corre a diario a las 6:30 con el periodo que cerró. El aviso por un indicador manual sin medir sale desde el día 5, una vez por periodo.
8. Cumple o no cumple según la meta y el sentido. La tendencia compara con la medición anterior.
9. El informe y el acta se generan en PDF con la plantilla institucional y se descargan con un enlace de cinco minutos.
10. Columnas de la matriz: proceso, código, indicador, objetivo, fórmula, unidad, meta, frecuencia, fuente, responsable, último periodo, resultado, cumple, tendencia y análisis. **Por validar.**
11. Avisos nuevos: auditoría asignada, indicador por medir y acta por aprobar.

Decisiones técnicas tomadas durante la construcción:

- **Cifras de Servicio sin ciclo.** Servicio ya usa a Calidad desde B38: una queja procedente abre su no conformidad. Si Calidad importara a Servicio, los dos módulos quedarían en círculo, y las reglas del proyecto lo prohíben. Por eso Calidad declara qué cifras necesita y Servicio se las entrega al arrancar (`SERVICE_FIGURES`). Calidad nunca lee las tablas de Servicio.
- **Dónde quedan los PDF.** Se guardan como archivos de la plataforma, amarrados a la auditoría y al acta. No son documentos controlados del módulo Documentos, que tienen su propio flujo de versiones. Si quiere que entren al Listado Maestro, es un ajuste posterior.
- **Cambios de una ficha con mediciones.** Si un indicador ya tiene mediciones, no se le cambian la frecuencia ni la fuente, para que la serie siga siendo comparable.

## Cómo probarlo en su navegador

Necesita el ambiente local encendido (`pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed` y `pnpm dev`) y cuatro cuentas de prueba: **Calidad**, **Dirección**, **Auditor** y un **Colaborador**. El colaborador debe tener un cargo en un proceso distinto del que se va a auditar.

1. **Programa.** Entre con Calidad. Vaya a **Calidad › Programa y auditorías** y pulse **Crear programa anual**. Llénelo y pulse **Publicar**.
2. **Auditor independiente.** Pulse **Programar auditoría** y elija como auditor a una persona del mismo proceso auditado: verá el mensaje «Un auditor no puede auditar su propio proceso». Elija entonces al colaborador y guarde.
3. **Ejecutar.** Entre con el colaborador. En **Mi espacio › Mis auditorías** pulse **Abrir** y luego **Iniciar auditoría**.
   - Pulse **Agregar pregunta** dos veces para armar la lista de chequeo.
   - Pulse **Registrar hallazgo** dos veces: una «No conformidad menor» y una «Oportunidad de mejora».
   - Pulse **Emitir informe** y escriba las conclusiones.
4. **Resultado del informe.** Entre con Calidad. En **Calidad › No conformidades** aparece una nueva con origen «Auditoría interna». En la auditoría:
   - pulse **Crear acción de mejora** en la oportunidad;
   - pulse **Descargar informe (PDF)** (si dice que aún se está generando, espere un minuto);
   - pulse **Cerrar auditoría**.
5. **Indicador manual.** En **Calidad › Indicadores** pulse **Crear indicador** con fuente «Registro manual» y como responsable al colaborador. Entre con el colaborador: en **Mi espacio › Mis indicadores** pulse **Medir** y registre el resultado del mes pasado con su análisis y evidencia. Pruebe un valor bajo la meta: debe salir «No cumple».
6. **Indicador automático.** Con Calidad cree otro con fuente «Automático: No conformidades abiertas» y unidad «Número». En su detalle pulse **Calcular ahora**: aparece la medición calculada por la plataforma y la gráfica de tendencia.
7. **Matriz.** En **Indicadores** pulse **Descargar matriz (CSV)** y ábrala en Excel. Compare las columnas con su formato RE-SGC-006.
8. **Acta.** En **Calidad › Revisión por la dirección**:
   - pulse **Crear acta** y ábrala;
   - pulse **Precargar entradas**: aparecen las cifras de satisfacción, indicadores, auditorías y riesgos;
   - comente «Adecuación de los recursos», escriba las conclusiones y **agregue una decisión**;
   - pulse **Enviar a la Dirección**.
9. **Aprobar.** Entre con la Dirección y abra el acta.
   - Pruebe **Devolver a Calidad**: Calidad ve el motivo y la envía de nuevo.
   - Luego pulse **Aprobar acta**: la decisión muestra su acción «AC-…» y aparece **Descargar acta (PDF)**.
   - Compruebe que Calidad ya no puede editar el acta.
10. **Permisos.** Con el colaborador, escriba en la barra de direcciones `/app/calidad/indicadores`: debe ver «Sin permiso». Con Calidad, compruebe que no aparece el botón **Aprobar acta**.

## Cómo se verificó

Pasos de `pnpm check` ejecutados en local el 22/11/2026, uno a la vez porque el equipo tiene poca memoria.

| Verificación                    | Resultado                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                         | En verde en todos los archivos del repositorio. Los 213 avisos son de archivos sueltos del propietario que no están en Git.              |
| Tipos compartidos y `typecheck` | En verde (13 de 13)                                                                                                                      |
| Analizador                      | En verde en los 85 archivos que cambió el bloque                                                                                         |
| Límites entre módulos           | Sin violaciones (después de resolver el ciclo con Servicio, ver Decisiones técnicas)                                                     |
| Código sin usar (`knip`)        | En verde                                                                                                                                 |
| Pruebas unitarias               | En verde los 13 paquetes, con sus mínimos de cobertura: 15 nuevas de contratos, 4 de plantillas, 3 de avisos y 18 de pantallas           |
| Integración de Calidad          | 46 de 46. Recorrido de auditoría de las rutas de Calidad: 46 de 46                                                                       |
| Integración completa            | 194 archivos. En la primera pasada la base local se reinició por falta de memoria y fallaron 66; repetidos, pasaron los 66 (423 pruebas) |
| Compilación (`build`)           | En verde los 7 paquetes, incluida la web                                                                                                 |
| Secretos (`gitleaks`)           | Sin hallazgos en 630 commits                                                                                                             |

**Errores reales que encontraron las pruebas y se corrigieron:**

- **El acta no se podía enviar a la Dirección.** El nombre interno del evento llevaba un guion bajo y la base de datos solo acepta letras. Se renombró a `qms.review.submitted`.
- **Calidad y Servicio quedaban en círculo** al calcular los indicadores de Servicio. Se resolvió con un «puerto» que Servicio le entrega a Calidad.
- **Una prueba de PDF fallaba a veces** porque otra prueba en paralelo generaba el mismo PDF primero. Ahora comprueba el resultado y no el conteo.

**No ejecutado en local:** las pruebas de navegador (`pnpm test:e2e`). El navegador instalado (1243) no corresponde al que pide Playwright 1.65 (1255) e instalarlo es una descarga. Las ejecuta la verificación automática de GitHub en el PR.

## Pendientes

- **Validar con sus formatos** RE-SGC-003 (lista de chequeo), RE-SGC-004 (informe), RE-SGC-006 (matriz) y RE-SGC-007 (acta). Si cambian, son ajustes pequeños de columnas o del PDF.
- **Llevar B38 y B39 a `main`.** El PR #89 (B38) se fusionó en la rama de B37, no en `main`. Este PR se abre contra `main` e incluye B38.
- La evidencia de una medición manual se registra como texto. Adjuntar un archivo ya lo admite la API, pero la pantalla aún no lo ofrece (igual que en B38).
- **Indicadores de proveedores y de recursos:** la plataforma todavía no tiene esos datos y en el acta se escriben a mano.
- No hay prueba de navegador propia de Calidad. B38 tampoco la dejó; queda como mejora.
