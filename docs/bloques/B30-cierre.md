# Cierre del bloque B30: Portal del cliente

- Fecha: 07/11/2026
- Rama: `feat/b30-portal-del-cliente` (sale de la rama del B29, que aún no está unida a `main`)
- Estado: en revisión. **Es un bloque crítico: requiere revisión externa** antes de unirlo.

> **Nota de estado — 10/11/2026.** El estado oficial en `docs/bloques/README.md` se corrigió a
> «En revisión». Este cierre sigue condicionado: el criterio «el cliente descarga la factura y el
> soporte fiscal» depende del B31, que está en construcción, y la cadena completa de `pnpm check`
> todavía no se ha ejecutado en una sola corrida. Las guardas de aislamiento y auditoría que el B31
> dejó desalineadas se actualizaron en los archivos de prueba, incluidas las rutas de facturas del
> portal y las seis rutas de escritura de Finanzas del B31; no se modificó el código del B31.

## Qué se construyó

El **portal del cliente** (ficha 17.10) ya funciona. Cada persona de un cliente entra con su
cuenta en **/portal** y ve **solo lo de su empresa**: el avance de sus proyectos, lo que espera su
aprobación o su firma, sus contratos, sus documentos, su soporte y sus datos. El administrador del
cliente además gestiona a las personas de su empresa. Usted aprobó el plan con las nueve
decisiones; están al final.

| Pieza                        | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Términos del primer ingreso  | La primera vez que entra, y cada vez que se publique una versión nueva, el portal muestra los **Términos de uso del portal** y la **Política de tratamiento de datos** y pide aceptarlos. Queda guardado quién aceptó qué versión, cuándo y desde dónde. Sin términos publicados, el portal dice que aún no está disponible |
| Inicio                       | «Bienvenido, [empresa]»: cuántos proyectos tiene, cuántas actas esperan su aprobación, cuántos documentos esperan su firma, cuántas solicitudes esperan su respuesta y los próximos hitos                                                                                                                                   |
| Proyectos                    | Los proyectos de su empresa **ya iniciados** y no ocultos por el líder: estado, **avance** (tareas terminadas sobre planeadas, el mismo número que ve el equipo), hitos y entregables con el estado de su acta. **Nunca** horas, dinero, riesgos ni notas del equipo                                                        |
| Por aprobar                  | Las **actas de entrega** que esperan su respuesta. «Revisar y firmar» abre la **misma pantalla de firma de siempre**, que pide el código que llega a su correo. Ahí puede aceptar (firmar) o devolver el entregable                                                                                                         |
| Contratos y firmas           | Los contratos y otrosíes que esperan su firma, y sus contratos **desde que se envían a firma** (nunca borradores), con «Descargar firmado»                                                                                                                                                                                  |
| Facturas                     | Dice «Disponible pronto»: la facturación llega con el bloque B31                                                                                                                                                                                                                                                            |
| Soporte                      | «Pedir soporte» (asunto, qué pasa, tipo, urgencia y, si quiere, el proyecto); sus solicitudes con la conversación **pública** con el equipo (nunca las notas internas) y su respuesta. «Radicar PQRSF» con el radicado y la fecha límite en pantalla. Artículos de ayuda para clientes                                      |
| Documentos                   | Contratos, otrosíes y actas **firmados**, más los archivos que el equipo **comparta a propósito**. Cada descarga queda registrada                                                                                                                                                                                           |
| Usuarios (administrador)     | Invitar a personas de su empresa (administrador o usuario), cambiar el rol, desactivar (cierra sus sesiones) y elegir **qué proyectos ve cada usuario**. Nadie se cambia a sí mismo                                                                                                                                         |
| Mis datos                    | Lo que la plataforma guarda de usted, corregir su nombre y **descargar una copia** de sus datos                                                                                                                                                                                                                             |
| Ficha del proyecto (interno) | Pestaña nueva **«Portal del cliente»**: el líder ve si el proyecto se muestra en el portal, puede **ocultarlo** o mostrarlo, y **comparte archivos** con el cliente (o deja de compartirlos; el archivo no se borra)                                                                                                        |
| En el celular                | Todo el portal está diseñado primero para celular: se probó a 390 px de ancho, sin desbordes                                                                                                                                                                                                                                |

Quién ve qué:

- **Administrador del cliente**: todo lo de su empresa. Debe usar segundo factor (como ya exigía el
  B10).
- **Usuario del cliente**: solo los proyectos que su administrador le asigne, los tiquetes que él
  mismo pidió, sus PQRSF y sus datos. No ve contratos, firmas, facturas ni usuarios.
- **Personas internas**: no entran al portal; las del portal no entran a la aplicación interna.

## Cómo se probó

### Los criterios del bloque

| Criterio                                                                                  | Cómo se comprobó                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un usuario de un cliente no obtiene datos de otro cliente por ninguna dirección de la API | `portal-isolation.int.test.ts`: el cliente A tiene de todo (proyecto, contrato firmado, acta en firma, archivo compartido, tiquete). El administrador del cliente B, y uno de otra empresa, prueban **todas** las direcciones del portal con los identificadores de A: todas responden «no existe» y ninguna lista trae nada de A. La prueba **falla si alguien agrega una dirección al portal sin cubrirla** |
| Solo ve registros de su organización marcados como visibles                               | Proyecto oculto por el líder o todavía en planeación: no aparece. Contratos en borrador: no aparecen                                                                                                                                                                                                                                                                                                          |
| Los comentarios internos nunca se muestran                                                | Prueba con una nota interna y un mensaje público: el portal solo muestra el público                                                                                                                                                                                                                                                                                                                           |
| El administrador gestiona sus usuarios, no otras organizaciones                           | Invitar un correo de otra empresa o de una persona interna: rechazado. Cambiar a un usuario de otra empresa: «no existe». Cambiarse a sí mismo: rechazado                                                                                                                                                                                                                                                     |
| El primer ingreso exige aceptar los términos vigentes                                     | Sin aceptar: todo el portal responde «acepte los términos». Si cambian mientras lee: le pide verlos de nuevo. Sin términos publicados: «no disponible»                                                                                                                                                                                                                                                        |
| El cliente descarga la factura y el soporte fiscal                                        | **Pendiente para el B31** (decisión 1): la sección dice «Disponible pronto»                                                                                                                                                                                                                                                                                                                                   |
| Plenamente usable en un celular                                                           | Prueba en navegador de las 11 secciones a 390 px: sin desbordes                                                                                                                                                                                                                                                                                                                                               |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado** (`portal-access.int.test.ts`): una persona interna no entra al portal; una
  del portal no entra a proyectos, tiquetes, contratos ni terceros internos; una cuenta sin
  empresa cliente no ve nada; el usuario del cliente no ve usuarios, contratos ni firmas y solo ve
  los proyectos que se le asignan; un colaborador del equipo no puede compartir archivos.
- **Firmar** (`portal-work.int.test.ts`): solo quien le toca, con el correo de su cuenta, recibe el
  enlace; otro administrador del mismo cliente no. Se firmó el acta de punta a punta con el enlace
  del portal y el código del correo, y el enlace anterior del correo dejó de servir.
- **Aislamiento entre empresas**: además de la prueba anterior, una persona del portal de otra
  empresa de la plataforma no obtiene nada.
- **Auditoría**: el recorrido de escrituras (`write-routes-audited.int.test.ts`) comprueba que
  **cada** dirección nueva que escribe deja su evento (16 direcciones nuevas). Quedan registradas:
  la aceptación de términos, el enlace de firma, cada descarga, los tiquetes y respuestas, las PQRSF,
  las invitaciones, los cambios de rol y de estado, los proyectos asignados, el cambio de nombre, la
  copia de datos, y del lado interno ocultar el proyecto y compartir o dejar de compartir.

### Resultado de las verificaciones

`pnpm check` corre todas las verificaciones en cadena. En este equipo (7,6 GB de memoria) la cadena
completa no cabe de una sola vez, como pasó en el B29, así que se corrió por partes, sin quitar ni
debilitar ninguna prueba ni ningún control:

| Verificación                          | Resultado                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato (`format:check`)              | En verde para todo el repositorio. Solo se queja de la carpeta local `.agents/`, que no es del repositorio (herramientas de este equipo; igual que en el B29)                                                                                                                                                                                             |
| Estilo, tipos y límites entre módulos | En verde (`lint`, `typecheck`, `boundaries`)                                                                                                                                                                                                                                                                                                              |
| Código sin usar (`unused`)            | En verde (se quitaron 15 nombres exportados que nadie usaba)                                                                                                                                                                                                                                                                                              |
| Pruebas unitarias de la API           | 406 de 406                                                                                                                                                                                                                                                                                                                                                |
| Pruebas unitarias de la web           | 705 de 705. Cobertura de ramas 85,62 % (mínimo 85 %); las pantallas del portal, 94,5 %                                                                                                                                                                                                                                                                    |
| Pruebas contra la base de datos       | Todas en verde, corridas por módulo: identidad, auditoría (recorrido de 297 rutas), núcleo, terceros, documentos, flujos, avisos, privacidad, CRM, contratos, proyectos, servicio, **portal (21)** y las generales. Algunos archivos fallaron por tiempo al correr juntos («no se pudo iniciar una transacción a tiempo»): todos pasan al correrlos solos |
| Compilación (`build`)                 | En verde                                                                                                                                                                                                                                                                                                                                                  |
| Pruebas en el navegador (`test:e2e`)  | 336 de 336, incluidas las **37 del portal** (11 secciones en claro y oscuro sin violaciones de accesibilidad, términos del primer ingreso y 390 px)                                                                                                                                                                                                       |
| Búsqueda de secretos (`secrets`)      | Sin hallazgos                                                                                                                                                                                                                                                                                                                                             |

Durante las verificaciones aparecieron y se corrigieron: un paso del recorrido de auditoría que no
contaba con el borrador de la política de privacidad que deja otro paso, y dos pruebas antiguas del
B22A que esperaban el portal anterior («Disponible pronto» y seis pestañas fijas).

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Los correos no salen a internet: llegan al buzón de prueba **Mailpit**,
que se abre en **http://localhost:8026**. Para el portal necesita un cliente con un **proyecto en
ejecución** y un **firmante autorizado** con correo (como el que usó al probar el B27: contrato
firmado → proyecto → entregable).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b30-portal-del-cliente
```

```bash
pnpm infra:up
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

> Si `pnpm infra:up` termina con «Falló pnpm db:seed:demo» y más arriba dice «violates check
> constraint» (o si `pnpm db:migrate` dice que una migración «fue modificada»), su base de datos
> local quedó con un borrador anterior de una migración que cambié mientras construía. Escriba
> `pnpm infra:reset` y repita los pasos: borra solo los datos de prueba locales, no los reales.

### 2. Publicar los términos del portal

1. Entre a la aplicación interna (http://localhost:3000/app) con una persona que tenga el rol
   **«Oficial de protección de datos»**.
2. Vaya a **Privacidad → Avisos y versiones**. Verá dos borradores que dicen «PENDIENTE DE CONCEPTO
   JURÍDICO»: **Términos de uso del portal** y **Política de tratamiento de datos personales**.
3. Publique los dos (para la prueba puede dejar el texto provisional).

### 3. Invitar al administrador del cliente

1. Con una persona administradora, vaya a **Administración → Usuarios → Invitar a una persona**.
2. Elija **Portal del cliente**, busque y elija la **empresa cliente** del proyecto, use como correo
   **el mismo del firmante autorizado** de ese cliente y el rol **Administrador del cliente**.
3. En Mailpit abra la invitación, cree la contraseña y configure el segundo factor con la
   aplicación de su celular (el administrador del cliente lo exige).

### 4. Primer ingreso

1. Entre con esa cuenta en http://localhost:3000/iniciar-sesion. Lo lleva al portal.
2. Antes de nada le pide **aceptar los términos**. Pulse «Aceptar y continuar» sin marcar la
   casilla: le dice que la marque. Márquela y continúe.
3. Debe ver «Bienvenido, [nombre del cliente]» y su resumen.

### 5. Proyectos y aprobación

1. En la aplicación interna, como líder del proyecto, entregue un entregable al cliente (como en el
   B27). En la ficha del proyecto abra la pestaña **«Portal del cliente»**: dice que el cliente lo ve.
2. En el portal, en **Proyectos**, abra el proyecto: verá el avance, los hitos y el entregable «en
   firma del cliente». Revise que **no** aparezcan horas, dinero ni nombres del equipo.
3. Vaya a **Por aprobar** y pulse **«Revisar y firmar»**: se abre la pantalla de firma. Pida el
   código, búsquelo en Mailpit, escríbalo y firme. Vuelva al portal: el acta ya no está pendiente.
4. En la aplicación interna pulse **«Ocultar en el portal»** en la pestaña del proyecto. En el
   portal, el proyecto desaparece. Vuelva a mostrarlo.

### 6. Documentos

1. En la aplicación interna suba un PDF en **Archivos** y, en la pestaña «Portal del cliente» del
   proyecto, pulse **«Compartir un archivo»**, elíjalo y póngale un nombre.
2. En el portal, en **Documentos**, aparece junto al contrato firmado. Descárguelo.

### 7. Soporte

1. En el portal, **Soporte → Pedir soporte**: escriba un asunto y qué pasa, y envíe. Se abre la
   solicitud.
2. En la aplicación interna, como Servicio al cliente, ábrala en la bandeja: el canal dice «Portal
   del cliente». Escriba una **nota interna** y un **mensaje al cliente**, y póngala en espera del
   cliente.
3. En el portal: ve el mensaje al cliente y el aviso «espera su respuesta», pero **no** la nota
   interna. Responda: en la aplicación interna el tiquete vuelve a «en curso».
4. **Radicar PQRSF**: verá el radicado y la fecha límite, y en Mailpit el acuse.

### 8. Usuarios y datos

1. En **Usuarios**, invite a otra persona como **Usuario**. Al entrar, esa persona no ve proyectos
   hasta que usted, en Usuarios, le marque el proyecto y pulse «Guardar proyectos». Tampoco ve
   «Contratos y firmas» ni «Usuarios».
2. Pulse **«Desactivar»** sobre ella: se cierra su sesión. Note que sobre su propia cuenta no hay
   botones.
3. En **Mis datos** corrija su nombre y pulse **«Descargar mis datos»**: baja un archivo con lo que
   la plataforma guarda de usted, sin contraseñas ni códigos.

### 9. En el celular

Abra el portal en el celular (o achique la ventana del navegador): las pestañas se deslizan y nada
se sale de la pantalla.

## Pendientes

- **Facturas y estado de cuenta (B31)**: la sección dice «Disponible pronto». El criterio «el
  cliente descarga la factura y el soporte fiscal» se cumple cuando exista la facturación. El
  permiso «Ver y descargar facturas» ya existe para el administrador del cliente.
- **Correos al cliente cuando hay novedades** (respuesta a su tiquete, documento nuevo): llegan con
  los bloques del sitio público y la privacidad (B41 y B42). Hoy las novedades se ven al entrar.
- **Textos legales definitivos**: los términos de uso del portal y la política son borradores
  provisionales; el asesor jurídico debe aprobar los definitivos antes de producción (anotado en
  `docs/runbooks/servidor-de-pruebas.md`).
- **Firma con certificado (nivel 3)**: sigue para la fase 8.
- **Revisión externa**: este bloque es crítico; antes de unirlo debe revisarlo alguien de afuera,
  en especial el aislamiento entre clientes.
- Las verificaciones automáticas en GitHub dependen del runner propio, que sigue pendiente (como en
  los bloques B27 a B29).

## Decisiones aprobadas (07/11/2026)

1. **Facturas**: «Disponible pronto» hasta el B31; su criterio queda para ese bloque.
2. **Proyectos visibles**: los iniciados que el líder no ocultó; la casilla viene marcada.
3. **Usuario del cliente**: los proyectos que su administrador le asigne y los tiquetes que él pidió;
   el administrador ve todo lo de su empresa.
4. **Firmar desde el portal**: enlace nuevo de un solo uso a la pantalla de firma de siempre, con el
   código del correo; el enlace anterior deja de servir.
5. **Documentos**: contratos y actas firmados más lo que el equipo comparta a propósito.
6. **Contratos**: desde que se envían a firma; nunca borradores.
7. **Respuesta del cliente**: si el tiquete esperaba al cliente, el reloj vuelve a correr.
8. **Términos de uso**: texto nuevo y editable «Términos de uso del portal», con borrador
   provisional; sin términos publicados el portal no deja entrar.
9. **Fuera del bloque**: facturas (B31), correos al cliente (B41/B42), firma con certificado (F8).

## Decisiones tomadas durante la construcción

- **El portal no tiene tablas propias.** Las tres tablas nuevas pertenecen a los módulos dueños del
  dato: `iam_terms_acceptances` (Identidad), `prj_client_access` y `prj_shared_files` (Proyectos),
  más la columna `portal_visible` en los proyectos. El módulo del portal solo usa lo que cada módulo
  ofrece por su índice, como manda la arquitectura.
- **Firmar desde el portal exige ser quien le toca firmar**: el correo de la cuenta del portal debe
  ser el del firmante autorizado del cliente, y su rol debe permitir esa clase de documento (el
  usuario del cliente no firma desde el portal; puede hacerlo con el enlace del correo). Por eso, en
  la prueba, el administrador del cliente se invita con el correo del firmante.
- **El enlace de firma del portal no agrega un eslabón a la cadena de evidencias de la firma**: queda
  en la auditoría (`signature.link.issue`, vía portal); la cadena registra igual la apertura, el
  código y la firma. Así no cambia la evidencia legal del B25.
- **Las PQRSF que ve cada persona son las que ella radicó** (con su correo), también para el
  administrador del cliente, porque pueden contener datos personales.
- **La copia de datos se descarga en un archivo JSON** (texto ordenado que cualquier programa abre).
  Para corregir el correo o pedir que borremos sus datos, el portal indica radicar una PQRSF de datos
  personales, que ya sigue el plazo de la Ley 1581.
- **Al desactivar un usuario se cierran todas sus sesiones** de inmediato; al reactivarlo vuelve
  como estaba (activo, o invitado si nunca entró).
- **Pestañas por rol**: cada persona ve solo las secciones que su rol permite. La prueba de las
  pestañas del B22A (que contaba seis fijas) se actualizó para comprobar esto, incluido que el
  usuario del cliente no ve las de administrador.
- **Lineamientos visuales del B22A**: se cumplen (componentes de `@arza/ui`, tokens, una sola acción
  principal por pantalla, tarjetas que se abren con `hover-invert`, estados de cargando, vacío y
  error, revisión de accesibilidad en claro y oscuro y prueba a 390 px). Sin excepciones.
