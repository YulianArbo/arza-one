# Guion de aceptación — M05 Comercial: CRM y cotizaciones

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.6 del Manual Maestro.

| Campo                 | Valor             |
| --------------------- | ----------------- |
| Aprueba               | Gerente Comercial |
| Cuenta para la prueba | COMERCIAL         |
| Fecha de la prueba    | dd/mm/aaaa        |
| Versión probada       | vX.Y.Z            |
| Probó                 |                   |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- El portafolio de servicios con tarifas vigentes.
- Los parámetros tributarios validados por el Contador.

## Pasos

| N.º | Paso                                                                      | Resultado esperado                                                               | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Envíe el formulario de cotización del sitio público con datos ficticios.  | Se crea el prospecto con su autorización, la tarea de contacto y llega el acuse. |                  |             |
| 2   | Convierta el prospecto en oportunidad y avance por las etapas del embudo. | El embudo muestra valor, probabilidad y fecha esperada.                          |                  |             |
| 3   | Cree una cotización con descuento mayor al tope.                          | Exige aprobación de la Dirección antes de enviarla.                              |                  |             |
| 4   | Calcule a mano el total de diez cotizaciones de prueba.                   | El total de la plataforma coincide al centavo.                                   |                  |             |
| 5   | Envíe la cotización y acéptela desde el enlace del cliente.               | Queda la evidencia de fecha, dirección IP y versión aceptada.                    |                  |             |
| 6   | Marque una oportunidad como perdida sin motivo.                           | La plataforma exige el motivo.                                                   |                  |             |
| 7   | Compare Comercial › Informe con RE-COM-001.                               | Las cifras coinciden.                                                            |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
