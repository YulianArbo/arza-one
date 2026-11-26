# Guion de aceptación — M08 Servicio al cliente: mesa de ayuda, PQRSF y satisfacción

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.9 del Manual Maestro.

| Campo                 | Valor                        |
| --------------------- | ---------------------------- |
| Aprueba               | Líder de Servicio al Cliente |
| Cuenta para la prueba | SERVICIO                     |
| Fecha de la prueba    | dd/mm/aaaa                   |
| Versión probada       | vX.Y.Z                       |
| Probó                 |                              |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Una cuenta de cliente en el portal.

## Pasos

| N.º | Paso                                                               | Resultado esperado                                                         | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Radique una PQRSF en el sitio público.                             | Recibe el radicado en pantalla y por correo, con la fecha límite.          |                  |             |
| 2   | Consulte el estado con el radicado.                                | Muestra el estado actual.                                                  |                  |             |
| 3   | Cree un tiquete desde el portal y póngalo «en espera del cliente». | El reloj del acuerdo de servicio se detiene.                               |                  |             |
| 4   | Deje pasar el 80 % del plazo de un tiquete de prueba.              | El responsable y el líder reciben la alerta.                               |                  |             |
| 5   | Resuelva el tiquete.                                               | Se envía la encuesta y la respuesta alimenta el indicador de satisfacción. |                  |             |
| 6   | Clasifique una queja como procedente.                              | Se crea la no conformidad en Calidad.                                      |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
