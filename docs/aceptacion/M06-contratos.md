# Guion de aceptación — M06 Contratos y firma electrónica

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.7 del Manual Maestro.

| Campo                 | Valor                 |
| --------------------- | --------------------- |
| Aprueba               | Director General      |
| Cuenta para la prueba | DIRECCION y COMERCIAL |
| Fecha de la prueba    | dd/mm/aaaa            |
| Versión probada       | vX.Y.Z                |
| Probó                 |                       |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Una cotización aceptada.
- Un firmante autorizado registrado en el tercero, con un correo de prueba.

## Pasos

| N.º | Paso                                                                    | Resultado esperado                                            | ¿Cumple? (Sí/No) | Observación |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Genere el contrato desde la plantilla con los datos de la cotización.   | El contrato toma los datos del cliente y de la cotización.    |                  |             |
| 2   | Cambie una cláusula de la biblioteca.                                   | Queda marcada y exige aprobación de la Dirección.             |                  |             |
| 3   | Envíe a firma un contrato sin aprobar.                                  | La plataforma no lo permite.                                  |                  |             |
| 4   | Apruébelo y envíelo a firma; firme como cliente y después como empresa. | La empresa firma de última; el PDF queda sellado.             |                  |             |
| 5   | Verifique el documento en la página pública de verificación.            | Supera la verificación y muestra el certificado de evidencia. |                  |             |
| 6   | Cambie un solo byte del PDF y vuelva a verificar.                       | La verificación falla.                                        |                  |             |
| 7   | Revise un contrato de prueba a 30 días de vencer.                       | Hay una tarea para el responsable.                            |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
