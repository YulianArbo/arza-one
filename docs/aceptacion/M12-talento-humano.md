# Guion de aceptación — M12 Talento humano

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.13 del Manual Maestro.

| Campo                 | Valor                         |
| --------------------- | ----------------------------- |
| Aprueba               | Coordinador de Talento Humano |
| Cuenta para la prueba | TALENTO_HUMANO                |
| Fecha de la prueba    | dd/mm/aaaa                    |
| Versión probada       | vX.Y.Z                        |
| Probó                 |                               |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un candidato ficticio seleccionado.

## Pasos

| N.º | Paso                                                                          | Resultado esperado                                                                           | ¿Cumple? (Sí/No) | Observación |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Vincule al candidato.                                                         | Se crean la cuenta, las tareas de inducción, la evaluación médica y la asignación de equipo. |                  |             |
| 2   | Como colaborador, solicite vacaciones en Mi espacio; como jefe, apruébelas.   | La novedad llega al periodo de nómina.                                                       |                  |             |
| 3   | Compare la matriz de novedades con RE-GTH-003.                                | Coinciden.                                                                                   |                  |             |
| 4   | Con una cuenta que no sea de Talento humano, busque un proceso disciplinario. | No tiene acceso.                                                                             |                  |             |
| 5   | Revise el salario de un colaborador con una cuenta de jefe.                   | Ve la banda, nunca el valor exacto.                                                          |                  |             |
| 6   | Registre el retiro de un colaborador de prueba.                               | Al terminar su último día, la cuenta queda inactiva.                                         |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
