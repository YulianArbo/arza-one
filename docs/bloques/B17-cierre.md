# Cierre del bloque B17: Privacidad, avisos, autorizaciones y actividades de tratamiento

- Fecha: 16/10/2026
- Rama: `feat/b17-privacidad-avisos-autorizacion`
- Estado: en revisión. **Es un bloque crítico:** además de su aprobación, necesita la revisión
  externa que pide el manual (capítulo 23) y, antes de producción, el concepto del asesor jurídico
  sobre los textos y la aprobación del registro por el Oficial de Protección de Datos (numeral 20.5).

## Qué se construyó

Desde este bloque, ARZA ONE **no deja registrar los datos de una persona sin su autorización de
tratamiento**, y cada autorización guarda **la versión exacta del texto que la persona aceptó**
(Ley 1581 de 2012, art. 9). Además, el Oficial de Protección de Datos tiene su propio menú,
**Privacidad**. Usted aprobó el plan con las seis recomendaciones; las decisiones están al final.

| Pieza                          | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Avisos y versiones             | La política, el aviso de privacidad y cinco textos de autorización (clientes, proveedores, colaboradores, candidatos y contactos). Cada uno se redacta en **borrador**, se **publica** y, al publicar uno nuevo, el anterior queda **reemplazado**. Lo publicado no se puede cambiar, ni siquiera desde la base de datos |
| Componente de autorización     | Una pieza de pantalla reutilizable: muestra el texto vigente y su versión, las finalidades que ofrece, cómo y cuándo se obtuvo, un soporte opcional y **la casilla de autorización, que nunca viene marcada**                                                                                                            |
| Terceros › Registrar (persona) | Usa el componente. Sin la casilla, el servidor rechaza el registro aunque alguien intente saltarse la pantalla: **o se guarda la persona con su autorización, o no se guarda nada**                                                                                                                                      |
| Ficha de la persona            | La tarjeta **«Autorizaciones de tratamiento»** en el Resumen, con el texto y la versión de cada una, y el botón **«Registrar autorización»** para una nueva (por ejemplo, otra finalidad)                                                                                                                                |
| Privacidad › Autorizaciones    | Todas las autorizaciones con su **evidencia**: quién la registró, cuándo, desde qué dirección y navegador. Desde ahí el Oficial la **revoca** con un motivo; nunca se borra                                                                                                                                              |
| Privacidad › Actividades       | El registro de cada uso de datos personales: qué datos, de quiénes, para qué, con qué fundamento, cuánto tiempo y con qué encargados. Si incluye salud o biométricos, aparece **«Datos sensibles»**                                                                                                                      |
| Privacidad › Encargados        | Los proveedores que tratan datos por cuenta de la empresa, el país y su contrato de transmisión. Sin contrato aparecen en rojo: **«Falta contrato de transmisión»**                                                                                                                                                      |

**Tablas nuevas** (todas separadas por empresa con la seguridad por fila): `prv_notices`,
`prv_consents`, `prv_processing_activities`, `prv_processors` y `prv_activity_processors` (los
encargados de cada actividad). Diccionario en [`prv.md`](../manual/datos/prv.md).

**Lo que cambió en Terceros:** los tres campos sueltos (finalidad, cómo se obtuvo y fecha) se
reemplazaron por el componente. Las autorizaciones que ya existían **se trasladaron**, con su
finalidad, canal y fecha, a la tabla nueva, ligadas a un texto especial «Registro anterior a B17».
Ninguna se perdió. Las tres columnas viejas se conservan sin uso hasta un bloque posterior, porque la versión anterior de la API las sigue usando durante un despliegue.

**Permisos:** no se creó ninguno; se usan los del anexo G que ya existían (`privacy.*`). Como
aprobó, revocar usa «Gestionar solicitudes de titulares» (`privacy.request.manage`).

## Cómo se probó

| Prueba                                   | Qué demuestra                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sin autorización no se guarda (criterio) | Una persona sin autorización, con la casilla sin marcar, con una finalidad que el texto no ofrece, con fecha futura, con un texto inexistente o con un soporte ajeno: **en todos los casos no queda ninguna persona guardada** |
| Guarda la versión aceptada (criterio)    | La autorización queda con el texto exacto, el origen, quién la registró y la dirección, y deja su evento de auditoría                                                                                                          |
| El texto cambió mientras se llenaba      | Si el Oficial publica una versión nueva mientras alguien llena el formulario, el envío con la versión vieja se rechaza con «El texto de autorización cambió…» y no se guarda nada; con el texto nuevo, sí                      |
| La base de datos también protege         | Cambiar un texto publicado, autorizar sobre un borrador o editar una autorización falla en la base de datos misma                                                                                                              |
| Versiones                                | Publicar reemplaza la vigente; un borrador a la vez por texto; versión vieja en el formulario: «otra persona cambió…»                                                                                                          |
| Revocatoria                              | Exige motivo; una sola vez; la autorización sigue existiendo como «Revocada»                                                                                                                                                   |
| Registro y encargados                    | Encargado solo si es una organización de Terceros; el contrato solo si es un archivo propio revisado; los encargados de una actividad se quitan y vuelven a poner                                                              |
| Traslado de B13                          | En su base local, con las 10 migraciones anteriores: las 4 personas ficticias quedaron con su autorización; las tres columnas viejas quedaron sin uso                                                                          |
| Pantallas                                | 21 pruebas de pantalla nuevas y 11 en un navegador real, sin fallas de accesibilidad en modo claro y oscuro                                                                                                                    |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** Comercial, Administración de la plataforma y el portal no entran a
  Privacidad (403). El Auditor y Dirección leen las autorizaciones pero no revocan ni administran
  textos. El colaborador solo ve las que él registró. Quien no edita terceros no registra
  autorizaciones en la ficha.
- **Aislamiento:** la otra empresa no ve los textos, las autorizaciones ni los encargados de esta
  («no existe»), no puede revocarlas, no puede usar un texto de esta empresa en su formulario ni
  registrar como encargado un tercero de esta.
- **Auditoría:** las 9 rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una (`privacy.notice.*`, `privacy.consent.grant` · `revoke`, `privacy.activity.*`,
  `privacy.processor.*`).

### Resultado de `pnpm check`

En verde el 16/10/2026, paso por paso (ver las notas):

| Paso                    | Resultado                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                                                                                                                                                      |
| Estilo y tipos          | Sin problemas                                                                                                                                                                                                                            |
| Fronteras entre módulos | Sin problemas: `privacy` usa `core`, `doc` e `iam` solo por sus índices; `party` usa `privacy` solo por su índice                                                                                                                        |
| Código sin usar (knip)  | Sin problemas                                                                                                                                                                                                                            |
| Pruebas unitarias       | API 295, web 313, contratos 90, worker 38, interfaz 19, configuración 24, guiones 140, plantillas 4                                                                                                                                      |
| Pruebas de integración  | API 585 en 64 archivos (5 nuevos de privacidad), worker 20                                                                                                                                                                               |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la API en integración y de la web: mínimo 85 %)                                                                                                                                      |
| Pruebas en navegador    | Las 156, incluidas 11 nuevas (privacidad y autorización de la persona nueva), en modo claro y oscuro, sin fallas de accesibilidad                                                                                                        |
| Búsqueda de secretos    | Ninguno                                                                                                                                                                                                                                  |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo; **sobre la versión anterior** en su base local (10 migraciones y 4 personas ficticias); y la revisión de compatibilidad de la integración continua, sin hallazgos |

**Cosas que debe saber de esta verificación:**

1. **Las mismas carpetas ajenas de bloques anteriores** (`apps/api/.agents`, `.claude`,
   `.windsurf`) no son del proyecto; revisé el formato sin ellas y corrí las pruebas un paquete a
   la vez.
2. **Tres pruebas que ya existían fallaron una vez por tiempo** y pasaron solas, sin cambiarlas:
   el arranque de la API (el programa recién compilado arranca lento en Windows la primera vez),
   el correo del worker a Mailpit y la de «códigos nuevos» del segundo factor (una animación sin
   terminar). Ninguna toca privacidad.
3. **La cobertura de ramas bajó del 85 %** con el código nuevo: en la web (84,74 %) y en la
   integración de la API en GitHub (84,71 %). No bajé la exigencia: agregué pruebas de los casos
   que faltaban (versión nueva, editar un encargado, autorización revocada, actividad con
   encargados, listados con filtros y páginas, y cargar la semilla dos veces).
4. **La revisión de migraciones de GitHub** rechazó la primera versión por dos razones, con toda
   la razón: apagaba por un momento la seguridad por fila para trasladar las autorizaciones viejas,
   y borraba las tres columnas viejas en la misma versión. Ahora el traslado se hace empresa por
   empresa con la seguridad por fila activa (como el traslado de la auditoría en B11), y las
   columnas **se conservan sin uso** (numeral 10.6, «expandir, migrar, contraer»): la versión
   anterior de la API las sigue usando durante un despliegue. Se borrarán en un bloque posterior.
5. **El documento OpenAPI** (`apps/api/openapi.json`) se regeneró con las 12 rutas nuevas.

## Cómo lo prueba usted, paso a paso

Use **su propia cuenta** (está en «Empresa Demo Uno» y ya tiene el rol Oficial de Protección de
Datos) y la de **Ana** (Administradora de plataforma, sin acceso a Privacidad).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto (con `pnpm infra:up` ya encendido), uno por uno:

```bash
git switch feat/b17-privacidad-avisos-autorizacion
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

El segundo crea las tablas nuevas y traslada las autorizaciones viejas; el tercero carga los textos
y, **solo en las empresas de demostración**, los publica. (En su base local ya hice los dos: si
le dicen «nada que aplicar», está bien.) Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y
vuelva a escribir `pnpm dev`.

### 2. El menú Privacidad

1. Entre con su cuenta en http://localhost:3000. En el menú aparece **Privacidad**, con cuatro
   secciones.
2. **Avisos y versiones:** cada texto dice «Vigente: versión 1». Ábralo con **«Nueva versión»**,
   cambie el título y guarde: queda un **borrador**. Pulse **«Publicar»** y confirme: ahora la
   versión 2 es la vigente y la 1 dice «Reemplazado».
3. Intente crear otra «Nueva versión» del mismo texto mientras haya un borrador: el botón no
   aparece, porque solo puede haber un borrador a la vez.

### 3. Registrar una persona (el criterio del bloque)

1. Vaya a **Terceros › Registrar un tercero** y elija **Persona**. Llene nombres, apellidos y
   documento con datos inventados.
2. Abajo aparece **«Autorización de tratamiento de datos»**. Pulse **Guardar** sin marcar nada:
   sale **«Marque la casilla de autorización para continuar.»** y no se guarda.
3. Elija el texto «Autorización de contactos», lea el texto que aparece, marque una finalidad,
   elija «Documento firmado», ponga la fecha de hoy y **marque la casilla**. Guarde.
4. En la ficha de la persona, en **Resumen**, la tarjeta **«Autorizaciones de tratamiento»** muestra
   el texto con su **versión**, la finalidad, el canal y la fecha.
5. Prueba del «texto que cambió»: abra **dos pestañas**. En una empiece a registrar otra persona y
   elija el texto. En la otra, publique una versión nueva de «Autorización de contactos». Vuelva a
   la primera y guarde: sale **«El texto de autorización cambió mientras usted llenaba el
   formulario…»**. Elija el texto nuevo y guarde.

### 4. Evidencia y revocatoria

1. **Privacidad › Autorizaciones:** está la persona que registró. Pulse **«Ver evidencia»**: quién
   la registró, cuándo, la dirección IP y el navegador.
2. Escriba un motivo y pulse **«Revocar»**. Ahora dice **«Revocada»**, y en la ficha de la persona
   también. No desapareció.
3. Las 4 personas ficticias que ya existían aparecen con el texto **«Registro anterior a B17»**.

### 5. Actividades y encargados

1. **Encargados › Registrar encargado:** elija una organización (por ejemplo «Papelería El Cóndor»),
   escriba el servicio y la fecha de revisión, sin contrato. Queda en rojo: **«Falta contrato de
   transmisión»**.
2. **Actividades › Registrar actividad:** llene los textos, marque «Salud (sensible)» entre los
   datos y elija el encargado. En la lista aparece **«Datos sensibles»**.

### 6. Sin permiso y auditoría

1. Entre con **Ana**: el menú **no** muestra Privacidad, y si escribe
   http://localhost:3000/app/privacidad/autorizaciones ve «No tiene acceso a esta sección».
2. Con su cuenta, en **Auditoría**, aparecen los eventos de privacidad («privacy.notice.publish»,
   «privacy.consent.grant», «privacy.consent.revoke»…).

## Pendientes

- **Bloque B42** (privacidad completa): solicitudes de titulares con plazos legales, exportación y
  supresión de datos, incidentes y preferencias de cookies. Allí se cumple «revocar detiene las
  comunicaciones comerciales»: hoy la plataforma no envía comunicaciones comerciales.
- **Textos oficiales:** los textos cargados son **provisionales** y dicen «PENDIENTE DE CONCEPTO
  JURÍDICO». En la empresa real (ARZA TECH) quedaron en borrador: mientras el Oficial no publique
  el texto aprobado por el asesor jurídico, **no se pueden registrar personas allí**.
- **Otros formularios con datos personales** usarán el mismo componente cuando existan: los
  públicos (B41) y los de talento humano. El README de la API explica cómo conectarlo.
- **«Mis datos y privacidad»** para que cada colaborador vea sus propias autorizaciones: necesita
  enlazar el usuario con su ficha de tercero, que llega con talento humano.
- **Contrato del encargado como documento controlado:** hoy es un archivo (B14); cuando exista la
  gestión documental (B18) podrá apuntar al documento.
- **Borrar las tres columnas viejas de Terceros** (`data_purpose`, `data_authorization`, `data_authorized_on`) en una migración posterior, marcada como fase de contraer.
- **Subir el soporte desde el formulario:** hoy se sube en **Archivos** y luego se elige.

## Decisiones tomadas

Las seis que usted aprobó:

1. **Los tres campos de Terceros se reemplazaron** por el componente; lo existente se trasladó al
   «Registro anterior a B17».
2. **Textos provisionales** marcados «Pendiente de concepto jurídico»; publicados solo en los datos
   de demostración.
3. **Encargado sin contrato:** se permite, con la alerta en rojo.
4. **Revocar** usa el permiso «Gestionar solicitudes de titulares».
5. **Una versión nueva no anula** las autorizaciones dadas: cada una conserva la versión que aceptó.
6. **Alcance:** hoy el formulario de personas en Terceros; los demás lo usarán al construirse.

Y estas, que tomé durante la construcción y le pido revisar:

7. **Cinco textos de autorización**, uno por tipo de titular (clientes, proveedores,
   colaboradores, candidatos y contactos), como pide el numeral 20.2 para FT-DG-003. El formulario
   deja elegir cuál conoció la persona.
8. **Quien registra la autorización en la ficha es quien edita terceros** (`party.update`), no el
   Oficial: la autorización la toma quien atiende al titular; el Oficial la consulta y la revoca.
9. **Privacidad no lee las tablas de Terceros:** le pide los nombres por una «puerta»
   (`PARTY_DIRECTORY`) que presta el módulo de terceros, igual que el núcleo le presta los cargos a
   identidad. Así no hay dependencia circular.
10. **La columna del contrato se llama `contract_file_id`** y no `contract_document_id` como en el
    manual, porque hoy guarda un archivo de B14 y no un documento controlado de B18.
11. **Una tabla más del manual:** `prv_activity_processors`, para unir actividades y encargados
    con llaves foráneas en vez de una lista suelta.
12. **Una autorización solo acepta finalidades que el texto ofrece** y una fecha que no sea futura.
