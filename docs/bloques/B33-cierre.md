# Cierre del bloque B33: Compras, proveedores y viajes

- Fecha: 12/11/2026
- Rama: `feat/b33-compras-proveedores-y-viajes` (sale de la rama del B32, que aún no está unida a
  `main`; el pull request se apila sobre el del B32)
- Estado: en revisión. No es un bloque crítico: basta con la aprobación del Director General.
- Pendiente principal: confirmar `pnpm check` completo en la integración continua del pull request
  (en este equipo la suite completa de integración no cierra de una sola vez, igual que en B31 y B32).

## Qué se construyó

La **primera parte de Compras y activos (M11)**: solicitudes de compra con aprobación por montos,
cotizaciones y cuadro comparativo, órdenes, recepciones, evaluación de proveedores y viajes con su
legalización. Los **activos** son el bloque B34.

| Pieza                     | Qué hace, en palabras sencillas                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solicitud de compra       | Cualquier colaborador pide una compra (centro de costo, descripción y valor estimado), la deja en borrador y la envía a aprobación. Solo ve las suyas.                                                                                                                        |
| Aprobación por montos     | El valor cae en un tramo. Los tramos bajo y medio los aprueba Administrativo y financiero (o la Dirección); el **tramo alto solo la Dirección**. **Quien pide no aprueba.** Se puede rechazar con motivo.                                                                     |
| Cuadro comparativo        | Sobre una solicitud aprobada se cargan las cotizaciones de los proveedores (valor, días de entrega y archivo) y se elige una. **No deja elegir si faltan las cotizaciones que exige el tramo.** Si la elegida vale más y sube de tramo, la solicitud **vuelve a aprobación**. |
| Orden de compra           | Se emite al proveedor elegido con código `OC-AAAA-NNNN`. **No se emite si el proveedor no tiene conocimiento del tercero vigente.**                                                                                                                                           |
| Recepción y cierre        | Otra persona distinta de quien pidió la compra registra si llegó conforme. Si no, queda la novedad escrita y la orden sigue abierta. Recibida conforme, se cierra.                                                                                                            |
| Evaluación de proveedores | Selección o reevaluación por periodo (año o semestre): cuatro calificaciones de 1 a 5 y un resultado automático (aprobado, condicionado o no aprobado).                                                                                                                       |
| Viajes y legalizaciones   | El viajero pide el viaje con su anticipo; otra persona lo aprueba o rechaza. Desde el día de salida registra cada gasto con su soporte y lo legaliza. La pantalla dice si debe devolver dinero o si se le debe.                                                               |
| Topes de compras          | Parámetro nuevo en Administración → Parámetros: los dos topes y cuántas cotizaciones exige cada tramo. Cada cambio queda con su fecha de vigencia y su historial.                                                                                                             |
| Pantallas                 | Menú **Compras** → Solicitudes de compra, Cuadro comparativo, Órdenes de compra, Recepciones, Evaluación de proveedores y Viajes y legalizaciones. Activos aparece como «disponible pronto».                                                                                  |

Tablas nuevas: `pur_requests`, `pur_quotes`, `pur_orders`, `pur_receipts`,
`pur_supplier_evaluations`, `pur_travel_requests` y `pur_travel_expenses` (migración
`20261113000000_pur_requests_orders_evaluations_travel`). Detalle en `docs/manual/datos/pur.md`.

## Decisiones tomadas (aprobadas por usted el 12/11/2026)

1. **Rama apilada** sobre la del B32.
2. **Topes de ejemplo**, pendientes de validar: hasta $ 1.000.000, una cotización; hasta
   $ 10.000.000, dos; por encima, tres y aprueba la Dirección. Se cambian desde Parámetros.
3. **Aprobación directa** en el módulo, sin el motor de flujos; no aparece en «Mis tareas».
4. **Orden de estados del manual**: las cotizaciones se cargan después de aprobar.
5. **Manda el valor de la cotización elegida**: si sube de tramo, vuelve a aprobación.
6. **Evaluación con cuatro criterios** (calidad, cumplimiento, precio y servicio), cortes en 4 y 3.
   Un «no aprobado» no bloquea órdenes.
7. **Viajes sin movimientos en Finanzas**: el saldo solo se informa.
8. **Permiso nuevo de lectura** «Ver compras, proveedores y viajes» para Dirección, Calidad,
   Administrativo y financiero, Contador y Auditor.
9. **Orden sin PDF** por ahora: queda con su código.

Decisiones adicionales que tomé y debe conocer:

- **Un permiso más, no previsto en el plan**: «Aprobar compras del tramo alto»
  (`purchase.request.approve_high`), solo para la Dirección. Era la forma limpia de cumplir la
  decisión 2 sin escribir el nombre del rol en el código.
- Las **cotizaciones las carga y las elige quien emite órdenes** (Administrativo y financiero), no
  el solicitante.
- La **cotización lleva archivo obligatorio** y hay **una por proveedor** en cada solicitud.
- **Solo el autor** edita y envía su solicitud o su viaje, y solo en borrador. Una solicitud
  rechazada no se reabre: se hace una nueva.
- La recepción no admite **fecha futura ni anterior a la orden**. Una orden admite varias
  novedades (no conformes) y una sola recepción conforme.
- El viaje se legaliza **desde el día de salida** y con **al menos un gasto**. La legalización no
  pasa por una segunda aprobación.
- Las rutas de la API usan el estilo que ya tenía Finanzas (`…/approval`), no el `actions/approve`
  que nombra el capítulo 14.
- La base de datos también impide que quien solicita apruebe (respaldo por si el código fallara).

## Criterios de aceptación

| Criterio                                                                      | Estado                                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Una compra por encima del tope sin las cotizaciones exigidas no puede avanzar | Cumplido y probado: la API responde «exige 2 cotizaciones y tiene 1» y tampoco deja emitir la orden      |
| Quien solicita no aprueba ni recibe                                           | Cumplido y probado en la API y, para la aprobación, también en la base de datos                          |
| No se ordena a un proveedor sin conocimiento del tercero vigente              | Cumplido y probado                                                                                       |
| El retiro de un colaborador lista los activos por devolver                    | No aplica a este bloque: es del B34 (activos) y de Talento humano                                        |
| El libro de activos coincide con RE-ADM-003                                   | No aplica a este bloque: es del B34                                                                      |
| `pnpm check` en verde                                                         | **Pendiente** de la integración continua del pull request (ver abajo)                                    |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría           | Cumplido                                                                                                 |
| Documentación y cierre del bloque escritos                                    | Cumplido (este documento, `docs/manual/datos/pur.md`, `permisos-por-rol.md`, README de la API y OpenAPI) |

## Cómo se probó

| Verificación                                                                                                                                   | Resultado                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos (`packages/contracts`: topes, cotización, recepción, evaluación, viajes y matriz de roles)                                           | 206 de 206 (9 nuevas de Compras) y documento de permisos por rol al día                                                                                                                        |
| Reglas sin base de datos (`purchase/domain`: quién aprueba, elección de cotización, fecha de recepción)                                        | 6 de 6                                                                                                                                                                                         |
| Integración de Compras (`test/int/purchase`)                                                                                                   | 12 de 12: recorrido completo de compra, tope sin cotizaciones, tramo alto, vuelta a aprobación, proveedor sin verificar, segregación, evaluación, viaje y legalización, permisos y aislamiento |
| Recorrido de auditoría de toda ruta que escribe, migraciones desde cero, semilla, permisos de base de datos, columnas de control y aislamiento | 383 de 383 (incluye las 19 rutas nuevas que escriben)                                                                                                                                          |
| OpenAPI (`apps/api/openapi.json` y lista de rutas)                                                                                             | 4 de 4                                                                                                                                                                                         |
| Pantallas de Compras y parámetro de topes (web)                                                                                                | 27 de 27                                                                                                                                                                                       |
| Pantallas en el navegador con accesibilidad, modo claro y oscuro (`e2e/purchases.spec.ts`)                                                     | 18 de 18 (las siete pantallas y sus formularios, sin violaciones WCAG 2.2 AA); con `navigation.spec.ts`, 23 de 23                                                                              |
| Tipos y estilo (ESLint) de todo lo tocado                                                                                                      | En verde                                                                                                                                                                                       |

### Resultado de las verificaciones

Corrida por partes el 12/11/2026, sin `pnpm dev` en marcha:

- `format:check`, `build:types`, `typecheck`, `boundaries`, `unused` (knip) y `secrets`: en verde.
  ESLint: en verde sobre todos los archivos cambiados o nuevos (lo exige cada commit); el ESLint
  global de una sola corrida queda a cargo de la integración continua.
- Pruebas unitarias de la API: en verde, cobertura 97,91 % líneas, 92,32 % ramas y 96,27 %
  funciones.
- Pruebas unitarias de la web: 748 de 748 (123 archivos), cobertura 96,14 % líneas y 85,11 % ramas
  (el umbral de ramas es 85 %: el margen es estrecho y cada pantalla nueva debe llegar con sus
  pruebas).
- Integración: Compras 12 de 12 y los guardas generales 383 de 383, sobre PostgreSQL desechable
  con todas las migraciones aplicadas desde cero. La suite completa de integración no se corrió en
  este equipo (no cierra de una sola vez, ver B31): queda a cargo de la integración continua.
- E2E: 23 de 23 en Compras y navegación tras `build` de la web. La suite completa de E2E queda a
  cargo de la integración continua.
- No se debilitó ninguna prueba ni control. Se actualizaron la cuenta de módulos del menú (de 18 a
  19, por «Compras»), el documento de permisos por rol y el OpenAPI, que se generan del código.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita:

- una persona con rol **Colaborador** (pide),
- dos personas con rol **Administrativo y financiero** (una cotiza y ordena, la otra aprueba),
- una persona con rol **Dirección** (para el tramo alto),
- un **centro de costo activo** (Administración → Organización),
- dos **proveedores** en Terceros (papel «Proveedor»), uno de ellos con su **conocimiento del
  tercero aprobado**.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b33-compras-proveedores-y-viajes
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

### 2. Pedir y aprobar una compra

1. Entre como **Colaborador** a **http://localhost:3000/app/compras/solicitudes**.
2. Pulse **Nueva solicitud**. Al escribir el valor (por ejemplo 5000000) verá debajo «Tramo medio:
   exige 2 cotizaciones». Créela.
3. Pulse **Enviar a aprobación**.
4. Entre como la persona que **aprueba** (Administrativo y financiero) y pulse **Aprobar**.
5. Compruebe que el Colaborador no ve el botón Aprobar y que, si quien aprueba hace su propia
   solicitud, le aparece «La aprueba otra persona».

### 3. Cuadro comparativo y tope

1. Entre como la persona que **cotiza** a **Compras → Cuadro comparativo**.
2. Pulse **Agregar cotización**: elija un proveedor, valor, días y adjunte un PDF.
3. Pulse **Elegir**. Como exige 2 cotizaciones y hay 1, debe rechazarlo con ese mensaje.
4. Agregue la segunda cotización y pulse **Elegir** otra vez: ahora queda **Cotizada**.

### 4. Orden, recepción y cierre

1. En el mismo cuadro pulse **Emitir orden de compra**. Si eligió al proveedor **sin** conocimiento
   del tercero vigente, debe rechazarlo; elija la del otro proveedor y emítala.
2. Vaya a **Órdenes de compra → Registrar recepción**. Quite la marca «Llegó conforme» e intente
   guardar sin novedad: debe pedirla. Escríbala y guarde: la orden sigue **Emitida**.
3. Registre otra recepción, esta vez conforme: pasa a **Recibida**. Pulse **Cerrar**.
4. En **Recepciones** verá las dos, la no conforme con su novedad.

### 5. Tramo alto

1. Como Colaborador, cree y envíe una solicitud por 12000000.
2. Como Administrativo y financiero verá «La aprueba la Dirección».
3. Como **Dirección**, apruébela.

### 6. Evaluación de proveedores

1. Vaya a **Evaluación de proveedores → Evaluar proveedor**.
2. Elija proveedor, periodo (por ejemplo 2026-2) y califique: verá el puntaje y el resultado antes
   de guardar.
3. Intente repetir la misma evaluación del mismo periodo: debe rechazarla.

### 7. Viajes

1. Como Colaborador, **Viajes y legalizaciones → Nueva solicitud de viaje**, con fecha de salida de
   hoy o anterior y un anticipo. Envíela a aprobación.
2. Como Administrativo y financiero, apruébela.
3. Como Colaborador, pulse **Legalizar**: agregue gastos con su soporte y pulse **Legalizar viaje**.
   La pantalla dice si debe devolver dinero o si se le debe.

### 8. Topes

En **Administración → Parámetros** verá «Topes de aprobación de compras». Pulse **Programar un
cambio**, cambie los valores y la fecha desde la que rigen.

## Pendientes

- `pnpm check` completo: debe confirmarlo la integración continua del pull request.
- **Validar con el proceso administrativo** los topes (PR-ADM-001) y los criterios de evaluación
  (RE-ADM-001): hoy son valores de ejemplo.
- Aprobaciones en **«Mis tareas»** y avisos al aprobador (motor de flujos y notificaciones).
- **PDF de la orden de compra** para enviar al proveedor.
- **Anticipo y legalización en Finanzas** (gasto, reintegro) y revisión de la legalización por otra
  persona.
- Formatos FT-ADM (solicitud, cuadro comparativo, viaje) como registros del SGC.
- **Activos** (B34): inventario, comodato, mantenimientos, bajas y los dos criterios de la ficha
  17.12 que les corresponden.

## Lineamientos visuales (B22A)

Las pantallas usan solo componentes de `@arza/ui` (tablas con encabezados, tarjetas, insignias de
estado), Montserrat, una acción principal por pantalla, mensajes junto a cada campo con resumen de
errores al enviar, y «disponible pronto» para los activos. Se revisó accesibilidad en modo claro y
oscuro con la prueba en navegador.
