# Cierre del bloque B32: Presupuesto, gastos, caja menor y exportación contable

- Fecha: 12/11/2026
- Rama: `feat/b32-presupuesto-gastos-caja-menor` (sale de la rama del B31, que aún no está unida a
  `main`; el pull request se apila sobre el del B31)
- Estado: en revisión. No es un bloque crítico: basta con la aprobación del Director General.
- Pendiente principal: confirmar `pnpm check` completo en la integración continua del pull request
  (en este equipo la suite completa de integración no cierra de una sola vez, igual que en el B31).

## Qué se construyó

La **segunda parte de Finanzas (M10)**: presupuesto por centro de costo, gastos con soporte, caja
menor, conciliación bancaria, certificación de costos de desarrollo, **cierre de mes** y el
**archivo para el Contador**.

| Pieza                   | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presupuesto             | Uno por año. Se planea por centro de costo, rubro y mes. Lo aprueba una persona distinta de quien lo elaboró y, aprobado, ya no se edita. Muestra **lo ejecutado contra lo planeado** por centro de costo (gastos aprobados más vales de caja menor).                                                                                    |
| Gastos                  | Se registran con fecha, valor, rubro, centro de costo, proveedor (opcional), descripción y **soporte obligatorio**. Quedan pendientes; otra persona los aprueba o los rechaza con motivo. El colaborador solo ve los suyos.                                                                                                              |
| Caja menor              | Una por empresa. Se abre con el fondo; los **vales** restan (con centro de costo y rubro) y los **reembolsos** suman. El saldo nunca queda negativo ni pasa del fondo.                                                                                                                                                                   |
| Conciliación bancaria   | Por cuenta (con un nombre corto, nunca el número completo) y mes: saldo en libros, saldo del banco y las partidas que explican la diferencia. Solo se cierra cuando cuadra.                                                                                                                                                              |
| Certificación de costos | Por proyecto y mes: las **horas aprobadas** las trae Proyectos; el **valor** lo digita la persona.                                                                                                                                                                                                                                       |
| Cierre de mes           | Un mes ya terminado, sin gastos pendientes, se cierra con un botón. Desde ese momento **nada con fecha de ese mes se puede crear ni cambiar**: gastos, caja menor, conciliaciones, certificaciones y también recaudos, notas crédito y registro de facturas del B31. Lo garantizan la API (mensaje claro) y la base de datos (respaldo). |
| Exportación contable    | Archivo CSV del mes para el Contador. Mes cerrado: su archivo **definitivo**, que se vuelve a generar idéntico (lo prueba una huella). Mes abierto: un archivo **preliminar**. Cada exportación queda registrada con sus totales y en la auditoría.                                                                                      |
| Pantallas               | Finanzas → Presupuesto, Gastos, Caja menor, Conciliación bancaria, Certificación de costos y Cierre y exportación contable. La cartera por edades sigue como «disponible pronto».                                                                                                                                                        |

Tablas nuevas: `fin_budgets`, `fin_budget_lines`, `fin_expenses`, `fin_petty_cash`,
`fin_bank_reconciliations`, `fin_cost_certifications`, `fin_periods` y `fin_export_batches`
(migración `20261112000000_fin_budget_expenses_petty_cash_exports`). Detalle en
`docs/manual/datos/fin.md`.

## Decisiones tomadas (aprobadas por usted el 11/11/2026)

1. **Formato del archivo**: CSV separado por punto y coma, con coma decimal, una fila por movimiento
   (fecha, tipo, número, NIT, tercero, centro de costo, rubro, valor, referencia). Queda marcado
   **pendiente de validación del Contador**.
2. **Tabla `fin_periods`** (no estaba en la lista del bloque) para saber qué meses están cerrados.
3. **Un mes cerrado no se reabre**; un error se corrige en un mes abierto.
4. **El cierre también bloquea lo del B31** (recaudos, notas crédito y registro fiscal).
5. **Permisos nuevos**: «Ver gastos, caja menor y conciliaciones» (Administrativo y financiero,
   Contador, Dirección y Auditor) y «Cerrar periodos contables» (Administrativo y financiero y
   Contador). Rubros en un catálogo administrable con opciones ficticias.
6. **Certificación**: horas de Proyectos y valor digitado.
7. **Cuenta bancaria por nombre corto**, **una caja menor por empresa**, arqueo para después.
8. **Archivo generado en el acto**, con tope de 20 000 filas, como la exportación de auditoría.

Decisiones adicionales que tomé y debe conocer:

- **Un permiso más, no previsto en el plan**: «Certificar costos de desarrollo»
  (`finance.cost_certification.manage`), solo para Administrativo y financiero. No había un permiso
  adecuado para esa tarea y no quise reutilizar otro con otro sentido.
- El **Auditor** también recibe «Ver gastos, caja menor y conciliaciones», porque su rol lee todo
  Finanzas según la matriz del manual (15.3). Comercial no lo recibe.
- Para cerrar un mes no debe haber **gastos pendientes** de ese mes, y solo se cierra un mes **ya
  terminado**.
- Lo ejecutado del presupuesto se **calcula**, no se guarda (el manual nombraba una columna
  `executed`): así nunca se desincroniza.
- El archivo no se guarda en el almacenamiento: como un mes cerrado no cambia, se **vuelve a
  generar idéntico** y se comprueba con su huella.

## Criterios de aceptación

| Criterio                                                            | Estado                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lo exportado coincide con lo registrado                             | Cumplido y probado: la suma por tipo leída del archivo es igual a la suma en la base de datos, y el archivo se descarga idéntico |
| Un periodo cerrado no admite cambios                                | Cumplido y probado: la API responde «mes cerrado» y la base de datos rechaza la escritura aunque el código se equivoque          |
| `pnpm check` en verde                                               | **Pendiente** de la integración continua del pull request (ver abajo)                                                            |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría | Cumplido                                                                                                                         |
| Documentación y cierre del bloque escritos                          | Cumplido (este documento, `docs/manual/datos/fin.md`, `permisos-por-rol.md` y OpenAPI)                                           |

## Cómo se probó

| Verificación                                                                                      | Resultado                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos (`packages/contracts`, finanzas y matriz de roles)                                      | 9 de 9 y matriz de roles al día                                                                                                                                                                   |
| Reglas sin base de datos (`fin/domain`: caja menor, conciliación, meses y archivo CSV)            | 9 de 9                                                                                                                                                                                            |
| Integración de Finanzas (`test/int/fin`, incluye B31)                                             | 20 de 20: presupuesto, gastos, caja menor, ejecución, conciliación, certificación, cierre, exportación, mes cerrado (también recaudos del B31 y el disparador de la base), permisos y aislamiento |
| Recorrido de auditoría de toda ruta que escribe, migraciones, semilla y permisos de base de datos | 336 de 336 (incluye las 13 rutas nuevas que escriben)                                                                                                                                             |
| OpenAPI (`apps/api/openapi.json` y lista de rutas)                                                | 4 de 4                                                                                                                                                                                            |
| Pantallas de Finanzas (web)                                                                       | 17 de 17                                                                                                                                                                                          |
| Pantallas en el navegador con accesibilidad, modo claro y oscuro (`e2e/finance-ledger.spec.ts`)   | 14 de 14 (las seis pantallas y sus formularios, sin violaciones WCAG 2.2 AA); junto con `finance.spec.ts` y `navigation.spec.ts`, 31 de 31                                                        |
| Tipos y estilo (ESLint) de todo lo tocado                                                         | En verde                                                                                                                                                                                          |

### Resultado de las verificaciones

Corrida por partes el 12/11/2026, sin `pnpm dev` en marcha:

- `format:check`, `build:types`, `typecheck`, `boundaries`, `unused` (knip), `secrets` y `lint`
  (ESLint global): en verde.
- Pruebas unitarias de la API: 415 de 415, cobertura 97,9 % líneas, 92,22 % ramas, 96,24 %
  funciones. En la corrida conjunta con los demás paquetes nueve archivos ajenos al B32 agotaron
  su espera (equipo saturado); repetidos solos, pasan todos.
- Pruebas unitarias de la web: 720 de 720 (119 archivos), cobertura 96,08 % líneas y 85,02 % ramas.
- Integración: Finanzas 20 de 20 y recorrido de auditoría, migraciones, semilla y permisos de base
  de datos 336 de 336. La suite completa de integración no se corrió en este equipo (no cierra de
  una sola vez, ver B31): queda a cargo de la integración continua.
- E2E: 31 de 31 en Finanzas y navegación tras `build` de la web. Una prueba del B31 falló una vez
  por un error de Windows al escribir su archivo de rastreo y pasó al repetirla.
- No se debilitó ninguna prueba ni control. Se actualizaron el texto esperado de la portada de
  Finanzas («Cartera por edades: disponible pronto») y la lista de rutas del OpenAPI.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita una persona con el rol **Administrativo y financiero** y otra
distinta con el mismo rol (para aprobar), y al menos un **centro de costo activo** (Administración
→ Organización).

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b32-presupuesto-gastos-caja-menor
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

### 2. Presupuesto

1. Entre a **http://localhost:3000/app/finanzas/presupuesto**.
2. Pulse **Nuevo presupuesto**, deje el año actual y créelo.
3. Pulse **Ver**, agregue una línea (centro de costo, rubro, mes y valor).
4. Con **otra persona** pulse **Aprobar presupuesto**. Compruebe que quien lo elaboró no puede
   aprobarlo y que, aprobado, ya no deja agregar líneas.

### 3. Gastos

1. Vaya a **Gastos** y pulse **Registrar gasto**. Intente guardar sin soporte: debe pedirlo.
2. Llénelo con un soporte PDF y guárdelo. Queda **Pendiente**.
3. Con otra persona, **Aprobar** (o **Rechazar** con motivo).
4. Vuelva a **Presupuesto → Ver**: la ejecución del centro de costo sube.

### 4. Caja menor

1. Vaya a **Caja menor → Registrar movimiento**, tipo **Apertura**, por ejemplo $ 500.000.
2. Registre un **Vale** (pide centro de costo y rubro). El saldo baja.
3. Intente un vale mayor que el saldo: debe rechazarlo.

### 5. Conciliación y certificación

1. **Conciliación bancaria → Nueva conciliación**: escriba la cuenta con un nombre corto (si
   escribe el número completo, la rechaza). Agregue partidas hasta que «Sin explicar» quede en
   $ 0 y pulse **Cerrar**.
2. **Certificación de costos → Nueva certificación**: elija un proyecto y un mes; verá las horas
   aprobadas. Digite el valor y certifique.

### 6. Cierre y exportación

1. Vaya a **Cierre y exportación contable**.
2. Pulse **Exportar preliminar** en el mes actual: se descarga `contabilidad-AAAA-MM-preliminar.csv`.
   Ábralo en Excel: cada fila es un movimiento.
3. En un mes ya terminado y sin gastos pendientes, pulse **Cerrar mes**.
4. Intente registrar un gasto con fecha de ese mes: debe decir que **el mes está cerrado**.
5. Pulse **Exportar definitivo** en ese mes: el archivo es el mismo cada vez.

## Pendientes

- `pnpm check` completo: debe confirmarlo la integración continua del pull request.
- **Validar con el Contador** el formato del archivo (columnas, tipos y si necesita cuentas del
  PUC). Hoy no hay plan de cuentas en la plataforma.
- Arqueo de caja menor, reapertura controlada de periodos (si se decide) y el archivo en segundo
  plano guardado en el almacenamiento (decisión 8).
- Costo por hora para calcular la certificación (llega con Talento humano) y el formato FT de
  certificación (`form_record_id`).
- Cartera por edades, deterioro y gestión de cobro siguen pendientes de reglas (B31).

## Lineamientos visuales (B22A)

Las pantallas usan solo componentes de `@arza/ui` (tablas con encabezados, tarjetas, indicadores
de saldo), Montserrat, una acción principal por pantalla, mensajes junto a cada campo con resumen
de errores al enviar, y «disponible pronto» para la cartera. Se revisó accesibilidad en modo claro y
oscuro con la prueba en navegador.
