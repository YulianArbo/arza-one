# Guion de aceptación — M00 Multiempresa

Prueba de aceptación de usuario del numeral 21.1: el líder del proceso comprueba que el módulo sirve
al proceso. Se hace en el **servidor de pruebas**, con datos **ficticios**, nunca en producción.
Los pasos siguen los criterios del bloque B48: dos empresas operan sin ningún dato cruzado y la
exportación de una empresa es completa.

| Campo                  | Valor                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| Aprueba                | Director General y responsable técnico                                        |
| Cuentas para la prueba | OPERADOR_PLATAFORMA (ARZA TECH); DIRECCION y ADMIN_PLATAFORMA de otra empresa |
| Fecha de la prueba     | dd/mm/aaaa                                                                    |
| Versión probada        | vX.Y.Z                                                                        |
| Probó                  |                                                                               |

## Antes de empezar

- Una cuenta de ARZA TECH con el rol Operador de la plataforma y segundo factor activo.
- Dos correos de prueba que no tengan cuenta, para los administradores de las empresas nuevas.
- Dos NIT ficticios con su dígito de verificación correcto.

## Pasos

| N.º | Paso                                                                                           | Resultado esperado                                                                                                                   | ¿Cumple? (Sí/No) | Observación |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------- |
| 1   | Como operador, abra Administración → Empresas de la plataforma.                                | Ve ARZA TECH marcada «Opera la plataforma», sin botón para suspenderla.                                                              |                  |             |
| 2   | Dé de alta la Empresa A con plan Básico y el primer correo.                                    | Queda «Activa», con plan Básico; llega la invitación al correo.                                                                      |                  |             |
| 3   | Dé de alta la Empresa B con plan Profesional y el segundo correo.                              | Queda «Activa», con plan Profesional.                                                                                                |                  |             |
| 4   | Intente dar de alta otra empresa con el NIT de la Empresa A.                                   | No lo deja: dice que el NIT ya existe.                                                                                               |                  |             |
| 5   | Acepte las dos invitaciones y entre a cada empresa. Cree en A un tercero llamado «Solo de A».  | El tercero aparece en A.                                                                                                             |                  |             |
| 6   | En B, busque «Solo de A» en Terceros y en la búsqueda global.                                  | No aparece en ninguna parte.                                                                                                         |                  |             |
| 7   | Como administrador de A, cambie la marca: nombre «Marca A», un color oscuro y un logo.         | La barra superior muestra el logo y «Marca A».                                                                                       |                  |             |
| 8   | Intente un color muy claro (por ejemplo #FFEE88).                                              | No lo deja: dice que no se lee sobre blanco.                                                                                         |                  |             |
| 9   | Entre a B.                                                                                     | La barra superior muestra la marca de B, no la de A.                                                                                 |                  |             |
| 10  | Como operador, cambie el plan de A con tope de 1 usuario interno. En A, invite a otra persona. | No lo deja: dice que llegó al máximo de usuarios de su plan.                                                                         |                  |             |
| 11  | Como Dirección de A, en Empresa y sedes pida la exportación completa.                          | Pide confirmar su identidad; queda «En cola» y en unos minutos «Lista para descargar».                                               |                  |             |
| 12  | Descargue el ZIP y ábralo.                                                                     | Trae la carpeta `tablas` (hojas CSV), `archivos`, `manifest.json` y `LEAME.txt`. La hoja de terceros trae «Solo de A».               |                  |             |
| 13  | Busque en todas las hojas el nombre de un tercero de B.                                        | No aparece.                                                                                                                          |                  |             |
| 14  | Abra `tablas/iam_users.csv`.                                                                   | No trae contraseñas ni códigos.                                                                                                      |                  |             |
| 15  | Como operador, suspenda A con un motivo.                                                       | A queda «Suspendida». Quien estaba dentro de A sale en su siguiente clic y no puede volver a entrar.                                 |                  |             |
| 16  | Reactive A.                                                                                    | Las personas de A vuelven a entrar.                                                                                                  |                  |             |
| 17  | Suspenda A otra vez y pida su eliminación escribiendo un NIT distinto.                         | No lo deja: el NIT no coincide.                                                                                                      |                  |             |
| 18  | Pida la eliminación con el NIT correcto.                                                       | Muestra «Se elimina el dd/mm/aaaa» (30 días después).                                                                                |                  |             |
| 19  | Cancele la eliminación.                                                                        | Desaparece la fecha; A sigue suspendida.                                                                                             |                  |             |
| 20  | Revise Auditoría en ARZA TECH.                                                                 | Aparecen el alta, el cambio de plan, la suspensión, la reactivación y la eliminación pedida y cancelada, con el nombre del operador. |                  |             |

## Resultado

| Resultado               | Marque |
| ----------------------- | ------ |
| Aprobado                |        |
| Aprobado con pendientes |        |
| No aprobado             |        |

Firma de quien aprueba: ______________________
