# Cierre del bloque B05: Integración continua

- Fecha: 07/10/2026
- Rama: `feat/b05-integracion-continua`
- Estado: en revisión. Pendiente de la aprobación del Director General (no es un bloque crítico:
  no requiere revisión externa).

## Qué se construyó

Hasta B04, las verificaciones de calidad (`pnpm check`) solo corrían en el computador de quien
hacía el cambio. Desde B05 **GitHub las corre solo, en cada pull request y en cada cambio a
`main`**, con las diez verificaciones del numeral 11.4. Si una falla, el pull request queda en rojo.

La guía de operación (qué revisa cada verificación y qué hacer si falla) está en
[`docs/runbooks/integracion-continua.md`](../runbooks/integracion-continua.md).

| Pieza                               | Qué hace, en palabras sencillas                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flujo `ci.yml`                      | Las verificaciones 1 a 9 en siete tareas paralelas, más la tarea «Verificaciones», que solo queda en verde si todas pasaron. Es la que se exigirá para integrar                                                                   |
| Flujo `zap-semanal.yml`             | Verificación 10: cada lunes, OWASP ZAP «ataca» una copia temporal de la web y la API. Falla con alertas de riesgo alto. Se puede lanzar a mano                                                                                    |
| Imágenes Docker                     | `apps/api/Dockerfile` y `apps/web/Dockerfile`: las "cajas" con las que se desplegará cada pieza. Usuario sin privilegios, verificación de salud y sin gestores de paquetes adentro. Trivy las analiza en cada cambio              |
| Migraciones sobre la versión previa | Un guion instala la versión de `main`, aplica sus migraciones y carga datos ficticios; luego aplica encima las del cambio. Otro revisa que una migración nueva no borre ni renombre lo que la versión anterior usa (numeral 10.6) |
| Umbral de dependencias              | osv-scanner reporta todo; un ayudante aplica el umbral del manual (falla solo con vulnerabilidades altas o críticas)                                                                                                              |
| Renovate                            | `renovate.json`: propone actualizaciones los lunes, agrupadas, con tres días de espera desde su publicación; las de seguridad, de inmediato. Nunca integra solo                                                                   |
| Protección de `main`                | `infra/scripts/github/protect-main.sh` la aplica con un solo comando. **Requiere GitHub Pro** (ver «Pendientes»)                                                                                                                  |
| Herramientas fijadas                | Cada acción de GitHub va fijada a un commit exacto, cada imagen a su huella y cada programa descargado a la huella de su archivo, que se verifica antes de usarlo                                                                 |

**Tablas nuevas:** ninguna. **Puntos de la API nuevos:** ninguno.

### Problemas reales que las verificaciones encontraron (y se corrigieron)

- **Tres vulnerabilidades altas** en piezas que trae Prisma. Dos se corrigieron forzando
  versiones arregladas (`mysql2` y `deepmerge-ts`, en `pnpm-workspace.yaml`). La tercera
  (`braces`) no tiene corrección publicada: quedó como excepción por 30 días (ver «Decisiones»).
- En una copia nueva del proyecto, el análisis de código fallaba porque corría antes de compilar
  los paquetes compartidos. En GitHub ahora se compilan primero.

## Cómo se probó

- `pnpm check` en verde en el equipo: formato, análisis, tipos, fronteras, código
  sin uso, 187 pruebas unitarias (51 nuevas), 36 pruebas con base de datos real, compilación, 33 pruebas
  en navegador y secretos.
- En GitHub, el pull request corrió las nueve tareas en verde. Tiempo total: **3 minutos 50 segundos** (meta:
  menos de 15 minutos).
- Pruebas nuevas: 51 pruebas de los ayudantes de la integración continua (100 % de líneas cubiertas).
  Detectan cada tipo de migración peligrosa, que una migración ya integrada no se reescriba, y
  clasifican bien las vulnerabilidades por puntaje y por etiqueta.
- Se construyeron y encendieron las dos imágenes en el equipo: la API responde `/version`, la web
  sirve sus páginas con la política de seguridad y ambas corren con un usuario sin privilegios.
- Trivy: cero vulnerabilidades altas o críticas en las dos imágenes.
- OWASP ZAP sobre la copia temporal: **cero alertas de riesgo alto**. Quedan avisos medios y bajos
  (ver «Pendientes»).
- Guion de migraciones ensayado en el equipo contra `main`: aplicó, cargó datos y la base coincide
  con el modelo.

| Criterio de aceptación                                  | Cómo se demuestra                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un pull request con una prueba rota no puede integrarse | Pull request de demostración [#6](https://github.com/YulianArbo/arza-one/pull/6): cambia a propósito una prueba para que espere dólares en lugar de pesos. La tarea «4. Pruebas unitarias» y «Verificaciones» quedaron en rojo; se cerró sin integrar. **La verificación lo detecta y queda en rojo.** El bloqueo del botón de integrar se activa al aplicar la protección de `main`, que requiere GitHub Pro (pendiente de usted) |
| Tiempo total de las verificaciones inferior a 15 min    | **3 min 50 s** en la ejecución del pull request de este bloque                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm check` en verde                                   | Ver arriba                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Permiso denegado, aislamiento y auditoría               | Este bloque no crea datos, pantallas ni puntos de la API, así que no tiene pruebas nuevas de ese tipo. Lo que hace es volver **obligatorias** las que ya existen: la tarea 5 corre las de aislamiento entre empresas y permisos de la base de datos, y la tarea 4 las de permiso denegado de la API y la web. Si una falla, el cambio no entra. El ayudante de migraciones además rechaza siempre desactivar la seguridad por fila |
| Documentación y cierre escritos                         | Este documento, `docs/runbooks/integracion-continua.md`, `infra/scripts/README.md` y el `README.md` principal                                                                                                                                                                                                                                                                                                                      |

## Cómo lo prueba usted, paso a paso

Todo se ve en el navegador, en GitHub. No necesita instalar nada.

### 1. Ver las verificaciones de este bloque

1. Abra el pull request del bloque: https://github.com/YulianArbo/arza-one/pull/5
2. Baje hasta el final de la página. Debe ver **«All checks have passed»** con la lista de tareas:
   «1-3. Formato…», «4. Pruebas unitarias…», hasta «9. Pruebas en navegador…» y «Verificaciones».
3. Haga clic en **«Details»** junto a cualquiera para ver qué revisó, paso por paso.
4. Para ver el tiempo total: pestaña **«Checks»** del pull request, arriba a la derecha.

### 2. Ver cómo se bloquea una prueba rota

1. Abra el pull request de demostración: https://github.com/YulianArbo/arza-one/pull/6
2. Al final de la página verá **«Some checks were not successful»**, con la tarea «4. Pruebas
   unitarias…» y «Verificaciones» en rojo. Clic en «Details» de la tarea 4: la prueba rota aparece
   con su nombre.
3. Ese pull request está cerrado y no se integró. Cuando active la protección (paso 4), el botón
   «Merge» quedará bloqueado en casos así.

### 3. Lanzar el análisis semanal con ZAP a mano

1. En GitHub, pestaña **Actions** → a la izquierda **«Análisis dinámico semanal (OWASP ZAP)»**.
2. Botón **«Run workflow»** → **«Run workflow»**. Tarda unos 15 minutos.
3. Al terminar, abra la ejecución: abajo, en «Artifacts», está **informes-zap** con los informes
   en HTML.

Este análisis solo aparece en Actions después de integrar el bloque a `main` (GitHub solo muestra
los flujos programados que ya están en la rama principal).

### 4. Activar la protección de `main` (cuando tenga GitHub Pro)

1. Contrate GitHub Pro en https://github.com/settings/billing/plans.
2. En PowerShell, en la carpeta del proyecto:

   ```bash
   bash infra/scripts/github/protect-main.sh
   ```

   Debe decir «Protección aplicada a main en YulianArbo/arza-one».

3. Compruébelo en GitHub: **Settings → Branches**: `main` aparece con su regla.
4. Desde ese momento, ni siquiera usted puede integrar un pull request en rojo ni subir cambios
   directamente a `main`. También puede pedirme que lo ejecute.

### 5. Instalar Renovate

1. Abra https://github.com/apps/renovate y pulse **Install** (o **Configure**).
2. Elija **Only select repositories**, marque `arza-one` y confirme.
3. En unas horas aparecerá en **Issues** el «Panel de actualizaciones de dependencias». Los lunes
   llegarán como pull requests las actualizaciones; ninguna se integra sola.

## Pendientes

- **Protección de `main`**: requiere GitHub Pro (unos USD 4 al mes; confírmelo en GitHub). El guion
  está listo (paso 4). Hasta entonces, las verificaciones avisan, pero el botón de integrar no se
  bloquea.
- **Instalar Renovate** (paso 5).
- **Imagen del worker**: se construye en B06, cuando el worker tenga contenido. Hoy está vacío.
- **Publicar las imágenes y desplegar**: B07. Allí ZAP y las pruebas en navegador pasarán a
  apuntar al servidor de pruebas, como dice el manual.
- **Avisos medios y bajos de ZAP** sobre la web, ninguno alto: la política de seguridad permite
  estilos en línea (`style-src 'unsafe-inline'`) y faltan tres cabeceras de aislamiento entre
  sitios (`Cross-Origin-*-Policy`). Se proponen para B43 (endurecimiento de seguridad).
- **Excepción de `braces`**: vence el 06/11/2026. Si para entonces no hay corrección, la verificación
  vuelve a fallar y se revisa de nuevo.
- **Inventario de componentes (SBOM) por versión** (capítulo 15): se genera al publicar versiones
  (B07).
- `pnpm check` en un equipo recién clonado también corre el análisis de código antes de compilar
  los paquetes. En GitHub ya está corregido; en el equipo no afecta mientras exista una compilación
  previa. Se puede ajustar el orden de `pnpm check` en B06.

## Decisiones tomadas

1. **Excepción temporal para `braces`** (`osv-scanner.toml`, 30 días). No hay versión corregida.
   Solo la usa la herramienta que revisa el código, con patrones escritos por nosotros, y no llega
   a las imágenes. **Necesita su aprobación en el pull request.**
2. **Versiones forzadas para `mysql2` y `deepmerge-ts`** (`pnpm-workspace.yaml`). Prisma 7.10.0, la
   última versión 7, trae las vulnerables. Las pruebas con base de datos real confirman que Prisma
   sigue funcionando. Se retiran al actualizar Prisma.
3. **Semgrep no analiza los archivos de prueba**, igual que su configuración de fábrica. Las
   pruebas usan direcciones locales y datos ficticios a propósito. Todo el código que se despliega
   sí se analiza.
4. **Umbral de Semgrep**: falla con hallazgos de severidad ERROR (la más alta de Semgrep), que es el
   equivalente de «alto» del manual.
5. **Las herramientas se descargan con huella verificada** en lugar de usar acciones de terceros.
   Solo se usan acciones oficiales de GitHub y la de pnpm, fijadas a un commit exacto.
6. **Migraciones destructivas**: se permiten solo con la línea `-- arza:contract <motivo>`, que queda
   a la vista en la revisión. Desactivar la seguridad por fila nunca se permite.
7. **Sin aprobación obligatoria de otra persona** en la protección de `main`, mientras el equipo
   sea de una persona. Se exige la tarea «Verificaciones» en verde y la regla aplica también a los
   administradores.
8. **Renovate** espera tres días desde la publicación de cada versión (coincide con la política de
   pnpm) y respeta las versiones fijadas a propósito: TypeScript 6, NestJS 11, Prisma 7, Node 24 y
   PostgreSQL 17.
9. **Prueba de arranque de la API** (`apps/api/test/startup.test.ts`): ahora espera a la API hasta
   18 segundos, dentro de su propio límite de 20, en lugar de 10. En Windows, con todas las pruebas
   en paralelo (ahora más, por las de este bloque), arrancar tardaba más de 10 segundos y la prueba
   fallaba dos veces seguidas. Por sí sola la API arranca en unos 6 segundos. La prueba exige lo
   mismo que antes: que la API arranque y responda `/version` con el ambiente correcto. **Revíselo
   en el pull request.**
