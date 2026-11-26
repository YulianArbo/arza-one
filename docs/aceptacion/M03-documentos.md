# Guion de aceptación — M03 Gestión documental y control de documentos del SGC

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.4 del Manual Maestro.

| Campo                 | Valor                               |
| --------------------- | ----------------------------------- |
| Aprueba               | Coordinador de Calidad e Innovación |
| Cuenta para la prueba | CALIDAD                             |
| Fecha de la prueba    | dd/mm/aaaa                          |
| Versión probada       | vX.Y.Z                              |
| Probó                 |                                     |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- El Listado Maestro ya cargado (guía de carga inicial, paso 3).

## Pasos

| N.º | Paso                                                               | Resultado esperado                                                                    | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Abra Documentos › Listado Maestro y compare con RE-SGC-001.        | Coinciden los documentos vigentes y el informe de importación dice «SIN DIFERENCIAS». |                  |             |
| 2   | Radique una solicitud de acción documental para una versión nueva. | Sigue el trámite: análisis, aprobación y ejecución.                                   |                  |             |
| 3   | Intente aprobar con la misma persona que elaboró.                  | La plataforma no lo permite: quien elabora no aprueba.                                |                  |             |
| 4   | Publique la versión nueva.                                         | La anterior pasa a obsoleta; los cargos destinatarios reciben el aviso de lectura.    |                  |             |
| 5   | Confirme la lectura con una persona destinataria.                  | El informe de lectura muestra quién confirmó y cuándo.                                |                  |             |
| 6   | Descargue un documento vigente.                                    | El PDF lleva el pie con código, versión, fecha y «copia no controlada».               |                  |             |
| 7   | Diligencie un formato digital y genere su PDF.                     | El encabezado es idéntico al del formato original.                                    |                  |             |
| 8   | Revise la retención de los documentos.                             | Ningún documento queda sin regla de retención.                                        |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
