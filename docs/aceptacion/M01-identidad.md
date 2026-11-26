# Guion de aceptación — M01 Identidad y control de acceso

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.2 del Manual Maestro.

| Campo                 | Valor            |
| --------------------- | ---------------- |
| Aprueba               | Director General |
| Cuenta para la prueba | ADMIN_PLATAFORMA |
| Fecha de la prueba    | dd/mm/aaaa       |
| Versión probada       | vX.Y.Z           |
| Probó                 |                  |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un correo de prueba que pueda recibir la invitación.
- Una aplicación de autenticación en el celular.

## Pasos

| N.º | Paso                                                                           | Resultado esperado                                                                                      | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | En Administración › Usuarios invite a una persona de prueba con un rol.        | Llega el correo de invitación; el enlace vence en 72 horas.                                             |                  |             |
| 2   | Active la cuenta desde el enlace y elija contraseña.                           | Antes de entrar exige configurar el segundo factor; sin él no entra.                                    |                  |             |
| 3   | Escriba mal la contraseña cinco veces seguidas.                                | La cuenta se bloquea un tiempo y aparece en Auditoría › Eventos de seguridad.                           |                  |             |
| 4   | Intente asignarse a sí mismo un rol desde su propia ficha.                     | La plataforma no lo permite.                                                                            |                  |             |
| 5   | Cree una delegación de aprobaciones por unos días.                             | La persona delegada ve las aprobaciones solo en esas fechas.                                            |                  |             |
| 6   | Abra Administración › Revisión de accesos.                                     | Lista usuarios, roles, segundo factor, último ingreso y cuentas sin uso en 60 días; se descarga en CSV. |                  |             |
| 7   | Con una cuenta de EQUIPO_PROYECTO consulte un proyecto en el que no participa. | La plataforma responde que no existe.                                                                   |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
