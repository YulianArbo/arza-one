# Cierre del bloque B34: Activos

- Fecha: 12/11/2026
- Rama: `feat/b34-activos` (sale de la rama del B33, que aún no está unida a `main`; el pull
  request se apila sobre el del B33)
- Estado: en revisión. No es un bloque crítico: basta con la aprobación del Director General.
- Pendiente principal: confirmar `pnpm check` completo en la integración continua del pull request
  (en este equipo la suite completa de integración no cierra de una sola vez, igual que en B31 a
  B33), y validar con el proceso administrativo el formato del libro (RE-ADM-003) y el texto del
  comodato (CT-ADM-001).

## Qué se construyó

La **segunda parte de Compras y activos (M11)**: el inventario de activos fijos y licencias, su
entrega a los colaboradores con contrato de comodato firmado, los mantenimientos, las bajas y el
libro de activos.

| Pieza                          | Qué hace, en palabras sencillas                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventario                     | Quien administra registra cada activo: nombre, categoría, serie, fecha de compra, costo, vida útil y ubicación. Recibe un código `ACT-AAAA-NNNN`.                                                                                                         |
| Asignación en comodato         | Se elige el activo y el colaborador. La plataforma **llena sola el contrato de comodato**, genera su PDF y se lo **envía por correo para firmar** (enlace y código, igual que las actas de entrega). Mientras tanto el activo queda «Pendiente de firma». |
| Activo asignado solo con firma | **Solo cuando el colaborador firma**, el activo pasa a «Asignado». Si rechaza, si pasan 15 días sin firmar o si quien asigna la anula, el activo vuelve a «Disponible». La base de datos también lo impide (respaldo por si el código fallara).           |
| Devolución                     | Quien administra registra la fecha y el estado en que se devolvió. El activo queda disponible y la asignación, en el historial.                                                                                                                           |
| Baja                           | Con fecha, motivo (daño, obsolescencia, pérdida o robo, venta, donación) y detalle. Solo se da de baja un activo disponible: si está asignado, primero se registra la devolución.                                                                         |
| Mantenimientos                 | Preventivos o correctivos: se programan, luego se registran como hechos con su fecha y su costo. No cambian el estado del activo.                                                                                                                         |
| Depreciación                   | Informativa, en línea recta: el costo repartido en los meses de vida útil. Se muestra el valor en libros; **no** genera movimientos en Finanzas.                                                                                                          |
| Libro de activos               | Botón **Descargar libro de activos**: un archivo que abre en Excel con todo el inventario, quién tiene cada activo y su comodato. Cada descarga queda en la auditoría.                                                                                    |
| Mis activos                    | Un colaborador entra a la misma pantalla y ve **solo los activos que tiene a su cargo** o está por recibir.                                                                                                                                               |
| Pantallas                      | Menú **Compras** → **Activos** (inventario y libro) y **Mantenimientos de activos**. Ya no aparece «Activos: disponible pronto».                                                                                                                          |

Tablas nuevas: `ast_assets`, `ast_assignments` y `ast_maintenance` (migración
`20261114000000_ast_assets_assignments_maintenance`). Detalle en `docs/manual/datos/ast.md`.

## Decisiones tomadas (aprobadas por usted el 12/11/2026)

1. **Rama apilada** sobre la del B33.
2. **Columnas del libro propuestas** (el RE-ADM-003 no está en el repositorio): código, nombre,
   categoría, serie, fecha de compra, costo, vida útil, depreciación acumulada, valor en libros,
   estado, ubicación, responsable, fecha de asignación, comodato y fecha de baja.
3. **Texto del comodato de ejemplo** (seis cláusulas), pendiente de revisión jurídica. Se cambia
   en **Documentos › Formatos** (formato CT-ADM-001), sin programar.
4. **Se asigna a colaboradores con cuenta activa**; el B35 los unirá con su hoja de vida.
5. **Solo firma el colaborador**; quien asigna queda registrado en nombre de la empresa.
6. **Sin firma, la asignación se anula** (rechazo, 15 días o anulación) y el activo queda libre.
7. **La devolución no pide firma**.
8. **Depreciación solo informativa**.
9. **Libro en CSV**, como la exportación contable del B32.
10. **Activos por devolver al retiro**: queda la consulta lista para Talento humano; el criterio
    completo se cierra en ese bloque.

Decisiones adicionales que tomé y debe conocer:

- **Requisito para firmar**: el colaborador debe estar **vinculado con su persona en Terceros, con
  su número de documento** (es lo que exige la firma electrónica). Si no lo está, la pantalla lo
  muestra como «falta vincular su persona en Terceros» y la API no deja asignarle. Mientras llega
  la pantalla de Talento humano, se vincula con el comando ya existente
  `pnpm contratos:vincular-firmante` (del B25), que sirve para cualquier colaborador activo.
- El enlace de firma llega al **correo de su cuenta** en la plataforma.
- La tabla guarda la cuenta del colaborador (`user_id`) en lugar del `employee_id` que nombra el
  capítulo 12, porque la tabla de colaboradores llega en el B35.
- **Pantallas en dos páginas** en lugar de cuatro: el inventario es también el libro (botón de
  descarga) y «Mis activos» (según el permiso); la historia de cada activo se abre en un diálogo.
- La descarga del libro es una petición `POST` y queda en la auditoría, igual que la exportación
  contable.
- No hizo falta ningún **permiso nuevo**: se usan los cuatro que ya existían (ver, administrar,
  asignar, dar de baja). Ver todo el inventario lo tienen Dirección, Calidad, Administrativo y
  financiero, Contador y Auditor; los demás roles ven solo lo propio.
- Se ajustó el módulo de **firma electrónica** para aceptar un tercer tipo de documento (además de
  contrato/otrosí y acta): el comodato. No cambia nada para los anteriores.

## Criterios de aceptación

| Criterio                                                            | Estado                                                                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Todo activo asignado tiene comodato firmado                         | Cumplido y probado: el activo solo queda «Asignado» tras la firma; la base de datos rechaza forzar «Asignado» sin comodato firmado |
| El libro coincide con RE-ADM-003                                    | **Cumplido con columnas propuestas; pendiente de su validación** contra el formato original, que no está en el repositorio         |
| El retiro de un colaborador lista los activos por devolver          | Parcial: la consulta existe y está probada; la pantalla de retiro es de Talento humano (B35 en adelante)                           |
| `pnpm check` en verde                                               | **Pendiente** de la integración continua del pull request (ver abajo)                                                              |
| Pruebas de permiso denegado, aislamiento entre empresas y auditoría | Cumplido                                                                                                                           |
| Documentación y cierre del bloque escritos                          | Cumplido (este documento, `ast.md`, README de la API y OpenAPI)                                                                    |

## Cómo se probó

| Verificación                                                                                                                                                                                              | Resultado                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Contratos (`packages/contracts`, incluye depreciación, libro y formularios de activos)                                                                                                                    | 215 de 215                                                                         |
| Reglas sin base de datos (`asset/domain`)                                                                                                                                                                 | 4 de 4                                                                             |
| Integración de Activos (`test/int/asset`): recorrido con firma real, rechazo, anulación, devolución y baja, respaldo de la base de datos, requisito para firmar, permisos, «solo lo propio» y aislamiento | 13 de 13                                                                           |
| Recorrido de auditoría de toda ruta que escribe, migraciones desde cero, semilla, permisos de base de datos y aislamiento                                                                                 | En verde junto con Activos (397 pruebas; incluye las 10 rutas nuevas que escriben) |
| OpenAPI (`apps/api/openapi.json` y lista de rutas)                                                                                                                                                        | 4 de 4; solo agrega 12 rutas y 13 esquemas                                         |
| Unitarias de la API                                                                                                                                                                                       | 425 de 425; cobertura 97,53 % líneas y 92,40 % ramas                               |
| Worker                                                                                                                                                                                                    | 42 de 42                                                                           |
| Pantallas de Activos, Compras y menú (web)                                                                                                                                                                | 51 de 51                                                                           |
| Tipos, ESLint de todo lo tocado, límites entre módulos y código sin usar                                                                                                                                  | En verde                                                                           |

Ver «Resultado de las verificaciones» al final para las corridas completas.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita:

- una persona con rol **Administrativo y financiero** (administra los activos),
- una persona con rol **Colaborador** que pueda abrir su correo de prueba (en el entorno local,
  Mailpit: http://localhost:8025),
- en **Terceros**, una ficha de persona para ese Colaborador con su número de cédula.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b34-activos
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

La semilla publica el formato **CT-ADM-001 Contrato de Comodato** en Documentos › Formatos.

Vincule la cuenta del Colaborador con su ficha de Terceros (aún no hay pantalla para esto; llega
con Talento humano). En otra terminal, con el correo y la cédula de prueba:

```bash
pnpm --filter @arza/api contratos:vincular-firmante --correo colaborador@demo.test --documento 1030555111
```

### 2. Registrar un activo

1. Entre como **Administrativo y financiero** a **http://localhost:3000/app/compras/activos**.
2. Pulse **Registrar activo**. Pulse el botón sin llenar nada: debe mostrar qué falta.
3. Llénelo (por ejemplo: Portátil de prueba, Equipo de cómputo, fecha de compra de hace un año,
   costo 3600000, vida útil 36) y guarde. Aparece con código `ACT-…`, «Disponible» y su valor en
   libros (menor que el costo).

### 3. Asignar en comodato y firmar

1. Pulse **Asignar** en ese activo. En la lista, quien no esté vinculado en Terceros aparece con
   «falta vincular su persona en Terceros».
2. Elija al Colaborador vinculado, la fecha de hoy y pulse **Asignar y enviar a firma**.
3. En menos de un minuto el activo dice **«Pendiente de firma»** y «En firma · firma hasta el …».
   Compruebe que **no** aparece «Dar de baja».
4. Abra el correo del Colaborador (Mailpit), pulse el enlace, pida el código, escríbalo, lea el
   contrato y **firme**.
5. En menos de un minuto el activo dice **«Asignado»** y «Comodato CT-ADM-001-… firmado», con el
   nombre del Colaborador como responsable.

### 4. Lo que ve el colaborador

Entre como el **Colaborador** a la misma dirección: la pantalla dice **«Mis activos»**, muestra solo
su portátil y no tiene botones para registrar, asignar ni descargar el libro.

### 5. Rechazo y anulación

1. Registre otro activo y asígnelo. Como Colaborador, abra el enlace y **rechace** con un motivo:
   el activo vuelve a «Disponible» y en **Ver historial** aparece la asignación anulada con el
   motivo.
2. Asígnelo de nuevo y, antes de que firme, pulse **Anular asignación** con un motivo: vuelve a
   «Disponible».

### 6. Devolución y baja

1. En el activo asignado pulse **Registrar devolución**, con la fecha y el estado: queda
   «Disponible».
2. Ahora pulse **Dar de baja**, elija motivo y detalle: queda «Dado de baja» y ya no se puede
   asignar ni editar.

### 7. Mantenimientos

1. En un activo pulse **Programar mantenimiento** (preventivo, una fecha próxima).
2. Vaya a **Compras → Mantenimientos de activos**: aparece «Pendiente». Pulse **Registrar como
   hecho**, con la fecha y el costo: queda «Hecho» con su costo.

### 8. Libro de activos

En **Activos** pulse **Descargar libro de activos**. Ábralo en Excel: una fila por activo con su
estado, responsable y comodato. **Compárelo con su formato RE-ADM-003** y dígame qué columnas
cambiar.

## Pendientes

- `pnpm check` completo: debe confirmarlo la integración continua del pull request.
- **Validar con el proceso administrativo**: columnas del libro (RE-ADM-003) y texto del comodato
  (CT-ADM-001, revisión jurídica).
- **Retiro del colaborador**: la pantalla que lista lo que debe devolver llega con Talento humano;
  la consulta (`assetsHeldBy`) ya está lista.
- Unir la asignación con la hoja de vida del colaborador (`hr_employees`, B35).
- Avisos (por ejemplo, mantenimiento próximo) y alertas de comodatos por vencer: no se pidieron
  en este bloque.
- Licencias con fecha de vencimiento propia: hoy se manejan como activo con vida útil.

## Lineamientos visuales (B22A)

Las pantallas usan solo componentes de `@arza/ui` (tablas con encabezados, insignias de estado,
diálogos), Montserrat, mensajes junto a cada campo con resumen de errores al enviar, y un estado
vacío claro cuando no hay registros. La prueba en navegador `e2e/assets.spec.ts` revisa
accesibilidad WCAG 2.2 AA en modo claro y oscuro.

## Resultado de las verificaciones

Corrida por partes el 12/11/2026, sin `pnpm dev` en marcha:

- `build:types`, tipos de API, web y worker, `boundaries` (límites entre módulos) y `unused`
  (knip): en verde. ESLint y formato: en verde sobre todos los archivos cambiados o nuevos (lo
  exige cada commit); el ESLint global de una sola corrida queda a cargo de la integración continua.
- Unitarias: contratos 215 de 215; API 425 de 425 (cobertura 97,53 % líneas, 92,40 % ramas);
  worker 42 de 42; web 764 de 764 (125 archivos, cobertura 95,50 % líneas y **85,05 % ramas**:
  el umbral es 85 %, el margen sigue siendo estrecho como en el B33).
- Integración, sobre PostgreSQL desechable con todas las migraciones aplicadas desde cero:
  Activos 13 de 13, y Activos junto con el recorrido de auditoría, semilla, migraciones, permisos de
  base de datos y aislamiento 397 pruebas en verde. La suite completa de integración no se corrió
  en este equipo (no cierra de una sola vez, ver B31): queda a cargo de la integración continua.
- Navegador, tras `build` de la web: `assets.spec.ts`, `purchases.spec.ts` y `navigation.spec.ts`
  35 de 35. Una prueba del B33 falló una vez porque Windows no pudo escribir
  su archivo de rastreo (no por una comprobación) y pasó al repetirla. La suite completa de E2E
  queda a cargo de la integración continua.
- Hallazgo corregido durante las pruebas: la consulta con la que el worker encuentra las empresas
  con comodatos pendientes no veía ninguna, porque faltaba su permiso de lectura en la base
  (`ast_assignments_worker_lookup`, igual que las actas del B27). Sin él los comodatos nunca
  habrían salido a firma.
- No se debilitó ninguna prueba ni control. Se actualizaron la portada de Compras (ya no dice
  «disponible pronto»), la prueba del menú y el OpenAPI, que se genera del código.
