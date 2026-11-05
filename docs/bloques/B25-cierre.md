# Cierre del bloque B25: Firma electrónica

- Fecha: 30/10/2026
- Rama: `feat/b25-firma-electronica` (parte de `feat/b24-contratos`, que todavía espera su revisión
  en el pull request #38)
- Estado: en revisión. **Es un bloque crítico:** además de su aprobación, requiere revisión
  externa de seguridad antes de salir a producción.

## Qué se construyó

Desde este bloque, un contrato, una orden de servicio o un otrosí aprobado **se firma en línea**,
sin imprimir. Es el **nivel 2** del capítulo 19: enlace único más código de seis números al correo,
con un paquete de evidencia y una página pública donde cualquiera comprueba que un documento es el
original. Usted aprobó el plan con las catorce recomendaciones; están al final.

| Pieza                               | Qué hace, en palabras sencillas                                                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pestaña **Firmas**                  | En la ficha del contrato (y dentro de cada otrosí). Muestra cada proceso de firma, sus firmantes en orden, el estado de cada uno y la **cadena de eventos** con su huella                                                                                                     |
| Preparar el envío                   | **«Preparar el envío a firma»**: se marcan los **firmantes autorizados** del cliente en el orden en que firmarán, se elige quién firma por la empresa (Dirección), el último día para firmar (15 días por omisión, 30 como máximo) y un mensaje opcional                      |
| Enviar                              | Solo la **Dirección** pulsa **«Enviar a firma»**. El contrato queda **«En firma»** y el primer firmante recibe su enlace. Un doble clic no lo envía dos veces                                                                                                                 |
| Página de firma (`/firmar`)         | El cliente abre el enlace de su correo, sin usuario. Pide un **código de seis números** que llega a su correo, lo escribe, **lee el documento completo**, lo puede descargar y marca «He leído y acepto… lo firmo electrónicamente». También puede **rechazar** con su motivo |
| Orden de firma                      | Firman uno tras otro. El segundo no recibe su enlace hasta que firme el primero. La **empresa firma de última**                                                                                                                                                               |
| Firma de la empresa                 | La persona de la Dirección elegida recibe la tarea **«Firmar … por la empresa»** en Mis tareas. Firma desde la ficha y la plataforma le pide **confirmar que es ella** (contraseña y segundo factor)                                                                          |
| Seguridad del código                | Vale **10 minutos**; uno por minuto como máximo. Al **quinto código equivocado** el enlace se bloquea y alguien de la empresa debe **«Reenviar el enlace»**. Cada correo nuevo trae un enlace nuevo y el anterior deja de servir                                              |
| Evidencia                           | Cada paso (abrió, pidió el código, lo validó, leyó, firmó…) queda con la hora del servidor, la IP, el navegador y la **huella del paso anterior**. Si alguien cambia o borra un evento, la cadena se rompe y la ficha lo muestra                                              |
| Documento firmado                   | Cuando firman todos, la plataforma arma un solo PDF: el aprobado + una **página final de firmas** (nombre, identificación, fecha y hora y código de verificación) + el **certificado de evidencia**. El contrato queda **«Vigente»**                                          |
| Copias                              | Cada firmante recibe un correo con un enlace para descargar su copia durante **30 días**. El responsable y el autor del contrato reciben el aviso                                                                                                                             |
| Verificación pública (`/verificar`) | Cualquiera escribe el **código de verificación** o **carga el PDF**. La huella del archivo se calcula en su computador (el archivo no viaja). Responde si es auténtico, sin mostrar el contenido ni los nombres. **Un solo byte cambiado y no coincide**                      |
| Recordatorios y vencimiento         | Cada día a las 7:00 a. m.: a quien le toca y no ha firmado, un recordatorio cada 3 días (hasta 3). Pasado el plazo el proceso **vence** y el contrato vuelve a «Aprobado»                                                                                                     |
| Rechazo y anulación                 | Si alguien rechaza, o la Dirección anula, el proceso se cierra con su motivo y el contrato vuelve a «Aprobado» para enviarlo otra vez                                                                                                                                         |
| Firma manuscrita                    | Sigue disponible como alternativa mientras el contrato esté «Aprobado» (no mientras está en firma electrónica)                                                                                                                                                                |
| Vincular a la Dirección             | Comando nuevo `pnpm contratos:vincular-firmante`: une la cuenta de la Dirección con su ficha de persona en Terceros (de ahí salen su nombre y su cédula). La pantalla para esto llegará con Talento humano                                                                    |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `sig_envelopes` (procesos),
`sig_signers` (firmantes), `sig_events` (cadena de eventos, que la base de datos no deja cambiar ni
borrar) y `sig_verifications` (consultas a la verificación). Diccionario en
[`sig.md`](../manual/datos/sig.md).

**Rutas nuevas de la API:** 15 (8 del equipo y 7 públicas), en
[`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`. **Trabajos nuevos
del worker:** correos, códigos y documentos firmados (cada 10 segundos) y la revisión diaria
(7:00 a. m.).

**Lineamientos visuales del B22A:** componentes de `@arza/ui`, una acción principal por pantalla,
resumen de errores en los formularios, estados de carga, vacío y error, y textos con trato de usted.
La tarjeta «Verificar un documento» de la vitrina dejó de decir «Disponible pronto».

## Cómo se probó

### Los criterios del bloque

**«El recorrido completo de firma está automatizado».** Una prueba recorre todo contra una base de
datos real: Comercial prepara; Comercial no puede enviar y la Dirección sí; el contrato queda «En
firma»; llega el correo con el enlace; el cliente lo abre, pide el código, lo recibe, lo valida, lee
el PDF y firma; la Dirección firma con su confirmación de identidad; el worker arma el documento
firmado; el contrato queda «Vigente»; cada uno recibe su copia con el código de verificación.
También corre en un navegador real la página de firma (pedir el código, validarlo, ver el
documento, marcar la casilla y firmar).

**«Modificar el PDF hace fallar la verificación».** La prueba toma el PDF firmado guardado, cambia
**un solo byte** y lo verifica: «No encontramos un documento firmado». Con el código y ese archivo:
«El archivo NO coincide». Con el archivo original: «auténtico».

**Criterios de la ficha 17.7.** «Un contrato firmado muestra su certificado de evidencia y supera la
verificación pública» y «modificar un byte hace fallar la verificación»: cubiertos arriba. «Solo se
envía a firma un contrato aprobado; el documento enviado es inmutable», «firman únicamente los
firmantes autorizados» y «el orden de firma se respeta; la empresa firma de última»: cubiertos en
las pruebas de reglas.

### Lo demás

| Prueba                  | Qué demuestra                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orden                   | El segundo firmante no recibe enlace antes de tiempo; la empresa no puede firmar antes que el cliente                                                                                                                              |
| Código                  | Al quinto equivocado se bloquea; reenviar el enlace lo desbloquea y el anterior deja de servir; vence a los 10 minutos; uno por minuto; sin él no se firma                                                                         |
| Rechazo                 | Queda el motivo, el contrato vuelve a «Aprobado» y se puede preparar otro envío                                                                                                                                                    |
| Llave contra repetidos  | La misma llave dos veces envía una sola vez; otra llave responde «ya se hizo»; sin llave no se envía                                                                                                                               |
| Antes de enviar         | Sin el conocimiento del cliente aprobado no se prepara; una persona que no es firmante autorizada, o alguien que no es de la Dirección, no firma; plazo de más de 30 días; dos procesos abiertos a la vez; un contrato sin aprobar |
| Recordatorios y plazo   | Con el reloj adelantado: recordatorio a los 3 días con enlace nuevo; a los 16 días el proceso vence y el enlace ya no sirve                                                                                                        |
| Evidencia inalterable   | La base de datos rechaza cambiar o borrar un evento, y cambiar la huella del documento enviado                                                                                                                                     |
| Vincular a la Dirección | El comando vincula con la persona de la misma empresa; no vincula sin cuenta ni con una persona de otra empresa                                                                                                                    |
| Pantallas               | 17 pruebas nuevas de pantalla y 9 en navegador real, sin fallas de accesibilidad en modo claro y oscuro, y la página de firma en un celular                                                                                        |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el Contador ve los procesos pero no prepara, no envía, no anula ni firma;
  Comercial prepara pero no envía ni anula; otra persona de la Dirección que no fue elegida no
  firma; la firma de la empresa exige confirmar la identidad; el Colaborador no ve los procesos de
  un contrato que no es suyo.
- **Aislamiento:** otra empresa no ve, no envía, no anula, no firma ni descarga los procesos de esta,
  y no puede preparar uno con un contrato de esta.
- **Auditoría:** cada paso deja su evento, también los del cliente sin usuario y los del worker. El
  recorrido de auditoría de la plataforma incluye las 14 rutas nuevas que escriben.

### Resultado de `pnpm check`

El 30/10/2026, paso por paso en este equipo. **Todo lo que el equipo pudo correr completo pasa.
Las pruebas de integración y de navegador completas no se pudieron terminar limpias: el equipo se
quedó sin memoria** (llegó a tener 16 MB libres de 7,4 GB, aun con los servicios de Docker
apagados). Las fallas cambian de una corrida a otra y todas son de tiempo: la base de datos «no
alcanza a abrir una transacción» o el navegador de prueba se cierra solo.

| Paso                    | Resultado                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                                                                                                  |
| Estilo (ESLint) y tipos | Sin problemas                                                                                                                                                                        |
| Fronteras entre módulos | Sin problemas: la firma usa identidad, terceros, documentos, flujos y núcleo solo por sus índices                                                                                    |
| Código sin usar (knip)  | Sin problemas, después de corregir lo que encontró (nota 4)                                                                                                                          |
| Pruebas unitarias       | Contratos 171, plantillas 25, worker 42 y web 549 pasan. API: todas, salvo la de arranque (nota 2)                                                                                   |
| Pruebas de integración  | **Las del B25 pasan** corridas por archivo: recorrido 3, reglas 7, permisos y aislamiento 6, vincular firmante 2 y las 14 rutas nuevas del recorrido de auditoría. Completas: nota 3 |
| Compilación             | Sin problemas                                                                                                                                                                        |
| Pruebas en navegador    | Las 9 de firma pasan. Completas: 240 de 253 (nota 3)                                                                                                                                 |
| Búsqueda de secretos    | Ninguno                                                                                                                                                                              |
| Migraciones             | Desde cero en la prueba de integración y sobre la base local de la versión anterior (B24)                                                                                            |

**Cosas que debe saber de esta verificación:**

1. **Formato:** como en los bloques anteriores, solo falla la carpeta local de herramientas
   `.agents/`, que no es del proyecto.
2. **Prueba de arranque de la API** (`startup.test.ts`): la arranqué a mano y funciona; tarda 15
   segundos en responder en este equipo, y la prueba espera unos 18. Con el equipo cargado se pasa.
   No la toqué: el cierre del B24 ya la reportó por lo mismo.
3. **Integración y navegador completos:** de 1010 pruebas de integración de la API, 910 pasaron y
   16 fallaron por la base de datos sin tiempo («Unable to start a transaction»); repetidas, fallan
   otras, igual de tiempo. Lo mismo en el worker (2 de 25) y en el navegador (entre 10 y 13 de
   inicio de sesión, segundo factor y seguridad, distintas en cada corrida). La carga de los 251
   documentos del B19 sigue fallando como desde el B23. **La integración continua de GitHub debe
   confirmarlo** con el pull request, si la facturación de la cuenta ya está al día.
   - Una prueba de tareas (B15), «quien reasigna entrega cualquier tarea abierta con un plazo
     nuevo», falló dos veces comparando dos horas iguales. No es del B25; si GitHub también la
     marca, la reviso aparte.
4. **Errores reales que encontraron las pruebas y corregí:**
   - Toda escritura debe dejar su evento de auditoría (la plataforma lo exige). Al principio
     faltaba en pasos sin usuario: abrir el enlace, leer el documento, los correos y códigos del
     worker y la verificación pública. Agregados.
   - Anular un proceso que todavía no se había enviado chocaba con una regla de la base de datos.
     Corregida la regla.
   - Reenviar el enlace a quien tenía el código bloqueado no le dejaba pedir otro código de
     inmediato. Ahora el reenvío reinicia el código.
   - Cinco piezas exportadas que solo se usaban en su archivo (knip), y el comando nuevo sin
     registrar en esa herramienta.
5. **Ajustes a pruebas existentes, sin debilitarlas:** la del sitio público ya no espera «Disponible
   pronto» en «Verificar un documento» (ahora funciona) y comprueba que lleve a `/verificar`; la de
   rutas públicas incluye, una por una, las de la cotización (B23) y las de la firma y la
   verificación (decisión 12); la del OpenAPI incluye las 15 rutas nuevas (su lista pasó a
   `test/support/api-paths.ts` porque el archivo superaba el tamaño permitido).

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** (Comercial) y a **Laura Díaz** (Dirección,
`direccion@demo-uno.test`, del cierre del B19). Los correos de prueba no salen a internet: los ve en
el buzón de prueba **Mailpit**: en este equipo es http://localhost:8026 (el número está en
`MAILPIT_UI_PORT` del archivo `.env`; si no está, es 8025).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido), una por una:

```bash
git switch feat/b25-firma-electronica
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La tercera crea las tablas nuevas; la cuarta carga la tarea «Firma de la empresa». Si una falla con
«Can't reach database server», el equipo está lento: espere un minuto y repítala. Si `pnpm dev`
estaba encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`.

### 2. Preparar al cliente y a la Dirección (una sola vez)

1. **El cliente.** Los datos de demostración traen a **Comercializadora Andina S.A.S.** con su
   firmante autorizada **Laura Gómez Ríos** (cédula 1020555001, correo
   `laura.gomez@andina.example`). Falta aprobar su **conocimiento del tercero**: con Ana, Terceros →
   Comercializadora Andina → pestaña **Conocimiento** → registre uno; con Laura Díaz (Dirección),
   apruébelo.
2. **La Dirección.** Con Ana, en Terceros, cree una **persona** para Laura Díaz con una cédula de
   prueba (por ejemplo `1030555999`). Luego, en la terminal:

```bash
pnpm contratos:vincular-firmante --correo direccion@demo-uno.test --documento 1030555999
```

Debe responder «Listo: la persona ya puede firmar por la empresa».

### 3. Tener un contrato aprobado

Con Ana, cree un contrato para **Comercializadora Andina** y pida la revisión; con Laura Díaz,
apruébelo (pasos 3 y 5 del cierre del B24). Espere unos segundos a que aparezca «Descargar PDF».

### 4. Preparar y enviar a firma

1. Con Ana, en la ficha del contrato → pestaña **Firmas** → **«Preparar el envío a firma»**. Marque
   a **Laura Gómez**, elija a **Laura Díaz** como quien firma por la empresa y deje la fecha.
   **«Preparar el envío»**.
2. Ana no ve el botón «Enviar a firma». Entre con **Laura Díaz** → misma ficha → pestaña **Firmas**
   → **«Enviar a firma»**. El contrato queda **«En firma»**.

### 5. Firmar como el cliente

1. Abra **Mailpit** (http://localhost:8026 en este equipo): llegó «Firme el documento CTR-…» para Laura Gómez.
   Abra el enlace del correo (mejor en una ventana privada del navegador, sin sesión).
2. Verá el documento, sus datos y «Le corresponde firmar». Pulse **«Enviarme el código»**; en
   Mailpit llega «Su código para firmar …». Escríbalo y pulse **«Validar el código»**.
3. Lea el PDF en la página (o descárguelo), marque la casilla y pulse **«Firmar el documento»**.
   Queda «Usted ya firmó».
4. Pruebe también, con otro contrato, escribir cinco códigos equivocados: el enlace se bloquea, y
   desde la pestaña Firmas alguien de la Dirección puede **«Reenviar el enlace»**.

### 6. Firmar por la empresa

Con **Laura Díaz** → **Mis tareas**: está «Firmar CTR-… por la empresa». Abra el contrato →
pestaña **Firmas** → **«Firmar por la empresa»**, marque la casilla y **«Firmar»**. La plataforma
le pide su contraseña y su código del segundo factor.

### 7. Ver el resultado

1. En unos segundos el contrato queda **«Vigente»**. En la pestaña Firmas: «Firmado por todos»,
   el **código de verificación** y los botones **«PDF firmado»** y **«Certificado de evidencia»**.
   Ábralos: la última página del firmado es la página de firmas, y el certificado trae cada evento
   con su huella.
2. En Mailpit, Laura Gómez y Laura Díaz recibieron su copia.

### 8. Verificar

1. Abra http://localhost:3000/verificar (o desde la página de inicio, **«Verificar un
   documento»**). Escriba el código de verificación: «El documento es auténtico».
2. Cargue el **PDF firmado** que descargó: auténtico. Ahora cargue **cualquier otro PDF** (o el
   mismo después de abrirlo y guardarlo con otro programa, que lo cambia): «No encontramos un
   documento firmado con esos datos».

### 9. Rechazo y vencimiento (opcional)

Envíe otro contrato a firma y, en la página de firma, pulse **«No estoy de acuerdo: rechazar»**
con un motivo: el contrato vuelve a «Aprobado» y Ana recibe el aviso. El vencimiento y los
recordatorios los comprueban las pruebas adelantando el reloj, sin esperar días.

## Pendientes

- **Revisión externa de seguridad** (bloque crítico): antes de producción. Le conviene mirar en
  especial la página de firma, el código de seis números y la verificación pública.
- **Validación del asesor jurídico:** la cláusula de aceptación de la firma electrónica y el
  procedimiento (numeral 19.4). La cláusula de la biblioteca sigue «Por validar por el asesor
  jurídico».
- **Vincular colaboradores con su persona desde una pantalla:** hoy es el comando
  `pnpm contratos:vincular-firmante`. Llegará con la vinculación de Talento humano (M12).
- **Representante legal en el certificado de existencia:** el numeral 19.4 pide que quien firma por
  una persona jurídica figure como representante o apoderado. Hoy la plataforma confía en la marca
  «firmante autorizado» de Terceros; revisar el certificado de existencia es un control manual.
- **Firmar desde el portal del cliente (M09)**, contratos laborales (B35) y comodatos (B34): usarán
  este mismo mecanismo.
- **Archivar en el expediente del tercero:** el documento firmado vive en la ficha del contrato.
- **Proponer el proyecto (B26):** el evento `envelope.completed` ya queda en la bandeja de salida.
- **Nivel 3 (firma digital certificada) y sello de la empresa en el PDF:** fase F8.
- **«Copiar como borrador nuevo»** un contrato rechazado: hoy, para cambiar el texto, se hace un
  contrato nuevo.
- **Etiquetas de auditoría:** la pantalla de Auditoría muestra las acciones nuevas con su nombre
  técnico (por ejemplo `signature.sign`), como las de Contratos.
- **Pull requests #35, #37 y #38:** esta rama sale de ellos. Conviene aprobarlos primero.

## Decisiones tomadas

Las catorce que usted aprobó el 30/10/2026:

1. **Punto de partida:** la rama del B25 sale de la del B24.
2. **Alcance:** solo el nivel 2, para contratos, órdenes de servicio y otrosíes.
3. **Por la empresa firma la Dirección**, con su sesión y su segundo factor, en lugar del código.
4. **Por el cliente firman solo sus firmantes autorizados**, con correo y documento.
5. **No se envía sin el conocimiento del cliente aprobado.**
6. **Uno tras otro**, en el orden elegido; la empresa de última.
7. **Comercial prepara; la Dirección envía** (catálogo de permisos existente).
8. **Plazos:** 15 días por omisión, 30 como máximo; recordatorio cada 3 días, hasta 3.
9. **Rechazo:** cierra el proceso y el contrato vuelve a «Aprobado».
10. **La verificación pública** no muestra el contenido ni los nombres; la huella del archivo se
    calcula en el computador de quien consulta.
11. **La copia final** llega como enlace que sirve 30 días.
12. **Rutas públicas:** se agregaron a la prueba de seguridad las de la cotización (B23) y las de la
    firma y la verificación (B25), una por una.
13. **Llave contra envíos repetidos:** una pieza general de la plataforma, usada por ahora en
    «Enviar a firma».
14. **Al firmar todos** se emite el evento `envelope.completed`; crear el proyecto queda para el B26.

Y otras, menores, que tomé al construir:

- **El documento que se firma es el PDF aprobado** guardado como archivo con su huella (el manual
  nombra una «versión documental»; los contratos del B24 no usan versiones). Está anotado en
  [`sig.md`](../manual/datos/sig.md).
- **Cada correo con enlace trae un enlace nuevo**, y el anterior deja de servir: así un recordatorio
  o un reenvío siempre funciona, y un enlace viejo reenviado por error no.
- **Los intentos del código se cuentan por enlace**, no por código: pedir códigos nuevos no da más
  intentos. Reenviar el enlace los reinicia.
- **El código lo genera el worker**, no la API: así nunca pasa por la cola de trabajos ni queda
  escrito en ninguna parte; la base guarda solo su huella.
- **La consulta de verificación que no encuentra nada no se guarda**: no pertenece a ninguna
  empresa. Las que encuentran un documento quedan registradas en su empresa.
- **Vincular a la Dirección con su persona** se hace por un comando, porque la plataforma no tiene
  todavía esa pantalla (llega con Talento humano).
