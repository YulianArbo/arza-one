# Guion de aceptación — M10 Facturación, cartera y finanzas operativas

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.11 del Manual Maestro.

| Campo                 | Valor                                          |
| --------------------- | ---------------------------------------------- |
| Aprueba               | Gerente Administrativo y Financiero y Contador |
| Cuenta para la prueba | ADMIN_FINANCIERO y CONTADOR                    |
| Fecha de la prueba    | dd/mm/aaaa                                     |
| Versión probada       | vX.Y.Z                                         |
| Probó                 |                                                |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un hito aceptado de prueba.

## Pasos

| N.º | Paso                                                            | Resultado esperado                                                          | ¿Cumple? (Sí/No) | Observación |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Solicite la factura del hito y regístrela con su número fiscal. | La factura queda emitida y ya no se edita.                                  |                  |             |
| 2   | Corrija una factura emitida.                                    | Solo se puede con nota crédito.                                             |                  |             |
| 3   | Revise la cartera por edades y compárela con RE-FIN-002.        | Coinciden.                                                                  |                  |             |
| 4   | Deje vencer una factura de prueba.                              | Se crea la tarea de cobro en horario permitido.                             |                  |             |
| 5   | Exporte el periodo al software contable.                        | La suma de lo exportado coincide con lo registrado.                         |                  |             |
| 6   | El Contador revisa los parámetros tributarios vigentes.         | Los valores coinciden con la norma vigente (acta del punto 15 del anexo E). |                  |             |
| 7   | Revise el presupuesto por centro de costo.                      | Muestra la ejecución contra lo planeado.                                    |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
