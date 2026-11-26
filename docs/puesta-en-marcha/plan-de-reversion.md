# Plan de reversión de la puesta en marcha

Punto 23 del anexo E: qué se hace si la salida a producción sale mal, quién lo decide y quién lo
ejecuta. Complementa las guías [despliegue y reversión](../runbooks/despliegue-y-reversion.md),
[restauración](../runbooks/restauracion.md) y [bloqueo de emergencia](../runbooks/bloqueo-de-emergencia.md).

## Antes del día de salida

| Qué                                                                                            | Quién               | Listo |
| ---------------------------------------------------------------------------------------------- | ------------------- | ----- |
| Nombrar al responsable técnico de turno y a su reemplazo, con teléfono (van en el acta)        | Director General    | [ ]   |
| Ensayar una restauración completa en el servidor real y registrarla en FT-TEC-005              | Responsable técnico | [ ]   |
| Confirmar que la copia externa del día anterior existe (`pgbackrest info`, `restic snapshots`) | Responsable técnico | [ ]   |
| Conservar las carpetas compartidas actuales **sin cambios** hasta 30 días después de la salida | Calidad             | [ ]   |
| Avisar a los colaboradores la fecha, la ventana y a quién escribir si algo falla               | Talento humano      | [ ]   |

## El día de salida

1. Publicar la versión dentro de la ventana del numeral 10.6, como dice «Publicar en producción».
   El flujo copia la base antes de migrar y hace las pruebas de humo de `www`, `app`, `clientes` y
   `api`. **Si una prueba falla, vuelve solo a la versión anterior.**
2. Correr `pnpm puesta:revisar` y guardar el informe.
3. Durante las primeras dos horas, el responsable técnico vigila Uptime Kuma y GlitchTip
   ([atención de alertas](../runbooks/atencion-de-alertas.md)).

## Cuándo se vuelve atrás

El Director General decide, a propuesta del responsable técnico. Se vuelve atrás si pasa
cualquiera de estas cosas en las primeras 72 horas y no se corrige en menos de 4 horas:

- Una persona de una empresa ve datos de otra, o un cliente ve datos de otro cliente.
- Se pierden o dañan datos guardados después de la salida.
- No se puede iniciar sesión, o la API responde con error a más de la mitad de las peticiones.
- Una alerta de seguridad crítica que la guía de bloqueo de emergencia no contiene.

Un error que solo molesta (una pantalla lenta, un texto mal escrito) **no** es motivo de reversión:
se corrige con una versión nueva.

## Cómo se vuelve atrás

| Situación                                                 | Qué hacer                                                                                                                                                  | Pierde datos              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| La versión nueva falla y la anterior servía               | Encender la versión anterior («Volver a una versión anterior a mano» en la guía de despliegue). La base queda como está: las migraciones son compatibles.  | No                        |
| Hay datos dañados                                         | Restaurar la base al minuto anterior al daño con pgBackRest ([restauración](../runbooks/restauracion.md), caso 1).                                         | Lo posterior a ese minuto |
| Fuga de datos entre empresas o ataque                     | Primero el [bloqueo de emergencia](../runbooks/bloqueo-de-emergencia.md); después restaurar si hace falta e informar como incidente en Privacidad.         | Según el caso             |
| La plataforma no se puede usar y no hay arreglo en el día | Volver a trabajar con las carpetas compartidas y los formatos de siempre. Anotar en papel o en Excel lo que se haga mientras tanto, para cargarlo después. | No                        |

## Después de volver atrás

1. Registrar lo ocurrido como incidente (FT-TEC-006) y, si hubo datos personales, en Privacidad ›
   Incidentes dentro de los plazos legales.
2. Comunicar a los colaboradores y, si los afectó, a los clientes.
3. Corregir, repetir la lista FT-TEC-007 completa y firmar un acta nueva antes de intentarlo otra vez.
