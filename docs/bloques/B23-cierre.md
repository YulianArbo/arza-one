# Cierre del bloque B23: Portafolio y cotizaciones

- Fecha: 29/10/2026
- Rama: `feat/b23-portafolio-y-cotizaciones` (parte de `feat/b22a-nueva-apariencia`, la apariencia
  nueva, que todavía espera su revisión en el pull request #35)
- Estado: en revisión. No es un bloque crítico: basta con su aprobación.

## Qué se construyó

Desde este bloque, Comercial ya **cotiza**. La empresa tiene su **portafolio de servicios** con
tarifas, arma cotizaciones con un **asistente de tres pasos** que calcula los totales mientras se
escribe, la **Dirección aprueba** las que llevan un descuento por encima del tope, la plataforma
genera el **PDF FT-COM-001** y lo **envía al cliente** con un enlace donde la **acepta o la rechaza
en línea**, y queda la evidencia. Una cotización enviada no se edita: se crea una **versión
nueva**. Usted aprobó el plan con las doce recomendaciones; están al final.

| Pieza                   | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portafolio              | Comercial › **Portafolio**. Cada servicio con su código `SRV-0001`, unidad (hora, mes, proyecto…), tarifa y tipo de impuesto. Un servicio inactivo deja de ofrecerse, pero las cotizaciones que ya lo usan no cambian                                                                                                                             |
| Parámetros tributarios  | Finanzas › **Parámetros tributarios** (para el Contador y Finanzas). Cada impuesto con su tarifa, la fecha desde la que rige y su fundamento legal. Un cambio nunca borra la tarifa anterior: queda en el historial. Vienen cargados **IVA 19 %** y **Sin IVA 0 %**, marcados «Por validar por el Contador»                                       |
| Tope de descuento       | Administración › **Parámetros** › «Tope de descuento sin aprobación». Viene en **10 %** y se cambia con fecha, como el horario laboral                                                                                                                                                                                                            |
| Asistente de cotización | Desde la ficha de una oportunidad abierta, **«Nueva cotización»**: 1) vigencia (propone 30 días), 2) ítems del portafolio o escritos a mano con cantidad, precio y descuento, con el **total en vivo** y el aviso si un descuento pasa el tope, 3) forma de pago, plazo de entrega, garantía y notas. Recibe el código `COT-2026-0001`, versión 1 |
| Aprobación              | **«Pedir el envío»**: si ningún descuento pasa el tope, queda **aprobada** sola; si pasa, va a **Mis tareas** de la Dirección, que la **aprueba** o la **devuelve** con un comentario. Quien la elaboró nunca la aprueba, ni teniendo el rol de Dirección                                                                                         |
| PDF FT-COM-001          | Al aprobarse, la plataforma genera la **Propuesta Comercial** con el encabezado y el pie institucionales: datos de la empresa y del cliente, ítems, subtotal, descuentos, IVA por tarifa, total, condiciones y un texto sobre la aceptación en línea. Se descarga desde la ficha                                                                  |
| Envío                   | **«Enviar al cliente»**: propone el correo del cliente registrado en Terceros (se puede cambiar). El cliente recibe un correo con el enlace, que sirve hasta las 11:59 p. m. del último día de vigencia                                                                                                                                           |
| Página del cliente      | El cliente abre el enlace **sin usuario ni contraseña**: ve la cotización, descarga el PDF y la **acepta** (escribe su nombre y marca «Acepto») o la **rechaza** (motivo opcional), una sola vez. Se ve bien en el celular                                                                                                                        |
| Evidencia               | Queda la **fecha y hora**, la **dirección IP**, el **navegador**, quién aceptó, la **versión** y la **huella digital del PDF** (prueba de que el documento no cambió). También queda registrado cada vez que el cliente abre la cotización o descarga el PDF                                                                                      |
| Versiones               | Una enviada **no se edita**. **«Crear versión nueva»** la copia como borrador (versión 2) con las tarifas de hoy; la anterior queda **«Reemplazada»** y su enlace ya no sirve para aceptar                                                                                                                                                        |
| Vencimiento             | Pasado el último día, el cliente ve «venció el dd/mm/aaaa y ya no puede aceptarse». Cada noche, a las 12:05 a. m., las enviadas sin respuesta quedan **«Vencidas»**                                                                                                                                                                               |
| Avisos                  | Quien elaboró la cotización recibe un aviso (campana y correo) cuando la Dirección decide, cuando el cliente responde y cuando vence                                                                                                                                                                                                              |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `crm_services`, `crm_quotes`,
`crm_quote_items` y `fin_tax_parameters`. Diccionario en [`crm.md`](../manual/datos/crm.md) y
[`fin.md`](../manual/datos/fin.md).

**Rutas nuevas de la API:** 18, en [`apps/api/README.md`](../../apps/api/README.md) y en
`apps/api/openapi.json`. **Trabajos nuevos del worker:** el PDF y el correo (cada 20 segundos) y
el vencimiento (cada día).

**Cambio en toda la plataforma:** cada vez que alguien intenta algo **sin permiso** (respuesta 403),
ahora queda un **evento de seguridad** con quién, qué permiso y qué ruta. El anexo D lo pide para
el envío de cotizaciones; en el B22 quedó como pendiente porque no existía en ningún módulo.

**Lineamientos visuales del B22A:** las pantallas usan solo componentes de `@arza/ui`, los tokens
de color, una acción principal por pantalla, resumen de errores en cada formulario y «Disponible
pronto» en Finanzas para lo que llega después. Las tablas anchas se recorren con el teclado.

## Cómo se probó

### Los diez casos de totales (criterio de aceptación)

Cada caso se calculó a mano, línea por línea, redondeando al centavo con la mitad hacia arriba. La
prueba (`packages/contracts/src/crm/quote-totals.test.ts`) compara la plataforma con estos valores.
**Los diez coinciden al centavo.**

| #   | Caso                                                                                             | Subtotal      | Descuentos   | IVA          | Total         |
| --- | ------------------------------------------------------------------------------------------------ | ------------- | ------------ | ------------ | ------------- |
| 1   | 1 × $ 1.000.000, sin descuento, IVA 19 %                                                         | 1.000.000,00  | 0,00         | 190.000,00   | 1.190.000,00  |
| 2   | 10 horas × $ 85.000, 5 % de descuento                                                            | 850.000,00    | 42.500,00    | 153.425,00   | 960.925,00    |
| 3   | 3 × $ 33.333,33 (el IVA 18.999,9981 sube a 19.000,00)                                            | 99.999,99     | 0,00         | 19.000,00    | 118.999,99    |
| 4   | 1,5 × $ 120.000,50 con 7,5 % de descuento                                                        | 180.000,75    | 13.500,06    | 31.635,13    | 198.135,82    |
| 5   | 2 × $ 450.000, exento (0 %)                                                                      | 900.000,00    | 0,00         | 0,00         | 900.000,00    |
| 6   | 1 × $ 500.000 con 100 % de descuento                                                             | 500.000,00    | 500.000,00   | 0,00         | 0,00          |
| 7   | 12 meses × $ 1.250.000 con 10 % + licencia exenta de $ 3.000.000                                 | 18.000.000,00 | 1.500.000,00 | 2.565.000,00 | 19.065.000,00 |
| 8   | 1 × $ 10,10 con 15 % (el descuento 1,515 sube a 1,52)                                            | 10,10         | 1,52         | 1,63         | 10,21         |
| 9   | 7 × $ 12.345,67 con IVA 5 % (4.320,9845 baja a 4.320,98)                                         | 86.419,69     | 0,00         | 4.320,98     | 90.740,67     |
| 10  | Tres líneas con centavos (0,25 × $ 99.999,99; 40 × $ 75.000 con 12,5 %; 1 × $ 199,99 con 3,33 %) | 3.025.199,99  | 375.006,66   | 503.536,73   | 3.153.730,06  |

La web usa **la misma fórmula** que la API para mostrar el total mientras se escribe, así lo que
usted ve es lo que se guarda.

### Lo demás

| Prueba                       | Qué demuestra                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Borrador                     | Nace con su código y la versión 1; los totales los calcula la API con la tarifa vigente; no acepta impuestos sin tarifa ni vigencias pasadas; solo para oportunidades abiertas                                                                 |
| Aprobación                   | Sin descuento sobre el tope queda aprobada sola; con descuento va a Mis tareas de la Dirección, que aprueba (la tarea se cierra) o devuelve con comentario; Comercial no aprueba; quien la elaboró no aprueba aunque tenga el rol de Dirección |
| **Una enviada no se edita**  | Ni por la API ni directamente en la base de datos (la base lo rechaza)                                                                                                                                                                         |
| Envío                        | Solo una aprobada con su PDF listo; el cliente recibe el correo con el enlace; la auditoría guarda el destinatario y la versión                                                                                                                |
| Enlace del cliente           | Muestra lo necesario sin datos internos; un enlace inventado no sirve; el PDF se descarga; aceptar exige nombre y casilla y guarda la evidencia completa; no se responde dos veces; rechazar con motivo                                        |
| **No se acepta una vencida** | Con el reloj adelantado: el cliente ve que venció y aceptar responde «La cotización venció el dd/mm/aaaa y no puede aceptarse»; el trabajo diario la marca vencida y avisa; una aprobada vencida no se envía y se crea una versión nueva       |
| Versiones                    | La versión 2 copia la 1, que queda reemplazada; el enlace de la 1 ya no acepta; la lista muestra solo la última                                                                                                                                |
| Parámetros tributarios       | Una tarifa nueva conserva la anterior y deja auditoría; no se reescribe el pasado; las cotizaciones usan la tarifa de hoy y no la programada                                                                                                   |
| Portafolio                   | Código propio, nombre sin repetir, impuesto válido y desactivar sin borrar                                                                                                                                                                     |
| Pantallas                    | 40 pruebas nuevas de pantalla y, en un navegador real, las seis pantallas nuevas sin fallas de accesibilidad en modo claro y oscuro, y la del cliente en un celular de 390 px                                                                  |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el Colaborador, el Contador y el portal no ven cotizaciones ni el
  portafolio. Calidad las lee pero no crea, envía ni administra el portafolio. Quien no tiene
  `crm.quote.send` (por ejemplo, la Dirección) recibe 403 y **queda el evento de seguridad**, como
  pide el anexo D. Solo el Contador y Finanzas administran los impuestos.
- **Aislamiento:** otra empresa no ve, no versiona ni aprueba las cotizaciones de esta, no ve su
  portafolio y una cotización no puede usar un servicio de otra empresa. El enlace de una
  cotización solo abre esa cotización.
- **Auditoría:** cada paso deja su evento (crear, guardar, pedir el envío, aprobar, devolver, PDF,
  enviar, enlace, correo, abrir, descargar, aceptar, rechazar, vencer, versión nueva, servicios e
  impuestos). El recorrido de auditoría de la plataforma ya incluye las 18 rutas nuevas (174 en
  total).

### Resultado de `pnpm check`

El 29/10/2026, paso por paso en este equipo (ver las notas). **Todo pasa salvo una prueba del
módulo de documentos (B19) que falla igual en la versión anterior, sin cambios de este bloque.**

| Paso                    | Resultado                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                                                      |
| Estilo (ESLint) y tipos | Sin problemas                                                                                                                            |
| Fronteras entre módulos | Sin problemas: Comercial usa núcleo, terceros, documentos, flujos y finanzas solo por sus índices                                        |
| Código sin usar (knip)  | Sin problemas                                                                                                                            |
| Pruebas unitarias       | Todas: web 505 (88 archivos), contratos, plantillas, componentes y demás paquetes. Cobertura de ramas de la web: 85,4 % (mínimo 85 %)    |
| Pruebas de integración  | Worker 25 de 25. API 926 de 931: las 5 restantes son del módulo de documentos y fallan por tiempo de espera de la base de datos (nota 2) |
| Compilación             | Sin problemas                                                                                                                            |
| Pruebas en navegador    | 235: todas pasan; dos fallaron una vez por carga y pasan solas (nota 3)                                                                  |
| Búsqueda de secretos    | Ninguno                                                                                                                                  |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo (nota 4)                                                           |

**Cosas que debe saber de esta verificación:**

1. **Formato:** como en los bloques anteriores, excluí la carpeta local de herramientas `.agents/`
   y `skills-lock.json`, que no son del proyecto ni de este bloque.
2. **Prueba que no depende de este bloque:** la carga de los 251 documentos del Listado Maestro
   (B19) no logra abrir transacciones a tiempo en este equipo, que tenía menos de 1 GB de memoria
   libre. Para saber si la causa era mía, la corrí también sobre la versión anterior (sin ningún
   cambio del B23) y **falla exactamente igual**. Las otras cuatro fallas de documentos (antivirus
   o pruebas que pasaron de 30 segundos) pasan al repetirlas solas. Por esa misma prueba, este
   equipo no alcanzó a medir la cobertura de la integración de la API: la integración continua de
   GitHub lo hará con el pull request. Le recomiendo mirar ese resultado antes de aprobar.
3. **Navegador:** dos revisiones de contraste en modo oscuro (portal y usuarios, pantallas que
   este bloque no toca) fallaron una vez con el equipo cargado; al repetirlas solas pasan las 48.
4. **Migración sobre la versión anterior:** agrega las cuatro tablas nuevas y amplía la lista de
   tipos de aviso; no cambia datos existentes. La semilla le quita a Comercial el permiso de aprobar
   cotizaciones. El ensayo completo sobre la versión anterior lo corre la integración continua
   (`migrations-upgrade.sh`); en este equipo no hubo memoria para hacerlo.
5. **Errores reales que encontraron las pruebas y corregí:**
   - El worker guardaba el enlace del cliente sin su evento de auditoría y la plataforma lo
     rechazaba (regla ADR-012). Ahora queda registrado como `crm.quote.link_issue`.
   - En el asistente, los problemas de «Forma de pago» y «Plazo de entrega» no se mostraban junto a
     su campo.
   - En el celular, la tabla de la página del cliente se desplazaba de lado pero no con el teclado.
   - Si guardar el evento de seguridad de un «sin permiso» fallara, la persona habría recibido un
     error interno; ahora recibe igual «sin permiso» y el fallo queda en el registro del servidor.
6. **Ajustes a pruebas existentes, sin debilitarlas:** la prueba de «módulo en construcción» usaba
   Finanzas como ejemplo y ahora usa Contratos; la de «los permisos de dos roles se suman» usaba
   «aprobar cotizaciones» como permiso de Comercial y ahora usa «enviar cotizaciones»; la prueba
   del OpenAPI incluye las 18 rutas nuevas; la de Comercial en el navegador simula la lista de
   cotizaciones de la oportunidad. Agregué pruebas reales para cubrir los casos que faltaban.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** con el rol **Comercial** y a la persona de
**Dirección** (`direccion@demo-uno.test`, Laura Díaz, del cierre del B19). Los correos llegan a
**Mailpit** (http://localhost:8025), que hace de buzón de prueba.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido):

```bash
git switch feat/b23-portafolio-y-cotizaciones
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

La tercera crea las tablas nuevas; la cuarta carga los dos impuestos, el tope de descuento de 10 %
y la tarea de aprobación de la Dirección, y le quita a Comercial el permiso de aprobar
cotizaciones. Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y vuelva a escribir
`pnpm dev`.

### 2. Revisar los impuestos y el tope

1. Si tiene una persona con el rol **Contador**, entre con ella → **Finanzas** →
   **Parámetros tributarios**: verá IVA 19 % y Sin IVA 0 %, con su fundamento y su historial.
2. Como administradora, Administración › **Parámetros**: verá «Tope de descuento sin aprobación:
   hasta 10 % por ítem».

### 3. Armar el portafolio

1. Entre con **Ana** → **Comercial** → **Portafolio** → **«Agregar servicio»**.
2. Por ejemplo: «Desarrollo a la medida», unidad **Hora**, tarifa `85000`, impuesto **IVA general**.
   Guarde. Recibe el código `SRV-0001`.

### 4. Hacer una cotización

1. Comercial (embudo) → abra una oportunidad abierta (o registre una).
2. En su ficha, sección **Cotizaciones**, pulse **«Nueva cotización»**.
3. Paso 1: deje la vigencia propuesta → **Siguiente**.
4. Paso 2: elija el servicio y **«Agregar del portafolio»**; cambie la cantidad a `10` y el
   descuento a `15`. Vea cómo cambia el total y el aviso de que irá a la Dirección (pasa el 10 %).
   **Siguiente**.
5. Paso 3: escriba la forma de pago y el plazo de entrega → **«Guardar borrador»**. Se abre la
   ficha con el código `COT-2026-…`, versión 1.

### 5. La aprobación de la Dirección

1. En la ficha, **«Pedir el envío»**. Queda **«En aprobación»**.
2. Salga y entre con la persona de **Dirección** → **Mis tareas**: está «Aprobar la cotización
   COT-…». Ábrala (o vaya a Comercial › Cotizaciones) y pulse **«Aprobar»** → «Sí, aprobar».
   También puede probar **«Devolver para corregir»** con un comentario: vuelve a borrador y Ana lo
   ve en la ficha.
3. En unos segundos la ficha dice que el PDF está listo: **«Descargar PDF»** y ábralo.

### 6. Enviarla al cliente y aceptarla

1. Entre con **Ana** → la cotización → **«Enviar al cliente»**. Escriba un nombre y un correo de
   prueba (por ejemplo `cliente@example.com`) → **Enviar**.
2. Abra **Mailpit** (http://localhost:8025): llegó «Cotización COT-… de …» con el enlace.
3. Abra el enlace (mejor en una ventana privada, para ver lo que ve el cliente sin sesión).
   Pruebe **«Aceptar la cotización»** sin llenar nada: le pide el nombre y la casilla. Escriba un
   nombre, marque la casilla y acepte.
4. Vuelva a la ficha con Ana: está **«Aceptada»** y abajo la **evidencia** (fecha, IP, navegador
   y huella del PDF). Ana recibió el aviso en la campana.

### 7. Versión nueva

1. Haga otra cotización y envíela (pasos 4 a 6, esta vez con un descuento de `5`: queda aprobada
   sola, sin la Dirección).
2. Antes de que el cliente responda, en la ficha pulse **«Crear versión nueva»** → «Sí, crear».
   Se abre la versión 2 en borrador; la 1 aparece **«Reemplazada»**.
3. Abra el enlace del primer correo: dice que hay una versión más reciente y no deja aceptar.

### 8. Una vencida no se acepta (opcional)

Una cotización con vigencia de hoy se puede aceptar hasta las 11:59 p. m. Si la deja enviada y
abre el enlace al día siguiente, verá «Esta cotización venció el dd/mm/aaaa y ya no puede
aceptarse»; esa noche quedará «Vencida». (Las pruebas automáticas lo comprueban adelantando el
reloj, sin esperar un día.)

## Pendientes

- **Revisión de requisitos y acta de arranque (FT-COM-002)** antes de comprometerse: está en la
  ficha 17.6 pero no en los entregables de este bloque.
- **Renovaciones y seguimiento posventa:** ídem.
- **Horarios de la Ley 2300 para mensajes comerciales:** no se aplican al correo de la cotización
  (decisión 10); queda para cuando la plataforma envíe publicidad.
- **El contrato desde la cotización aceptada:** la cotización aceptada ya emite la señal
  `crm.quote.accepted`; Contratos (B24) la usará para proponer el contrato.
- **Formato FT-COM-001 original:** no está en el repositorio; el PDF usa el contenido que usted
  aprobó. El encabezado dice versión 01 sin fecha de versión, porque el formato aún no está en el
  Listado Maestro. Si aparece el original o Calidad lo publica, se ajusta.
- **Validación del Contador:** las tarifas de IVA vienen marcadas «Por validar por el Contador».
  Debe revisarlas y, si hace falta, registrar la tarifa correcta desde Finanzas.
- **Pull request #35 (apariencia nueva):** esta rama sale de él. Conviene aprobarlo primero; luego
  este pull request queda solo con lo del B23.

## Decisiones tomadas

Las doce que usted aprobó el 28/10/2026:

1. **Punto de partida:** la rama del B23 sale de la del B22A, para que las pantallas nazcan con la
   apariencia nueva.
2. **Parámetros tributarios ahora**, con una pantalla mínima para el Contador; IVA 19 % y 0 %
   «por validar»; las retenciones van en la factura (B31), no en la cotización.
3. **Tope de descuento** como parámetro con fechas, en 10 %, medido **por ítem**, sin descuento
   global.
4. **Solo la Dirección aprueba**; nadie aprueba la suya; sin descuento sobre el tope se aprueba
   sola.
5. **Dos estados más:** «Aprobada» y «Reemplazada».
6. **Redondeo por línea**, mitad hacia arriba; el total es la suma de las líneas.
7. **FT-COM-001** con el contenido propuesto.
8. **Destinatario** del cliente en Terceros o el que escriba Comercial; enlace hasta las 11:59 p. m.
   del último día; quien acepta escribe su nombre y marca «Acepto».
9. **Aceptar no gana la oportunidad** sola: avisa a Ana y deja la señal para Contratos.
10. **Ley 2300:** el correo de la cotización es respuesta a una solicitud del cliente; no se le
    aplica la restricción de horarios.
11. **Correos a quien no es usuario:** el correo al cliente sale con el mismo mecanismo de las
    invitaciones (el worker crea el enlace al enviarlo y la base solo guarda su huella).
12. **El servicio guarda el tipo de impuesto**, no la tarifa; la cotización guarda la tarifa usada.

Y otras que tomé al construir, sin cambiar lo aprobado:

- **Evento de seguridad por cada «sin permiso»** en toda la plataforma (estaba pendiente desde el
  B22 y lo pide el anexo D para este bloque).
- **Lo que el cliente abre queda registrado:** cada vez que abre la cotización o descarga el PDF,
  con su IP y navegador. Sirve de evidencia y cumple la regla de que toda acción que escribe deje
  auditoría.
- **La llave del enlace nunca va en la dirección** que viaja al servidor (va después de «#» y en el
  cuerpo de cada petición), como en las invitaciones: no queda en los registros.
- **Encabezado e ítems se guardan juntos** (`PUT /v1/crm/quotes/{id}`), para que un borrador nunca
  quede a medias; el manual nombraba un recurso `quotes/{id}/items` aparte.
- **El enlace del PDF interno** se pide con `POST /v1/crm/quotes/{id}/pdf` (el manual dice `GET`),
  porque pedirlo deja auditoría, igual que las demás descargas.
- **`decimal.js` también en los contratos** (ya estaba en la API; licencia MIT, mantenida): así la
  web y la API calculan con la misma fórmula.
- **Finanzas** dejó de ser «en construcción»: muestra los parámetros tributarios y «Disponible
  pronto» para lo demás. La prueba de la pantalla «en construcción» ahora usa Contratos (B24) como
  ejemplo.

## Commits

| Commit    | Qué incluye                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `71238f6` | Modelo de datos, migración, contratos, cálculo de totales con los diez casos, tope de descuento y permiso de aprobar solo para la Dirección |
| `344beb9` | API y worker: impuestos, portafolio, cotizaciones, aprobación, PDF, correo, enlace del cliente y vencimiento                                |
| `8033407` | Pruebas de integración, recorrido de auditoría y evento de seguridad por permiso denegado                                                   |
| `c3ce5fc` | Pantallas y sus pruebas                                                                                                                     |
| `43b6a9d` | Diccionario de datos, documentación de la API, OpenAPI y pruebas en navegador                                                               |
| siguiente | Ajustes de la verificación y este cierre                                                                                                    |
