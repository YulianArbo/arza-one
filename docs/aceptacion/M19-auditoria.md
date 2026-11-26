# Guion de aceptación — M19 Auditoría y trazabilidad

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.20 del Manual Maestro.

| Campo                 | Valor            |
| --------------------- | ---------------- |
| Aprueba               | Director General |
| Cuenta para la prueba | AUDITOR          |
| Fecha de la prueba    | dd/mm/aaaa       |
| Versión probada       | vX.Y.Z           |
| Probó                 |                  |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Una cuenta con el rol AUDITOR.

## Pasos

| N.º | Paso                                                                            | Resultado esperado                                                      | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Abra el historial de cualquier registro.                                        | Muestra quién hizo cada cambio, cuándo, y los valores anterior y nuevo. |                  |             |
| 2   | Consulte Auditoría › Consulta de eventos.                                       | La consulta también queda en la auditoría.                              |                  |             |
| 3   | Exporte eventos de un periodo.                                                  | Se descarga el archivo y la exportación queda registrada.               |                  |             |
| 4   | Corra Auditoría › Verificación de integridad.                                   | La cadena está íntegra.                                                 |                  |             |
| 5   | Revise la prueba automática de escrituras auditadas en la integración continua. | Está en verde.                                                          |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
