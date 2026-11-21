# Cierre del bloque B37 — Seguridad y salud en el trabajo

- Módulo: M13 · Fase F7 · Depende de B36
- Construido por Claude Code el 20/11/2026, con el plan aprobado por el propietario («Apruebo todo», 14 decisiones).
- Rama `feat/b37-seguridad-y-salud-en-el-trabaj`, desde `main` (f312d42).
- Dos entregas:
  - PR #86: datos, API y pruebas.
  - Segunda PR: pantallas, prueba de celular, documentación y este cierre.
- Documentación del módulo: `docs/manual/datos/sst.md`.

## Qué se construyó

- **Reporte desde el celular.**
  - En **Mi espacio › Reportar a SST** cualquier colaborador elige qué reporta: condición insegura, acto inseguro, incidente o accidente.
  - Escribe qué pasa y dónde, y puede agregar una foto. En un accidente indica además quién se lesionó.
  - SST recibe un aviso y la persona sigue el estado en Mi espacio.
- **Incidentes y accidentes.**
  - Siguen el orden reportado → en investigación → con plan de acción → cerrado.
  - El accidente muestra su plazo de **2 días hábiles** para la ARL, en rojo si ya venció. SST recibe la alerta al reportarse y cada mañana hasta registrar la fecha y el radicado del FURAT.
  - El plan de acción tiene causas y hasta tres acciones con responsable y fecha. Cada responsable las marca hechas desde su Mi espacio.
  - Un incidente se cierra solo con todas las acciones hechas y, si es accidente, reportado a la ARL.
- **Actos y condiciones inseguras.** SST los atiende y deja la respuesta.
- **Matriz de peligros con la GTC 45.** SST elige los niveles y la plataforma calcula el nivel de riesgo (I a IV) y si es aceptable.
- **Plan anual de trabajo.**
  - Una actividad solo se da por hecha con su evidencia, que se sube desde el mismo formulario.
  - El plan muestra el cumplimiento del año y el cumplimiento a la fecha.
  - El responsable de una actividad vencida recibe un aviso.
- **Inspecciones.**
  - De instalaciones y de emergencias, con listas de chequeo editables.
  - La del puesto de trabajo en casa: SST la pide, el colaborador la responde en Mi espacio (sin dirección exacta) y SST la revisa.
- **Salud.**
  - Solo se registra el concepto de aptitud, las restricciones y la próxima fecha; nunca diagnósticos.
  - Las restricciones van cifradas y cada consulta queda registrada. Las ven SST y la propia persona.
  - Un mes antes de la próxima evaluación, SST recibe un aviso.
  - El examen de ingreso cierra la tarea de inducción de Talento humano, y el de egreso, el ítem del retiro.
- **Elementos de protección.** SST registra la entrega y el colaborador confirma el recibo.
- **Comités.**
  - SST registra a los integrantes del COPASST y del Comité de Convivencia.
  - Lo del Comité de Convivencia (actas y quejas) solo lo ven sus integrantes vigentes: ni SST, ni la Dirección, ni el administrador.
- **Canal confidencial de convivencia.** Cualquier colaborador presenta una queja cifrada; el comité la tramita y quien la presentó ve solo el estado.
- **Estándares mínimos.** Autoevaluación con la tabla de 60 estándares de la Resolución 0312 de 2019. Suma 100 puntos y clasifica el resultado como crítico, moderadamente aceptable o aceptable.
- **Portada de SST** con incidentes abiertos, accidentes por reportar, cumplimiento del plan y puntaje de estándares.

### Criterios de aceptación (ficha 17.14)

| Criterio                                                                                    | Cómo se cumple                                                                                 | Prueba                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cualquier colaborador reporta una condición insegura en menos de un minuto desde su celular | Formulario de tres datos en pantalla de 390 px, botones grandes, sin desplazamiento horizontal | `apps/web/e2e/sst.spec.ts` mide menos de 60 s en un celular simulado; `test/int/sst/incidents.int.test.ts`                                                     |
| La autoevaluación calcula el puntaje y coincide con RE-SST-003                              | Puntaje con la tabla oficial de la Resolución 0312 (100 puntos) y su clasificación             | `packages/contracts/src/sst/sst.test.ts` y `test/int/sst/planning.int.test.ts`. **RE-SST-003 no está en el repositorio: queda por comparar (ver Pendientes).** |
| El plan anual muestra porcentaje de cumplimiento con evidencias                             | Dos porcentajes; «hecha» exige evidencia, también en la base de datos                          | `sst.test.ts`, `planning.int.test.ts`, `sst-planning.test.tsx`                                                                                                 |
| Accidente reportado a la ARL en 2 días hábiles; el sistema alerta y registra la fecha       | Plazo con el calendario de festivos, alerta inmediata y diaria, fecha y radicado               | `incidents.int.test.ts`                                                                                                                                        |
| Solo concepto de aptitud y restricciones; nunca diagnósticos                                | Sin campo de diagnóstico; restricciones cifradas y lectura registrada                          | `health.int.test.ts`                                                                                                                                           |
| Información del Comité de Convivencia restringida a sus integrantes                         | La regla vive en la API, no en la pantalla                                                     | `committees.int.test.ts`                                                                                                                                       |

## Decisiones (aprobadas el 20/11/2026)

1. Dos entregas (PR #86 y la segunda). Los archivos sueltos del propietario no se tocaron.
2. Permisos nuevos:
   - `sst.read` (Dirección, Calidad, Talento humano, SST y Auditor), sin salud ni convivencia.
   - `sst.ppe.manage` (SST).
   - El catálogo pasa de 210 a 212 permisos.
3. Matriz de peligros con la GTC 45.
4. Estándares mínimos con la tabla de 60 de la Resolución 0312, «por validar».
5. ARL solo para accidentes: 2 días hábiles, con alerta al reportar y cada día.
6. Las acciones de la investigación viven en SST hasta que exista Calidad (B38).
7. Salud: solo concepto, restricciones cifradas y lectura registrada; las ven SST y la persona.
8. Convivencia: solo sus integrantes vigentes.
9. Canal confidencial de quejas de convivencia (Ley 1010 de 2006).
10. Reporte desde el celular en tres datos; no es anónimo y solo lo ve SST.
11. Inspecciones con listas editables; la del puesto en casa la responde el colaborador.
12. Elementos de protección: SST entrega y el colaborador confirma.
13. El examen de ingreso o de egreso cierra lo pendiente en Talento humano.
14. Plan con evidencia obligatoria y dos porcentajes. Los registros no se borran solos (deben guardarse 20 años).

### Decisiones técnicas menores tomadas durante la construcción

- Las rutas de lo de Convivencia (actas, quejas) piden el permiso que tiene todo colaborador (`sst.incident.report`). Luego la API exige ser integrante vigente: si no lo es, responde «Solo los integrantes vigentes del comité…» (403). Ningún permiso del catálogo sirve para saltarse esa regla.
- El aviso de accidente por reportar a la ARL **no es urgente**: la plataforma reserva lo urgente para la seguridad y la mesa de ayuda (regla vigente). Llega dentro de la jornada laboral.
- El aviso de evaluación médica por vencer no lleva el nombre del colaborador: se consulta en la plataforma.
- El acta del comité no exige PDF. Su resumen va cifrado en todos los comités, no solo en Convivencia.
- La foto del reporte y la evidencia del plan se suben desde el mismo formulario. Se usan solo cuando el antivirus las deja «Disponible»; mientras tanto el botón dice «Esperando la foto…».
- Quien solo lee SST (Calidad, Auditor) no tiene permisos de Talento humano. Para ellos el módulo «Talento y SST» abre directo la portada de SST.

## Cómo probarlo en el navegador (paso a paso)

Antes de empezar, en una terminal ejecute en este orden:

```powershell
pnpm infra:up
```

```powershell
pnpm db:migrate
```

```powershell
pnpm db:seed
```

```powershell
pnpm dev
```

Use cuentas de prueba: una con el rol **SST**, un colaborador vinculado (B35) y un segundo colaborador.

1. **Reporte desde el celular.** Abra la plataforma en su celular, o en el navegador del computador con la vista de celular (tecla F12 › ícono de celular). Entre como el colaborador › **Mi espacio** › **Reportar a SST**.
   - Elija «Condición insegura», escriba qué pasa y dónde, y pulse **Enviar reporte**. Debe tardar menos de un minuto y mostrar un código RPT-….
   - Vuelva a Mi espacio: el reporte aparece «Reportado».
2. **Un accidente.** Repita, pero elija «Accidente»: le pedirá quién se lesionó (elija «Yo»).
3. **SST lo atiende.** Entre con la cuenta SST › **Talento y SST › Seguridad y salud**. La portada muestra el accidente por reportar.
   - Entre a **Incidentes y reportes**: verá «ARL: reportar a más tardar el …».
   - Pulse **Registrar reporte a la ARL** con una fecha y un radicado inventado.
   - Luego pulse **Investigar** y después **Registrar plan**, poniendo como responsable de una acción al colaborador.
4. **El responsable cumple.** Como el colaborador, en **Mi espacio › Mis tareas de SST**, pulse **Marcar hecha**. Como SST, pulse **Cerrar** en el incidente.
5. **Condición insegura.** Como SST, en «Actos y condiciones inseguras» pulse **Atender** › «Atendido». El colaborador ve el estado en Mi espacio.
6. **Matriz de peligros.** Como SST › **Matriz de peligros** › **Agregar peligro**. Con deficiencia 6, exposición 4 y consecuencia 25, la etiqueta dice «Nivel I (600) · No aceptable».
7. **Plan anual.** Como SST › **Plan anual** › **Agregar actividad** con fecha de hoy.
   - Pulse **Dar por hecha**, suba un PDF como evidencia, espere a que diga «Disponible» y guarde.
   - Los porcentajes suben.
8. **Autoinspección en casa.** Como SST › **Inspecciones** › **Pedir autoinspección en casa** para el colaborador.
   - Como colaborador, en Mi espacio responda cada punto.
   - Como SST, pulse **Revisar** y escriba los hallazgos.
9. **Salud.** Como SST › **Salud y protección** › **Registrar concepto**: «Apto con restricciones», con una restricción.
   - Pulse **Ver restricciones**: la consulta queda en Auditoría (busque `sst.medical.read`).
   - Entre con Talento humano o con Dirección: no ven los conceptos.
   - Como colaborador, en Mi espacio pulse **Ver mis conceptos**.
10. **Elementos de protección.** Como SST › **Registrar entrega** (Reposapiés). Como colaborador, en Mi espacio pulse **Confirmar recibo**.
11. **Comité de Convivencia.** Como SST › **Comités** › **Agregar integrante**: el segundo colaborador, comité «Convivencia».
    - Como el primer colaborador, en Mi espacio pulse **Presentar una queja**.
    - Como el segundo colaborador (integrante), en **Comités** pulse **Ver quejas** y **Tramitar**.
    - Como SST, en Comités: **no** aparecen las actas ni las quejas de Convivencia.
12. **Estándares mínimos.** Como SST › **Estándares mínimos** › **Evaluar** algunos estándares. El puntaje y la clasificación cambian. Pruebe «No aplica» sin justificación: no se deja.

## Verificaciones

Ejecutadas localmente el 20 y el 21/11/2026. En el PR #86 la verificación automática pasó migraciones, unitarias, integración con cobertura, navegador y despliegue de ensayo.

| Verificación                     | Resultado                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos (`packages/contracts`) | 257 pruebas en verde                                                                                                                                                              |
| API unitarias y OpenAPI          | 443 pruebas en verde; OpenAPI regenerado (solo se suman las rutas de SST y 5 tipos de aviso; ninguna ruta existente cambió)                                                       |
| Worker                           | 42 pruebas en verde                                                                                                                                                               |
| Integración SST (base real)      | 34 pruebas: permiso denegado, aislamiento entre empresas, cifrado, auditoría, plazos, alertas, reintentos, fechas imposibles y pasos fuera de orden; 86 % de las ramas del módulo |
| Recorrido de auditoría           | Las 28 rutas de SST que escriben dejan su evento                                                                                                                                  |
| Integración general afectada     | Roles y permisos, semillas, permisos de base de datos, aislamiento, columnas de control, migraciones y avisos: 84; Talento humano: 58                                             |
| Web                              | 29 pruebas de las pantallas de SST; suite completa: 895 en verde (las fallas que aparecieron con el equipo cargado pasaron al repetirlas solas)                                   |
| Tipos (`pnpm typecheck`)         | 13 de 13 paquetes                                                                                                                                                                 |
| Analizador                       | Sin errores en todo lo tocado                                                                                                                                                     |

**No ejecutado localmente:** el recorrido en el navegador `apps/web/e2e/sst.spec.ts` y el resto de pruebas de navegador. El navegador de pruebas instalado (1243) no corresponde a la versión de Playwright del repositorio (1.65), e instalarlo requiere una descarga que no se hizo sin su autorización. Lo ejecuta la verificación automática de GitHub (CI) en el PR.

## Pendientes

1. **RE-SST-003.** El archivo no está en el repositorio. Hay que comparar la tabla de 60 estándares y sus pesos con ese registro.
2. **Número de trabajadores.** Las empresas pequeñas pueden evaluarse con 7 o 21 estándares en vez de 60. Hoy se usan los 60. Si ARZA TECH tiene menos de 50 trabajadores, conviene decidir si se ajusta.
3. **Validación profesional.** Deben validar estos contenidos el profesional de SST con licencia (capítulo 24, contenido regulado) y el propietario:
   - la GTC 45,
   - las listas de chequeo,
   - el catálogo de elementos de protección,
   - los textos de los avisos.
4. **Calidad (B38).** Las acciones de las investigaciones deberán pasarse al módulo de Calidad cuando exista.
5. **Conflicto de interés en Convivencia.** Si una queja involucra a un integrante del comité, hoy ese integrante también la ve. El procedimiento del comité (RE-SST-007) debe definir cómo se aparta.
6. **Pendientes que no entraron en este bloque:**
   - el formato FURAT en PDF,
   - adjuntar el acta firmada desde la pantalla (la API ya lo acepta),
   - indicadores de accidentalidad y ausentismo (estándares 3.3.x) calculados por la plataforma.

## Lineamientos visuales (B22A)

- Componentes de `@arza/ui` y colores de `tokens.css`.
- Una sola acción principal por pantalla.
- Estados con texto, no solo con color.
- Formularios con mensaje junto al campo y resumen de errores.
- El formulario del celular usa áreas táctiles de al menos 44 px.
