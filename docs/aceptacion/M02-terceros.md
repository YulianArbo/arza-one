# Guion de aceptación — M02 Terceros

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.3 del Manual Maestro.

| Campo                 | Valor                        |
| --------------------- | ---------------------------- |
| Aprueba               | Gerente Comercial            |
| Cuenta para la prueba | COMERCIAL y ADMIN_FINANCIERO |
| Fecha de la prueba    | dd/mm/aaaa                   |
| Versión probada       | vX.Y.Z                       |
| Probó                 |                              |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Dos cuentas: una de Comercial y otra de Administrativo y financiero.

## Pasos

| N.º | Paso                                                                      | Resultado esperado                                                      | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | En Terceros cree una empresa con NIT y dígito de verificación equivocado. | La plataforma rechaza el dígito.                                        |                  |             |
| 2   | Cree la empresa con el NIT correcto y el papel de cliente.                | Queda activa con su papel.                                              |                  |             |
| 3   | Intente crear otra con el mismo NIT.                                      | Avisa que ya existe y ofrece abrir el existente.                        |                  |             |
| 4   | Registre una persona natural.                                             | Pide la autorización de tratamiento de datos con su finalidad.          |                  |             |
| 5   | Como Finanzas, agregue una cuenta bancaria al tercero.                    | Queda pendiente hasta que otra persona la apruebe.                      |                  |             |
| 6   | Abra la línea de tiempo del tercero.                                      | Muestra lo ocurrido con él en los módulos que su rol puede ver.         |                  |             |
| 7   | Fusione dos terceros duplicados de prueba.                                | Queda uno solo, con el historial de ambos, y la fusión en la auditoría. |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
