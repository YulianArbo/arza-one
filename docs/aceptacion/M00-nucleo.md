# Guion de aceptación — M00 Núcleo: empresa, organización, catálogos y consecutivos

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.1 del Manual Maestro.

| Campo                 | Valor            |
| --------------------- | ---------------- |
| Aprueba               | Director General |
| Cuenta para la prueba | ADMIN_PLATAFORMA |
| Fecha de la prueba    | dd/mm/aaaa       |
| Versión probada       | vX.Y.Z           |
| Probó                 |                  |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Una cuenta con ADMIN_PLATAFORMA y otra con COLABORADOR.

## Pasos

| N.º | Paso                                                                                                   | Resultado esperado                                                                                | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Entre a Administración › Empresa y sedes y revise razón social, NIT y sedes.                           | Los datos son los de ARZA TECH; el NIT valida su dígito de verificación.                          |                  |             |
| 2   | Abra Administración › Procesos y cargos y compare con el organigrama DC-SGC-001.                       | Están todos los procesos y cargos, con su líder y a quién reporta cada cargo.                     |                  |             |
| 3   | En Administración › Parámetros cambie un parámetro de prueba y guarde.                                 | El cambio se guarda; en Auditoría › Consulta de eventos aparece con el valor anterior y el nuevo. |                  |             |
| 4   | Pida a dos personas que creen al mismo tiempo un registro con consecutivo (por ejemplo, dos tiquetes). | Reciben números distintos y seguidos, sin saltos.                                                 |                  |             |
| 5   | Revise Administración › Festivos del año.                                                              | Están los festivos de Colombia del año, con los trasladados por ley.                              |                  |             |
| 6   | Con la cuenta de COLABORADOR intente entrar a Administración › Parámetros.                             | La opción no aparece y, si escribe la dirección, la plataforma responde que no tiene permiso.     |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
