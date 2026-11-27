# Guion de aceptación — M16 Dirección: tableros, indicadores y requisitos legales

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.17 del Manual Maestro.

| Campo                 | Valor            |
| --------------------- | ---------------- |
| Aprueba               | Director General |
| Cuenta para la prueba | DIRECCION        |
| Fecha de la prueba    | dd/mm/aaaa       |
| Versión probada       | vX.Y.Z           |
| Probó                 |                  |

## Antes de empezar

- Cuentas de prueba con los roles Dirección, Calidad y Comercial, con segundo factor activo.
- Facturas, oportunidades y proyectos de prueba, y el normograma RE-DG-001.

## Pasos

| N.º | Paso                                                                              | Resultado esperado                                                      | ¿Cumple? (Sí/No) | Observación |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | En el tablero gerencial, compare las ventas y la cartera con Finanzas › Facturas. | Las cifras coinciden.                                                   |                  |             |
| 2   | Pulse «Ver registros» en cada cifra.                                              | Lleva a los registros que la originan y al listado del módulo.          |                  |             |
| 3   | Entre como Calidad al tablero gerencial.                                          | Las cifras de Finanzas dicen «No tiene permiso para ver este dato».     |                  |             |
| 4   | Compare el tablero de cumplimiento con Administración › Revisión de accesos.      | Las cifras de accesos coinciden.                                        |                  |             |
| 5   | Cargue el normograma RE-DG-001 y compárelo con el original.                       | Coinciden; cada requisito muestra su última evaluación.                 |                  |             |
| 6   | Evalúe un requisito como «No cumple» con su acción de mejora.                     | La acción aparece en Calidad › Acciones con origen evaluación legal.    |                  |             |
| 7   | Registre un objetivo estratégico y asígnele indicadores.                          | El cuadro de mando muestra el objetivo con sus indicadores y su estado. |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
