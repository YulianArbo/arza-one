# Guion de aceptación — M11 Compras, proveedores y activos

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.12 del Manual Maestro.

| Campo                 | Valor                               |
| --------------------- | ----------------------------------- |
| Aprueba               | Gerente Administrativo y Financiero |
| Cuenta para la prueba | ADMIN_FINANCIERO                    |
| Fecha de la prueba    | dd/mm/aaaa                          |
| Versión probada       | vX.Y.Z                              |
| Probó                 |                                     |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un proveedor con conocimiento del tercero vigente y otro sin él.

## Pasos

| N.º | Paso                                                               | Resultado esperado                     | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------ | -------------------------------------- | ---------------- | ----------- |
| 1   | Cree una compra por encima del tope sin las cotizaciones exigidas. | No puede avanzar.                      |                  |             |
| 2   | Intente aprobar o recibir una compra que usted solicitó.           | La plataforma no lo permite.           |                  |             |
| 3   | Ordene al proveedor sin conocimiento del tercero vigente.          | La plataforma no lo permite.           |                  |             |
| 4   | Asigne un activo a un colaborador.                                 | Exige el contrato de comodato firmado. |                  |             |
| 5   | Registre el retiro de un colaborador con activos.                  | Lista los activos por devolver.        |                  |             |
| 6   | Compare el libro de activos con RE-ADM-003.                        | Coinciden.                             |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
