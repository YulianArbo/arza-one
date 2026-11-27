# Guion de aceptación — M20 Asistente de inteligencia artificial

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.21 del Manual Maestro.

| Campo                  | Valor                                                  |
| ---------------------- | ------------------------------------------------------ |
| Aprueba                | Oficial de Protección de Datos y Director General      |
| Cuentas para la prueba | OFICIAL_DATOS, CALIDAD, SERVICIO, COLABORADOR, AUDITOR |
| Fecha de la prueba     | dd/mm/aaaa                                             |
| Versión probada        | vX.Y.Z                                                 |
| Probó                  |                                                        |

## Antes de empezar

- Cuentas de prueba con los roles anteriores, con segundo factor activo.
- Documentos vigentes de prueba: uno interno, uno confidencial y uno restringido.
- Un tiquete con conversación y una PQRSF de prueba.
- La evaluación de impacto aprobada (o, en el servidor de pruebas, `AI_GATEWAY_PROVIDER=rehearsal`).

## Pasos

| N.º | Paso                                                                                            | Resultado esperado                                                                 | ¿Cumple? (Sí/No) | Observación |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Como Colaborador, abra Asistente antes de activar nada.                                         | Dice que las preguntas sobre documentos no están activas.                          |                  |             |
| 2   | Como Oficial de datos, intente activar un uso sin la evaluación de impacto.                     | No lo deja: pide la evaluación aprobada y su fecha.                                |                  |             |
| 3   | Active todos los usos con la evaluación aprobada.                                               | Quedan «Activo», con el código y la fecha.                                         |                  |             |
| 4   | Como Calidad, pregunte algo que esté en el documento interno.                                   | Responde y cita el documento como fuente.                                          |                  |             |
| 5   | Como Colaborador, haga la misma pregunta sobre un documento de otro proceso que no puede abrir. | Dice que no encontró la respuesta; no cita ese documento.                          |                  |             |
| 6   | Con una cuenta que ve lo restringido, pida resumir el documento restringido.                    | No lo hace: «nunca se envían al asistente».                                        |                  |             |
| 7   | Como Servicio, en la ficha del tiquete pida resumen, borrador y clasificación.                  | Muestra cada propuesta con el aviso «es una propuesta»; nada cambia en el tiquete. |                  |             |
| 8   | Clasifique una PQRSF como de datos personales y busque el panel del asistente.                  | El panel no aparece.                                                               |                  |             |
| 9   | Como Auditor, abra Asistente › Registro de usos.                                                | Están todos los usos con modelo y resultado, sin preguntas ni respuestas.          |                  |             |
| 10  | Como Calidad, escriba una instrucción e intente aprobarla usted mismo.                          | No lo deja; otra persona sí puede aprobarla.                                       |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol                            | Nombre | Firma | Fecha |
| ------------------------------ | ------ | ----- | ----- |
| Oficial de Protección de Datos |        |       |       |
| Director General               |        |       |       |
