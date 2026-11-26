# Guion de aceptación — M09 Portal del cliente

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.10 del Manual Maestro.

| Campo                 | Valor                           |
| --------------------- | ------------------------------- |
| Aprueba               | Líder de Servicio al Cliente    |
| Cuenta para la prueba | CLIENTE_ADMIN (cuenta ficticia) |
| Fecha de la prueba    | dd/mm/aaaa                      |
| Versión probada       | vX.Y.Z                          |
| Probó                 |                                 |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Dos empresas cliente de prueba, cada una con su administrador.

## Pasos

| N.º | Paso                                                                             | Resultado esperado                                               | ¿Cumple? (Sí/No) | Observación |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Entre al portal por primera vez.                                                 | Exige aceptar los términos y la política de privacidad vigentes. |                  |             |
| 2   | Revise el tablero del cliente.                                                   | Muestra sus proyectos, avance, hitos y pendientes.               |                  |             |
| 3   | Busque datos de la otra empresa cliente (por pantalla y cambiando la dirección). | Nunca los ve.                                                    |                  |             |
| 4   | Revise un tiquete con comentarios internos.                                      | Los comentarios internos no aparecen.                            |                  |             |
| 5   | Como administrador del cliente, invite a un usuario de su empresa.               | El usuario queda solo en su empresa.                             |                  |             |
| 6   | Descargue sus datos personales.                                                  | Recibe el archivo con sus datos.                                 |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
