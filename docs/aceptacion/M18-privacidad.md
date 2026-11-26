# Guion de aceptación — M18 Privacidad y cumplimiento

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.19 del Manual Maestro.

| Campo                 | Valor                                     |
| --------------------- | ----------------------------------------- |
| Aprueba               | Oficial de Protección de Datos Personales |
| Cuenta para la prueba | OFICIAL_DATOS                             |
| Fecha de la prueba    | dd/mm/aaaa                                |
| Versión probada       | vX.Y.Z                                    |
| Probó                 |                                           |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un titular ficticio con datos en la plataforma.

## Pasos

| N.º | Paso                                                                      | Resultado esperado                                          | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- | ----------- |
| 1   | Radique una consulta de titular desde el sitio.                           | Se crea la tarea con la fecha límite legal en días hábiles. |                  |             |
| 2   | Verifique la identidad y responda.                                        | Queda la respuesta dentro del plazo.                        |                  |             |
| 3   | Exporte los datos del titular.                                            | El archivo contiene todos sus datos en formato legible.     |                  |             |
| 4   | Revoque la autorización comercial del titular.                            | Las comunicaciones comerciales se detienen de inmediato.    |                  |             |
| 5   | Pida la supresión de un dato que se debe conservar por ley.               | Se bloquea el dato y se informa el motivo.                  |                  |             |
| 6   | Revise Privacidad › Actividades de tratamiento y Privacidad › Encargados. | Están completos y aprobados (punto 13 del anexo E).         |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
