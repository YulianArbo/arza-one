# Cierre del bloque B13: Terceros

- Fecha: 10/10/2026
- Rama: `feat/b13-terceros`
- Estado: en revisión. No es un bloque crítico: basta la aprobación del Director General.

## Qué se construyó

Desde este bloque, ARZA ONE tiene **un solo registro de cada persona u organización** con la que
la empresa se relaciona: clientes, proveedores, colaboradores, contactos y candidatos. Usted aprobó
el plan con las opciones recomendadas; las decisiones están al final.

| Pieza                    | Qué hace, en palabras sencillas                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ficha del tercero        | Persona u organización con su documento, correo, teléfono, ciudad y dirección. Una sección nueva, **Terceros**, en el menú                                                                                            |
| Documento único          | **No se pueden registrar dos terceros con el mismo tipo y número de documento.** Si alguien lo intenta, la plataforma no lo crea y le muestra un enlace «Abrir» al que ya existe                                      |
| NIT con dígito           | El dígito de verificación se calcula como lo hace la DIAN. Si no coincide, la pantalla lo dice antes de enviar, y la base de datos tampoco lo aceptaría                                                               |
| Datos personales         | De cada **persona** se registra para qué se usarán sus datos y cómo autorizó (documento firmado, formulario, verbal con constancia o cláusula del contrato) con la fecha. Sin eso no se guarda                        |
| Papeles                  | Cliente, proveedor, colaborador, contacto y candidato, con fecha de inicio. Un papel que termina queda en el historial                                                                                                |
| Estados                  | Prospecto → activo → inactivo → bloqueado. Solo aparecen los botones de los cambios permitidos; **bloquear exige escribir el motivo**                                                                                 |
| Contactos y firmantes    | Las personas de contacto de cada organización, con su cargo, cuál es el principal (solo uno) y quiénes pueden firmar                                                                                                  |
| Cuentas bancarias        | El número se guarda **cifrado**; en pantalla solo se ven los cuatro últimos dígitos. Una persona la registra y **otra distinta la aprueba**. Ver el número completo pide su contraseña y código y queda registrado    |
| Conocimiento del tercero | Nivel de riesgo y resumen de lo revisado. Lo aprueba **Dirección**, nunca quien lo registró, y vale 12 meses. La ficha dice si el tercero está **apto**                                                               |
| Posibles duplicados      | Mientras usted escribe, la plataforma busca terceros con el mismo documento, correo, teléfono o nombre (aunque esté escrito distinto: «S.A.S.» y «SAS», con o sin tildes)                                             |
| Fusión de duplicados     | Se elige el duplicado, se comparan los dos lado a lado y, al confirmar, sus papeles, contactos, cuentas y conocimiento pasan al que se conserva. **El historial de ambos se sigue viendo** y la fusión queda auditada |
| Línea de tiempo          | Todo lo que ha pasado con el tercero, lo más reciente primero. **Solo muestra lo que su rol puede ver**: quien no ve cuentas bancarias tampoco ve sus movimientos                                                     |

**Tablas nuevas:** terceros, papeles, contactos, cuentas bancarias y conocimiento del tercero.
Todas separadas por empresa con la seguridad por fila. Diccionario en
[`pty.md`](../manual/datos/pty.md). **Listas nuevas** en Administración › Catálogos: «Bancos» (17
bancos colombianos) y «Finalidades del tratamiento» (7 finalidades); usted puede agregar o
inactivar opciones.

### Un arreglo de seguridad que encontré en el camino

Al probar el conocimiento del tercero, una prueba mostró que **una persona de Comercial podía
aprobarlo**, aunque el permiso de aprobar solo lo tiene Dirección. La causa estaba en el bloque
B10: la biblioteca que revisa los permisos trata la palabra «manage» (administrar) como «puede
hacer cualquier cosa» con ese recurso. Así, quien tenía permiso de _registrar_ el conocimiento
recibía también, sin querer, el de _aprobarlo_.

Lo corregí en la plataforma con una línea y su prueba (commit `099db93`). La misma falla habría
afectado más adelante a otros permisos del catálogo: aprobar gastos y presupuesto, publicar textos
legales, responder solicitudes de datos personales, cerrar novedades de nómina, entre otros. Hoy
ninguno de esos módulos existe, así que **nadie llegó a usar ese permiso de más**. Todas las
pruebas de permisos de los bloques anteriores siguen pasando con el arreglo.

## Cómo se probó

| Prueba              | Qué demuestra                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dígito del NIT      | Coincide con NIT publicados: DIAN 800197268-4, Bancolombia 890903938-8, Ecopetrol 899999068-1 y Davivienda 860034313-7; también en la base de datos |
| Documento repetido  | Responde «ya existe» y la búsqueda ofrece abrir el existente, también si el documento era de un duplicado ya fusionado                              |
| Duplicados          | Encuentra por correo, teléfono (con o sin +57) y nombre escrito distinto                                                                            |
| Cuentas cifradas    | En la base de datos el número no aparece legible; la lista solo trae `•••• 6789`; la auditoría nunca guarda el número                               |
| Doble aprobación    | Quien registró no puede aprobar (ni por la API ni escribiendo directo en la base); otra persona sí; la cuenta nueva reemplaza a la anterior         |
| Confirmar identidad | Con una sesión de más de 30 minutos, registrar o ver el número de una cuenta pide contraseña y código                                               |
| Conocimiento        | Dirección aprueba y la ficha queda apta 12 meses; quien lo registró no lo aprueba aunque tenga el permiso; Comercial no puede aprobar               |
| Fusión              | Pasa papeles, contactos y cuentas; el duplicado deja de verse; la línea de tiempo muestra la historia de los dos; deja el evento `party.merged`     |
| Estados             | Bloquear sin motivo no se permite; de activo no se vuelve a prospecto; si otra persona cambió el registro, avisa en vez de pisar el cambio          |
| Registro simultáneo | Tres registros a la vez del mismo documento: uno queda creado y los otros dos reciben «ya existe»                                                   |
| Pantallas           | 33 pruebas de pantalla y, en un navegador real, las pantallas de terceros sin fallas de accesibilidad en modo claro y oscuro                        |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** un colaborador, la persona de SST y un usuario del portal no ven terceros.
  Comercial no ve, registra ni aprueba cuentas bancarias. El contador ve las cuentas pero no
  registra ni fusiona. El equipo de proyecto solo ve los terceros que él registró.
- **Aislamiento:** la empresa B no ve ni toca los terceros de la empresa A (ficha, contactos,
  cuentas, conocimiento, línea de tiempo), no puede fusionarlos ni agregarlos como contactos, y
  puede registrar su propio tercero con el mismo NIT.
- **Auditoría:** las 16 rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una. La pantalla de Auditoría las muestra en español.

### Resultado de `pnpm check`

En verde el 10/10/2026, de principio a fin en una sola ejecución, con `pnpm dev` apagado:

| Paso                    | Resultado                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Formato, estilo y tipos | Sin problemas en las 12 partes del proyecto                                          |
| Fronteras entre módulos | Sin problemas: terceros usa el núcleo, la identidad y la auditoría por su `index.ts` |
| Código sin usar (knip)  | Sin problemas                                                                        |
| Pruebas unitarias       | API 235, web 226, contratos 63, worker 35, interfaz 19, guiones 140                  |
| Pruebas de integración  | API 415 en 43 archivos (47 nuevas de terceros), worker 15                            |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la web: 85,6 %, mínimo 85 %)     |
| Pruebas en navegador    | 123, incluidas 14 nuevas de terceros en modo claro y oscuro                          |
| Búsqueda de secretos    | Ninguno                                                                              |
| Migraciones             | Desde cero y repetidas sin cambios; la base coincide con el modelo                   |

**Tres cosas que debe saber de esta verificación:**

1. **Memoria del equipo.** El analizador de estilo (ESLint) revisa todo el proyecto de una vez y se
   quedó sin memoria con su límite normal de 2 GB: el equipo tenía alrededor de 1 GB libre. Lo corrí
   con `NODE_OPTIONS=--max-old-space-size=4096`, solo en esa ejecución; no cambié ninguna regla ni
   archivo. En GitHub (con más memoria) no debería hacer falta. Si en su equipo vuelve a pasar, use
   esa misma variable.
2. **Prueba de arranque de la API** (`startup.test.ts`). En una de las corridas falló, como ya se
   había visto en B11 con el equipo cargado; sola pasa, y pasó en la corrida final. No la cambié.
3. **Pruebas de accesibilidad de terceros en navegador.** Con el servidor de pruebas recién
   encendido, abrir una pantalla y revisar su accesibilidad tardaba hasta 40 segundos, por encima
   del límite de 30. Les di más tiempo (`test.slow()`), pero **las comprobaciones son
   exactamente las mismas**. Es una decisión suya si prefiere otra salida (ver «Decisiones»).

## Cómo lo prueba usted, paso a paso

Usted ya tiene `pnpm dev` corriendo en una terminal. Si no, enciéndalo como en el cierre de B11
(pasos 1 y 2).

Para probar la doble aprobación necesita **tres cuentas**: Ana (ADMIN_PLATAFORMA, del cierre
anterior) y dos personas más. En el paso 1 le explico cómo darles los roles.

### 1. Cargar los datos nuevos y preparar las cuentas

En **otra** terminal, en la carpeta del proyecto:

```bash
git switch feat/b13-terceros
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La segunda crea las tablas nuevas; la tercera carga las listas de bancos y finalidades y, en las
empresas de demostración, cinco terceros ficticios. Si `pnpm dev` estaba encendido, deténgalo con
Ctrl + C y vuelva a escribir `pnpm dev`.

Luego, con Ana, en **Administración › Usuarios**, invite a dos personas más (por ejemplo «Finanzas
Uno» y «Finanzas Dos»), active sus cuentas desde el correo de Mailpit (http://localhost:8025) y
asígneles a las dos el rol **ADMIN_FINANCIERO**. A Ana asígnele además el rol **DIRECCION**. Ana
no puede darse roles a sí misma desde la pantalla; use este comando con el correo de Ana:

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol DIRECCION
```

### 2. Ver y registrar terceros

1. Entre en http://localhost:3000 con Finanzas Uno. En el menú aparece **Terceros**.
2. Verá cinco terceros. Busque «andina»: salen dos fichas de la misma empresa escritas distinto.
3. Pulse «Registrar un tercero». Escriba razón social «Prueba S.A.S.», NIT `800197268` y dígito
   `5`. Pulse «Guardar»: la pantalla dice que **el dígito no corresponde**. Cámbielo a `4` y
   guarde: se abre la ficha nueva.
4. Vuelva a «Registrar un tercero» y escriba otra vez el NIT `800197268`. Al salir del campo
   aparece «Puede que este tercero ya exista» con el enlace **Abrir**. Si guarda igual, la
   plataforma no lo crea.
5. Registre una **persona**: elija «Persona» en «Tipo de tercero». Fíjese que pide la finalidad,
   la autorización y su fecha; sin ellas no guarda.

### 3. Estados, papeles y contactos

1. Abra «Papelería El Cóndor Ltda.». Arriba ve su estado y «Sin conocimiento del tercero».
2. Pulse «Bloquear»: pide el motivo. Escríbalo y confirme. Ahora el botón dice «Desbloquear».
3. En **Resumen › Papeles**, agregue «Cliente» y termine «Proveedor».
4. En **Contactos** está Andrés Pérez como principal y firmante. Pulse «Agregar un contacto»,
   busque «Laura» y agréguela como principal: Andrés deja de serlo.

### 4. Cuentas bancarias con doble aprobación

1. Con Finanzas Uno, en la ficha de «Comercializadora Andina S.A.S.», abra **Cuentas bancarias** y
   pulse «Registrar una cuenta». Elija un banco y escriba un número inventado. Le pedirá su
   contraseña y código. La cuenta queda «Pendiente de aprobación» y solo se ven sus cuatro últimos
   dígitos.
2. Fíjese que **a usted no le aparece «Aprobar»**: dice «Usted lo registró: lo revisa otra
   persona».
3. Salga y entre con Finanzas Dos. En la misma cuenta pulse «Aprobar» y confirme.
4. Pulse «Ver número completo»: le pide confirmar su identidad y muestra el número.
5. Con Ana, vaya a **Auditoría**: verá «Registró una cuenta bancaria», «Aprobó una cuenta
   bancaria» y «Consultó el número completo de una cuenta», sin el número.

### 5. Conocimiento del tercero (criterio «no se contrata sin él»)

1. Con Finanzas Uno, en la ficha de Andina, abra **Conocimiento** y pulse «Registrar el
   conocimiento». Elija el riesgo y escriba qué revisó.
2. Entre con Ana (Dirección) y apruébelo. Arriba la ficha dice **«Apto: conocimiento aprobado»**
   y la próxima revisión queda dentro de 12 meses.

### 6. Fusión de duplicados y línea de tiempo (criterios de la ficha 17.3)

1. Abra «Comercializadora Andina S.A.S.» y pulse «Fusionar un duplicado». Aparece
   «COMERCIALIZADORA ANDINA SAS» con «mismo correo, mismo nombre».
2. Elíjala: verá los dos registros lado a lado. Pulse «Fusionar» y confirme.
3. Vuelva a **Terceros** y busque «andina»: queda una sola.
4. En la ficha, abra **Línea de tiempo**: arriba está «Fusionó un tercero duplicado» y más abajo
   aparecen **los dos** «Registró un tercero»: el historial de ambos se conservó.
5. Entre con una cuenta que solo tenga **COMERCIAL**: en la misma línea de tiempo no aparecen los
   movimientos de cuentas bancarias, ni la pestaña Cuentas bancarias.

### 7. Quien no tiene permiso

Entre con una cuenta que solo tenga el rol COLABORADOR. En el menú no aparece Terceros. Si escribe
la dirección `/app/terceros`, ve «No tiene acceso a esta sección».

## Pendientes

- **Impedir facturar o contratar sin el conocimiento aprobado:** la barrera se pone en Contratos
  (B24) y Finanzas (B31), que leerán el estado «apto» de la ficha. Hoy la ficha lo muestra.
- **Formato FT-FIN-007 completo:** hoy el conocimiento es la versión mínima (riesgo, resumen y
  fecha). Se conecta al formato completo cuando existan los formularios dinámicos; me puede enviar
  el formato para preparar sus campos.
- **Certificado bancario adjunto a la cuenta:** necesita el almacenamiento de archivos (B14).
- **Autorizaciones de datos en el módulo de privacidad (M18):** la finalidad y la autorización que
  se registran hoy pasarán a la tabla de consentimientos cuando llegue ese módulo.
- **Reasignar al fusionar:** la fusión deja el aviso `party.merged`; cuando Comercial, Contratos y
  Finanzas guarden terceros, cada uno lo escuchará para reasignar sus registros. Hoy ningún módulo
  guarda terceros todavía.
- **Equipo de proyecto:** por ahora ve solo los terceros que registró; con Proyectos (B26) verá
  los clientes de sus proyectos.
- **Exportar el listado a Excel:** quedó fuera, como dijimos en el plan.
- **NIT de la empresa en Administración › Empresa:** ese formulario (de B12) revisa el formato del
  NIT pero no su dígito. Es un cambio pequeño que se puede hacer en otro momento.

## Decisiones tomadas

1. **Finalidad y autorización desde ya** (opción A): obligatorias en personas; las organizaciones
   no las llevan.
2. **Conocimiento del tercero mínimo** (opción A): riesgo bajo, medio o alto, resumen y próxima
   revisión a 12 meses si quien aprueba no indica otra fecha. La fecha debe ser posterior a hoy.
3. **Aprueba Dirección**, nunca quien lo registró. La base de datos también lo impide.
4. **Fusionan** quienes crean terceros: Comercial, Servicio, Finanzas y Talento humano.
5. **Equipo de proyecto:** solo los terceros que registró, hasta B26.
6. **Una cuenta aprobada no se edita:** para cambiarla se registra otra que la reemplaza al
   aprobarse. Así nadie cambia en silencio a dónde se paga.
7. **Registrar, aprobar, rechazar y ver el número de una cuenta** piden confirmar la identidad
   (contraseña y código de los últimos 30 minutos), por ser un dato restringido (numeral 12.4).
8. **El documento no se repite ni con un duplicado fusionado:** el fusionado conserva su documento
   y quien lo busque llega al tercero que se conservó.
9. **Evento `party.merged`** en la bandeja de salida, para que los módulos futuros reasignen sus
   registros.
10. **Listas de bancos y finalidades** como catálogos administrables, no como listas fijas.
11. **Arreglo del permiso «manage»** en la plataforma (ver arriba): estaba fuera del alcance del
    bloque, pero sin él la regla «solo Dirección aprueba» no se cumplía.
12. **Más tiempo para las pruebas de accesibilidad en navegador** de terceros (90 segundos en vez
    de 30), sin quitar ninguna comprobación. La otra salida sería tener menos pruebas a la vez en el
    navegador para todo el proyecto, lo que hace más lenta cada verificación. Si la prefiere, me lo
    dice.

## Commits

| Commit    | Qué hizo                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `71fa8d4` | Contratos de terceros y el cálculo del dígito de verificación del NIT                                            |
| `6cb7516` | Tablas nuevas con seguridad por fila, reglas de doble aprobación y listas de bancos y finalidades                |
| `099db93` | Arreglo del permiso «manage» que concedía de más                                                                 |
| `3e3b195` | API de terceros: ficha, duplicados, estados, papeles, contactos, cuentas, conocimiento, fusión y línea de tiempo |
| `1d8e662` | Pruebas de permiso, aislamiento, auditoría y reglas de terceros                                                  |
| `37456df` | Terceros ficticios para los datos de demostración                                                                |
| `3ec3716` | Pantallas de terceros                                                                                            |
| `89fe310` | Pruebas de las pantallas en navegador real                                                                       |
| `4b8ed2f` | Dos registros simultáneos del mismo documento responden «ya existe»                                              |
| `6ab9cdd` | Diccionario de datos, README y OpenAPI                                                                           |
| `251ecf9` | Funciones y datos de prueba que solo usa su archivo quedan privados                                              |
| `c5aa222` | Más tiempo para las pruebas de accesibilidad con el servidor en frío                                             |
| (este)    | Cierre del bloque                                                                                                |
