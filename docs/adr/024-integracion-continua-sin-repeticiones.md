# ADR-024: Integración continua sin repetir verificaciones sobre el mismo código

- Estado: aceptada
- Fecha: 18/10/2026
- Aprobó: Director General (aprobación de la «opción A» en la sesión del 18/10/2026)

## Contexto

Cada ejecución de la integración continua (ADR-018) cobraba unos 58 minutos de GitHub Actions,
porque GitHub cobra cada tarea por separado y redondea cada una al minuto. Como corría completa
en el pull request y otra vez al fusionar a `main`, cada bloque gastaba unos 116 minutos más 58
por cada corrección. La cuota mensual se agotó a mitad de un bloque. El Director General pidió
optimizar los recursos con el mismo resultado: igual calidad, seguridad, integración e imágenes.

## Decisión

Una tarea inicial («0. Qué verificar en este cambio», `infra/scripts/ci/ci-plan.ts`) decide qué
corre. Ninguna verificación se elimina:

| Cambio                                                | Qué corre                                               |
| ----------------------------------------------------- | ------------------------------------------------------- |
| Pull request de código                                | Tareas 1 a 9 completas (numeral 11.4)                   |
| Pull request que toca infraestructura                 | Tareas 1 a 9, más los ensayos 11 y 12                   |
| Fusión a `main` de un pull request ya verificado      | Seguridad (6) y ensayos 11 y 12                         |
| Solo documentación                                    | Formato y mensajes de commit (1) y seguridad (6)        |
| Lanzada a mano, cambio directo a `main` o caso dudoso | Todo                                                    |
| Variable de repositorio `CI_FULL_RUN=true`            | Todo, siempre (comportamiento anterior a esta decisión) |

Una fusión cuenta como «ya verificada» solo si el código fusionado es idéntico al de la punta del
pull request (la rama estaba al día con `main`) y GitHub confirma que la tarea «Verificaciones»
de esa punta terminó en verde. Si algo de eso no se cumple o no se puede comprobar, corre todo.

Además, las cuatro imágenes (tarea 8) se construyen y analizan en una sola máquina, con los mismos
pasos y el mismo umbral de Trivy.

## Alternativas consideradas

- Pagar minutos adicionales · no cambia nada técnico · costo recurrente · se deja como respaldo.
- Ejecutar las verificaciones en un equipo propio · minutos sin costo hoy · el equipo debe estar
  encendido y la tarea 12 endurece la máquina como servidor · descartado.
- Volver público el repositorio · minutos gratis · expone el código de la empresa · descartado.

## Consecuencias

- Consumo estimado por bloque: unos 58 minutos en lugar de 116, y unos 40 por cada corrección del
  pull request en lugar de 58.
- Riesgo aceptado: si un cambio de código que no toca infraestructura rompe el ensayo de despliegue
  (11) o el del servidor (12), se detecta al fusionar a `main` y no antes. En ese caso `main` queda
  en rojo, el despliegue a pruebas no ocurre y la corrección va en el siguiente pull request.
- Reversión sin tocar código: variable `CI_FULL_RUN=true`. Reversión total: revertir el commit de
  esta decisión.

## Cumplimiento

`infra/scripts/ci/ci-plan.test.ts` prueba cada caso de la tabla, incluida la comprobación contra un
repositorio git real. La tarea «Verificaciones» solo acepta una tarea omitida cuando la tarea 0
terminó bien; cualquier falla o cancelación sigue impidiendo integrar.
