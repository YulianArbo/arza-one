# Cierre del bloque B46 — Tableros gerenciales y requisitos legales

- Módulo: M16 · Fase F9 · Depende de B39 y B31
- Construido por Claude Code el 26/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b46-tableros-gerenciales-y-requisi`, desde `e1b2394` (`main` con B45 fusionado, PR #101).
- Documentación del módulo: `docs/manual/datos/direccion.md`.
- Bloque crítico: no (no requiere revisión externa).

## Qué se construyó

- **Menú «Dirección»** (grupo Gobierno). Reemplaza la entrada «Indicadores», que mostraba «Disponible pronto». Tiene cuatro pantallas.
- **Tablero gerencial.** Ventas facturadas del mes y del año, oportunidades abiertas, cartera por cobrar y vencida, proyectos en riesgo, satisfacción de los clientes y cumplimiento legal.
- **Tablero de cumplimiento.** Cuentas internas sin segundo factor, cuentas activas sin uso, administradores de la plataforma, personas con funciones en conflicto, tareas vencidas, versiones de documentos por revisar o aprobar, solicitudes de cambio pendientes, y requisitos legales sin evaluar o que no se cumplen.
- **En los dos tableros, cada cifra:**
  - dice **cómo se calcula** («¿Cómo se calcula?»);
  - abre **los registros que la originan** («Ver registros») y lleva al **listado completo** de su módulo;
  - si la persona no puede ver el listado de origen, muestra «No tiene permiso para ver este dato» y no calcula nada.
  - Las cifras se calculan al abrir la pantalla y se muestra la hora del corte (hora de Colombia).
- **Cuadro de mando.**
  - Objetivos del plan estratégico en las cuatro perspectivas (financiera, clientes, procesos internos, aprendizaje y crecimiento).
  - Cada objetivo muestra sus indicadores de Calidad, el último resultado, si cumplen la meta y la tendencia, y un estado: cumple, cumple en parte, no cumple o sin mediciones.
  - Calidad registra los objetivos y les asigna indicadores en la misma pantalla.
  - La Dirección, Calidad y el Auditor ven toda la empresa; los demás roles con tablero de proceso ven solo los objetivos que miden los procesos de su cargo.
- **Normograma (RE-DG-001) y evaluación de cumplimiento.**
  - Calidad registra los requisitos legales (tipo de norma, norma, entidad, artículos, qué exige, cómo se cumple, proceso, responsable y si aplica).
  - También los **carga desde un archivo CSV**: primero se revisa fila por fila y, con un solo error, no se guarda nada. Repetir la carga actualiza sin duplicar.
  - La Dirección o Calidad **evalúan** cada requisito cada semestre. Un resultado «parcial» o «no cumple» **abre la acción de mejora** en Calidad en la misma operación.
  - Cada requisito muestra **su última evaluación** y su historial. Los que aplican y no se han evaluado en el semestre quedan marcados.
  - Se descarga en CSV y la descarga queda en la auditoría.
  - **Aviso:** desde 30 días antes de cerrar el semestre, Calidad y la Dirección reciben un aviso (una sola vez) si quedan requisitos sin evaluar.
  - Las empresas de demostración traen 14 requisitos de ejemplo tomados del capítulo 20 del manual.

### Criterios de aceptación

| Criterio (ficha 17.17)                                                             | Cómo se cumple                                                                                    | Prueba                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Las cifras del tablero coinciden con las consultas directas a cada módulo          | Cada cifra sale de una lectura del módulo dueño, con los mismos filtros de su listado             | `test/int/dashboard/executive.int.test.ts` (ventas, cartera contra el listado de facturas, oportunidades contra el listado de Comercial, proyectos en riesgo) y `compliance.int.test.ts` (accesos contra el informe de revisión de accesos, tareas, documentos) |
| Toda cifra permite llegar al listado de registros que la origina                   | «Ver registros» y enlace al listado                                                               | `executive.int.test.ts`, `compliance.int.test.ts`, `direction-boards.test.tsx`                                                                                                                                                                                  |
| Nadie ve por un indicador lo que no puede ver por el listado                       | La cifra solo se calcula con el permiso del listado de origen; el detalle responde 403 sin él     | `executive.int.test.ts` (Calidad no ve ventas), `compliance.int.test.ts` (Calidad no ve accesos)                                                                                                                                                                |
| Los cálculos se documentan en la ficha del indicador                               | Texto «¿Cómo se calcula?» en cada cifra, el mismo en la API y la web                              | `dashboard.test.ts` (contratos)                                                                                                                                                                                                                                 |
| El normograma coincide con RE-DG-001 y cada requisito muestra su última evaluación | Columnas propuestas (por validar) y última evaluación en pantalla y en el CSV                     | `legal.int.test.ts`, `legal-import.int.test.ts`, `direction-normograma.test.tsx`. **El formato RE-DG-001 no está en el repositorio: las columnas quedan por validar.**                                                                                          |
| Permiso denegado, aislamiento entre empresas y auditoría                           | 403 por rol, 404 desde otra empresa; las 8 rutas nuevas que escriben dejan su evento de auditoría | `test/int/qms/legal*.ts`, `strategy.int.test.ts`, `test/int/dashboard/*`, `write-routes-audited.int.test.ts`                                                                                                                                                    |

## Decisiones (aprobadas el 26/11/2026)

1. Los tableros son un módulo nuevo (`dashboard`) sin tablas, que solo lee lo que publica cada módulo. El normograma y los objetivos viven en Calidad (tablas `qms_`, como dice el capítulo 12).
2. Cálculo de cada cifra del tablero gerencial: ventas sin IVA menos notas crédito; oportunidades abiertas; cartera pendiente y vencida; proyectos «en riesgo»; satisfacción de 90 días; porcentaje de requisitos que cumplen.
3. Sin permiso para el listado de origen, la tarjeta dice «No tiene permiso para ver este dato».
4. Tabla nueva de objetivos estratégicos; Calidad los administra y les asigna indicadores.
5. «Tableros de proceso (solo lo propio)» = cuadro de mando limitado a los procesos del cargo.
6. Normograma por registro manual y por carga CSV con revisión previa; 14 requisitos de ejemplo para la demostración. **Columnas por validar** frente a RE-DG-001.
7. Evaluación semestral con cuatro resultados; parcial o no cumple obliga a la acción de mejora.
8. Aviso 30 días antes de cerrar el semestre a Calidad y a la Dirección.
9. Pares de funciones en conflicto (alerta, no bloqueo; **por validar**): solicitar y aprobar facturas; registrar y aprobar gastos; registrar recaudos y conciliar bancos; emitir y recibir órdenes de compra; crear y asignar roles.
10. Contenido del tablero de cumplimiento (ver arriba).
11. Cifras al momento, con la hora del corte.
12. Un solo pull request con commits pequeños.

### Ajustes y decisiones técnicas tomadas durante la construcción

- **Cuentas sin uso: 60 días, no 90.** El plan decía «90 días sin ingresar». Para que la cifra coincida con el informe de revisión de accesos (B45), que ya usa 60 días, el tablero usa la misma regla. Si usted prefiere 90, se cambia en un solo lugar (`ACCESS_RULES.unusedAccountDays`) y cambiaría también el informe de accesos.
- **Notas crédito en las ventas sin IVA:** como una nota crédito se registra por su valor total, se descuenta su parte sin IVA (valor de la nota × subtotal ÷ total de la factura).
- **Tareas vencidas:** son las que el motor de tareas ya marcó «Vencida», el mismo filtro del tablero de tareas.
- **Documentos por revisar:** se cuentan con los mismos filtros de visibilidad del listado de documentos; un documento reservado solo lo cuenta quien puede verlo.
- **La evaluación no se cambia** una vez guardada: la base de datos solo permite agregar evaluaciones nuevas. La última es la que cuenta.
- **Rutas:** el normograma y los objetivos quedan bajo `/v1/qms/…` (como el resto de Calidad) y los tableros bajo `/v1/dashboards/{tablero}/data` y `/drilldown`, como dice el capítulo 14.
- **Pantalla «en construcción»:** con B46 el menú ya no tiene módulos pendientes; la pantalla se conserva para los bloques siguientes (B47).

## Cómo probarlo en su navegador

Antes de empezar: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed:demo` y `pnpm dev`. Use las cuentas ficticias de prueba.

1. **Entre como Dirección** (rol Dirección).
   - En el menú, **Gobierno › Dirección**. Verá cuatro accesos: Tablero gerencial, Cuadro de mando, Tablero de cumplimiento y Normograma.
   - Abra **Tablero gerencial**. Cada tarjeta muestra la cifra en pesos, porcentaje o puntaje. Arriba dice a qué hora se calcularon las cifras.
   - En cualquier tarjeta abra **«¿Cómo se calcula?»** y lea la explicación.
   - Pulse **Ver registros**: aparece la lista de facturas, oportunidades o proyectos que forman la cifra. Pulse **Ir al listado completo** y compruebe que la pantalla del módulo muestra lo mismo.
2. **Tablero de cumplimiento** (como Dirección).
   - Compare «Cuentas internas sin segundo factor» y «Cuentas activas sin uso» con **Administración › Revisión de accesos**: deben coincidir.
   - Abra **Personas con funciones en conflicto › Ver registros**: aparecen, por ejemplo, los administradores de la plataforma (pueden crear y asignar roles).
3. **Normograma** (entre como Calidad).
   - Con los datos de demostración verá 14 requisitos marcados **«Por evaluar en el semestre»**.
   - Pulse **Registrar requisito**, llene norma, entidad y qué exige, y guarde. Aparece con un código NRM-….
   - Pulse **Evaluar** en un requisito, elija **No cumple**, escriba la evidencia y la acción de mejora (descripción, responsable y fecha) y guarde. El requisito muestra «No cumple» y el código de la acción (AC-…). En **Calidad › Acciones** está la acción nueva con origen «Evaluación del cumplimiento legal».
   - Pulse **Historial** para ver todas las evaluaciones del requisito.
   - Pulse **Cargar archivo**, elija un CSV con las columnas indicadas y pulse **Revisar**. Verá el resultado de cada fila. Solo si no hay errores se habilita **Guardar**.
   - Pulse **Descargar normograma (CSV)** y ábralo en Excel.
4. **Cuadro de mando** (como Calidad).
   - Abajo, en **Objetivos estratégicos**, pulse **Registrar objetivo** (por ejemplo «Clientes más satisfechos», perspectiva Clientes).
   - En la fila del objetivo pulse **Indicadores**, marque uno o varios y guarde.
   - Arriba, en la perspectiva Clientes, aparece el objetivo con sus indicadores y su estado.
5. **Permisos.**
   - Entre como Calidad al **Tablero gerencial**: las ventas y la cartera dicen «No tiene permiso para ver este dato» (Calidad no ve Finanzas).
   - Entre como Comercial: en Dirección solo verá el **Cuadro de mando**, con los objetivos de los procesos de su cargo.
   - Entre como Colaborador: «Dirección» no aparece en el menú. Si escribe la dirección `/app/direccion/tablero-gerencial`, no le muestra nada.

## Cómo se probó

Verificaciones ejecutadas en este equipo el 26/11/2026:

- **Pruebas de integración nuevas** (base de datos real en contenedor):
  - Normograma 7/7, carga por archivo 3/3, objetivos 3/3, aviso semestral 1/1 y semilla de demostración 1/1.
  - Tableros 10/10. Comparan las cifras con Finanzas, Comercial, Proyectos y la revisión de accesos, y prueban permiso denegado y aislamiento entre empresas.
- **Recorrido de auditoría:** 536/536 rutas que escriben dejan su evento, incluidas las 8 nuevas.
- **Migraciones:** se aplican desde cero, no cambian nada al repetirse y la base coincide con el modelo (5/5).
- **Pruebas unitarias:** contratos 320/320, API 521/521, web 1031/1031 (cobertura de ramas 85,25 %), componentes 60/60 y worker 50/50.
- **Pruebas de navegador** (Dirección, accesibilidad y menú): 46/46, sin violaciones de accesibilidad en modo claro ni oscuro.
- **Documento OpenAPI:** actualizado con las 13 rutas nuevas (4/4).
- Tipos, límites entre módulos y compilación (`pnpm build`, 7/7): en verde.
- **Código sin usar (knip):** limpio en el código del bloque. Solo marca las carpetas sueltas `.codex-ci-pr*` del propietario.
- **Análisis de estilo:** limpio en todos los archivos cambiados. El análisis de todo el repositorio se queda sin memoria en este equipo.
- **Corregido durante la verificación:** 4 errores de tipos en las pruebas, 8 exportaciones sin usar y la cobertura de la web, que había quedado en 84,85 % y subió con pruebas nuevas.
- **No se ejecutaron completas** en este equipo, por falta de memoria: la suite entera de integración (223 archivos), la suite entera de navegador y el formato de todo el repositorio, que falla por los archivos sueltos del propietario. Las confirma la integración continua del pull request.
- Dos fallos que no son de B46: 7 pruebas de los guiones de infraestructura se pasaron del tiempo con el equipo cargado, y una vez la herramienta de pruebas no encontró un archivo interno. Al repetir, las pruebas de contratos pasaron.
- **No se revisó a mano en el navegador.** Siga los pasos de «Cómo probarlo».

## Pendientes

- **Confirmar la cobertura en GitHub.** En la primera ejecución del PR #102 pasaron las 1.896 pruebas de integración de la API y las 26 del worker. La cobertura global de ramas de la API quedó en 84,84 % frente al mínimo de 85 %. Se agregaron casos de integración de Dirección y Calidad para ejercitar ramas del B46 que faltaban.
- **Validar las columnas del normograma** frente al formato RE-DG-001 y cargar el normograma real con la pantalla de carga. Los 14 requisitos de ejemplo no reemplazan el concepto del asesor jurídico.
- **Validar los pares de funciones en conflicto** (decisión 9) y decidir si «cuentas sin uso» sigue en 60 días.
- **Registrar los objetivos del plan estratégico** (PL-DG-001) y asignarles indicadores: el cuadro de mando arranca vacío.
- **La cartera por edades** sigue pendiente desde B31; el tablero muestra el saldo por cobrar y la parte vencida, sin el detalle por edades.
- Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/` y demás archivos sin seguimiento) siguen sin commit y no se tocaron.
