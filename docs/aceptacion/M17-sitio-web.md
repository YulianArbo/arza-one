# Guion de aceptación — M17 Sitio público, formularios y consentimiento

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios de la ficha 17.18 del Manual Maestro.

| Campo                 | Valor                 |
| --------------------- | --------------------- |
| Aprueba               | Director General      |
| Cuenta para la prueba | Visitante y DIRECCION |
| Fecha de la prueba    | dd/mm/aaaa            |
| Versión probada       | vX.Y.Z                |
| Probó                 |                       |

## Antes de empezar

- Cuentas de prueba con los roles indicados y segundo factor activo.
- Un navegador sin cookies guardadas.

## Pasos

| N.º | Paso                                                                                  | Resultado esperado                                                     | ¿Cumple? (Sí/No) | Observación |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ----------- |
| 1   | Entre al sitio y rechace las cookies; revise las cookies del navegador.               | Solo hay cookies estrictamente necesarias.                             |                  |             |
| 2   | Envíe un formulario sin marcar la casilla de autorización.                            | No se envía; la casilla nunca viene marcada.                           |                  |             |
| 3   | Publique una versión nueva de los términos de la plataforma con el concepto jurídico. | En el siguiente ingreso cada persona debe aceptarlos.                  |                  |             |
| 4   | Revise el pie de página.                                                              | Identifica razón social, NIT, domicilio, correo y teléfono reales.     |                  |             |
| 5   | Dese de baja de las comunicaciones desde el enlace de un correo.                      | Queda de baja en un clic.                                              |                  |             |
| 6   | Recorra el sitio solo con el teclado.                                                 | Todo se puede usar sin ratón; sin violaciones graves de accesibilidad. |                  |             |

## Resultado

- [ ] **Aprobado:** todos los pasos cumplen.
- [ ] **Aprobado con observaciones:** no impiden usar el módulo y tienen fecha de arreglo.
- [ ] **No aprobado:** se repite el guion cuando se corrija.

| Rol               | Nombre | Firma | Fecha |
| ----------------- | ------ | ----- | ----- |
| Líder del proceso |        |       |       |
| Director General  |        |       |       |
