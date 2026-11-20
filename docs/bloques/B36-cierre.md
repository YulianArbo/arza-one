# Cierre del bloque B36 — Talento humano: novedades, desempeño y retiro

- Estado: **Terminado** (PR #64 unido a `main`).
- Rama: `feat/b36-talento-humano-novedades-desem`, creada desde `main` (53d211b, ya con B35 y la
  etapa F0 de B22B).
- Plan aprobado por el propietario el 19/11/2026 («Apruebo todo»), con las 12 decisiones de abajo.
- Construido por Claude Code el 19/11/2026.

## Qué se construyó

La **segunda parte de Talento humano (M12)**: todo lo que pasa con un colaborador después de
vincularse.

| Parte                 | Qué hace                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mi espacio            | Cada colaborador ve sus datos, su banda salarial (nunca el valor), su saldo de vacaciones y descarga su contrato firmado. Solicita vacaciones y permisos, pide y reporta horas extras, acepta su evaluación, ve su formación, sus novedades de nómina y sus citaciones, y marca las tareas de inducción o retiro a su cargo |
| Mi equipo             | El jefe inmediato (según el organigrama) aprueba o rechaza ausencias, autoriza horas extras, fija objetivos y califica a su equipo directo                                                                                                                                                                                  |
| Permisos y vacaciones | Radicada → aprobada o rechazada → disfrutada. Saldo de 15 días hábiles por año. Talento humano registra incapacidades (sin diagnóstico) y vacaciones anticipadas                                                                                                                                                            |
| Horas extras          | Autorización previa, topes de 2 horas al día y 12 a la semana, reporte de las horas trabajadas                                                                                                                                                                                                                              |
| Novedades de nómina   | Por mes. Llegan solas las ausencias, las horas extras y los retiros; Talento humano registra las demás. Cerrar el mes es definitivo y permite descargar el archivo CSV para el software de nómina                                                                                                                           |
| Desempeño             | Objetivos con peso, calificación de 1 a 5 del jefe y aceptación del colaborador                                                                                                                                                                                                                                             |
| Formación y bienestar | Capacitaciones, inducciones y bienestar con asistencia y calificación                                                                                                                                                                                                                                                       |
| Disciplinario         | Apertura → citación (mínimo 3 días hábiles antes) → descargos con acta → decisión motivada. Textos cifrados, cada consulta auditada, solo Talento humano                                                                                                                                                                    |
| Retiro                | Motivo y último día, lista de chequeo por áreas, activos por devolver, **cuenta desactivada y sesiones cerradas al terminar el último día**, paz y salvo                                                                                                                                                                    |
| Reglas laborales      | Parámetro editable con vigencia en Organización › Parámetros                                                                                                                                                                                                                                                                |

Detalle funcional en `docs/manual/datos/hr.md`; reglas técnicas en `apps/api/README.md`.

### Criterios de aceptación

| Criterio                                                                                                              | Cómo se cumple                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Un colaborador ve y solicita sus vacaciones; su jefe las aprueba; la novedad llega al periodo de nómina (ficha 17.13) | Mi espacio → Mi equipo → novedad `VACACIONES` en el mes. Prueba `absences.int.test.ts`                                    |
| La matriz de novedades coincide con RE-GTH-003                                                                        | **Parcial**: el formato no está en el repositorio; los conceptos son una lista editable «por validar»                     |
| El retiro revoca accesos y lista activos por devolver (bloque)                                                        | Prueba `offboarding.int.test.ts`: cuenta inactiva, cero sesiones abiertas, la persona ya no entra (401), activos listados |
| Vincular crea cuenta, inducción, evaluación médica y equipo                                                           | Ya cumplido en B35                                                                                                        |
| Pruebas de permiso denegado, aislamiento y auditoría                                                                  | En cada archivo de `test/int/hr/` del B36 y las 31 rutas nuevas en el recorrido global de auditoría                       |

## Decisiones (aprobadas el 19/11/2026)

1. Rama desde `main`; las pantallas usan los componentes de B22B F0 (PageHeader, HighlightCard,
   QuickLinks).
2. Decide el jefe inmediato del organigrama; Talento humano y la Dirección también pueden; nadie
   decide lo propio.
3. Tipos de ausencia en lista editable; la incapacidad la registra solo Talento humano.
4. 15 días hábiles por año; no se pide más que el saldo; anticipadas las registra Talento humano.
5. 40 horas semanales; horas extras con tope 2/día y 12/semana; sin valores en pesos.
6. Novedades por mes; cierre por Talento humano o Dirección; CSV como en Finanzas; conceptos por
   validar; tabla adicional `hr_payroll_periods`.
7. Evaluación: objetivos con peso, el jefe califica de 1 a 5, el colaborador acepta.
8. Disciplinario: 3 días hábiles mínimos (parámetro); el colaborador ve citación y decisión.
9. Cuenta desactivada a medianoche del último día; en el acto si ya pasó.
10. Tarea de devolución de activos a Administrativo y financiero; paz y salvo en pantalla.
11. El colaborador descarga su contrato firmado y ve solo su banda.
12. Los responsables marcan sus tareas de inducción desde Mi espacio.

### Decisiones técnicas menores tomadas durante la construcción

- Las rutas de decisión del jefe exigen `hr.employee.read` (que tiene todo colaborador) y el caso
  de uso revisa que le corresponda; así un jefe con solo el rol de colaborador puede decidir.
- La lectura completa de un caso disciplinario es `POST …/read` (no `GET`) porque deja un registro
  de auditoría en cada consulta.
- La formación se programa para una persona o para todos los colaboradores activos (la pantalla
  no tiene selección múltiple).
- Los soportes del disciplinario (citación, acta, decisión) se cargan antes en Archivos y se
  indican por su identificador.

## Cómo probarlo en el navegador (paso a paso)

Antes: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed` y `pnpm dev`. Use cuentas de prueba.

1. **Prepare el organigrama.** En Organización › Cargos, haga que el cargo de una persona de prueba
   (por ejemplo «Analista») reporte al cargo de otra («Coordinador»). Asígneles esos cargos.
   Ambas deben estar vinculadas como colaboradores (B35).
2. **Solicite vacaciones.** Entre como el analista › menú **Mi espacio**. Verá su saldo de
   vacaciones y su banda salarial. Pulse **Solicitar ausencia**, elija Vacaciones y unas fechas.
   Intente pedir más días que su saldo: debe aparecer un mensaje claro.
3. **Apruébelas como jefe.** Entre como el coordinador › **Mi espacio** › **Ir a Mi equipo** (o
   `/app/mi-espacio/equipo`). Verá la solicitud: pulse **Aprobar**. El analista recibe un aviso.
4. **Vea la novedad.** Entre con Talento humano › Talento y SST › **Novedades de nómina**. En el
   mes de las vacaciones aparece «Vacaciones disfrutadas».
5. **Horas extras.** Como analista, **Pedir horas extras** para hoy (3 horas: debe rechazarlo por
   el tope; 2 horas: queda pedida). Como coordinador, **Autorizar**. Como analista, **Reportar
   horas** (1,5). Vuelva a Novedades de nómina: aparece la hora extra.
6. **Cierre el mes.** En Novedades de nómina elija un mes pasado › **Registrar novedad**
   (bonificación) › **Cerrar el mes**. Después intente registrar otra en ese mes: no se puede.
   Pulse **Descargar archivo**: se descarga un CSV que abre en Excel con comas decimales.
7. **Evaluación.** Como coordinador, en Mi equipo › **Nueva evaluación** (objetivos que sumen
   100 %) › **Calificar**. Como analista, en Mi espacio › **Aceptar evaluación**.
8. **Disciplinario.** Como Talento humano › Talento y SST › **Procesos disciplinarios** › **Abrir
   proceso** › **Citar a descargos** (pruebe una fecha a 1 día: debe rechazarla). Como analista,
   Mi espacio muestra la citación con los hechos. **Ver el caso** queda en la auditoría
   (Auditoría › buscar `hr.disciplinary.read`).
9. **Retiro.** Asigne antes un activo al analista (Compras › Activos). Como Talento humano ›
   **Retiros** › **Registrar retiro** con último día **ayer**. Compruebe: el analista ya no puede
   entrar (su sesión se cierra), el retiro lista el activo por devolver y «Devolución de activos»
   no se puede marcar hasta devolverlo. Devuelva el activo, marque los ítems (o pida a cada
   responsable que los marque en su Mi espacio) y pulse **Emitir paz y salvo**.
10. **Reglas laborales.** Organización › Parámetros › «Reglas laborales» › Programar un cambio.

## Verificaciones

Ejecutadas el 19/11/2026 tras reiniciar el equipo (Docker funcionando). `pnpm check` se corrió paso a
paso con dos ajustes que no cambian lo que se verifica: el formato excluye solo dos carpetas sin
commit del propietario (`.agents/` y `docs/diagnosticos/`) y el analizador se corrió por carpetas
porque de una vez no cabe en la memoria del equipo.

| Paso de `pnpm check`                                                         | Resultado                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato (Prettier)                                                           | Sin diferencias en los archivos del repositorio                                                                                                                                                                                             |
| Tipos compartidos, analizador (cero advertencias), tipos de todo el proyecto | Sin errores                                                                                                                                                                                                                                 |
| Límites entre módulos (`boundaries`) y código sin usar (`unused`)            | Sin hallazgos                                                                                                                                                                                                                               |
| Pruebas unitarias (`pnpm test`)                                              | Todas aprobadas; cobertura de ramas de la web 85,08 % (mínimo 85 %)                                                                                                                                                                         |
| Pruebas de integración (`pnpm test:int`)                                     | 1.457 de 1.477 en la corrida completa; las 20 restantes fallaron porque la base de prueba dejó de aceptar conexiones por la carga del equipo, son de módulos que B36 no toca y **repetidas pasaron las 437 de esos 12 archivos**            |
| Compilación (`pnpm build`)                                                   | Correcta                                                                                                                                                                                                                                    |
| Navegador (`pnpm test:e2e`)                                                  | 392 de 393; la falla fue un tiempo agotado al abrir una pantalla de Administración (no tocada por B36). No se pudo repetir sola porque Playwright subió a 1.65.1 con la integración de `main` y su navegador no está instalado en el equipo |
| Secretos (`gitleaks`)                                                        | Ninguno en 567 commits                                                                                                                                                                                                                      |

### Errores reales que encontraron las pruebas de integración (corregidos)

- Tres códigos de las listas nuevas pasaban de 20 caracteres y la carga inicial habría fallado:
  ahora son `PERMISO_NO_PAGO`, `LICENCIA_NO_PAGA`, `HE_FESTIVA_DIURNA` y `HE_FESTIVA_NOCTURNA`.
- El evento del cierre del mes tenía un guion bajo que la bandeja de salida rechaza: ahora es
  `hr.payroll.closed`.
- Programar una formación fallaba al crear a los convocados en la misma instrucción.
- El aviso «Su evaluación está lista» no usaba ninguna variable (regla de las plantillas).

## Pendientes

- Instalar en el equipo el navegador de Playwright 1.65.1 (`pnpm --filter @arza/web e2e:install`)
  para repetir localmente la prueba de Administración; la integración continua la vuelve a correr.
- **Validar con Talento humano**: conceptos de novedades contra RE-GTH-003; tipos de ausencia;
  reglas laborales (40 h, 2/12 h extras, 15 días) y el plazo de 3 días hábiles contra el RIT-001;
  la lista de chequeo del retiro.
- **PDF formal del paz y salvo** (hoy se ve e imprime desde la pantalla, decisión 10).
- **Convocar varias personas puntuales** a una formación (hoy: una persona o todos).
- **Adjuntar soportes desde la pantalla** del disciplinario y de las ausencias (hoy se indica el
  identificador del archivo ya cargado en Archivos).
- **Novedad automática de ingreso** al vincular (hoy «Ingreso» se registra a mano).
- La plataforma **no calcula valores** de horas extras ni de liquidación: eso lo hace el software
  de nómina (ficha 17.13).
- B22B (nueva jerarquía visual) seguía en curso: el propietario eligió construir B36 ahora.
