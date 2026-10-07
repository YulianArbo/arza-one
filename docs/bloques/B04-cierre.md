# Cierre del bloque B04: Esqueleto web y sistema de diseño

- Fecha: 07/10/2026
- Rama: `feat/b04-esqueleto-web-y-sistema-de-dis`
- Estado: en revisión. Pendiente de la aprobación del Director General (no es un bloque crítico:
  no requiere revisión externa).

## Qué se construyó

ARZA ONE ya tiene **cara**. Hasta B03 todo era trabajo interno (API y base de datos). Ahora existe
la web que usarán los colaboradores, los clientes y los visitantes, con la identidad de la marca y
las reglas de accesibilidad del manual.

La descripción técnica está en [`apps/web/README.md`](../../apps/web/README.md) y
[`packages/ui/README.md`](../../packages/ui/README.md).

| Pieza                      | Qué hace, en palabras sencillas                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tres zonas en una sola web | Sitio público en `/`, aplicación interna en `/app` y portal del cliente en `/portal`. Comparten los mismos componentes y colores                                                                                       |
| Sistema de diseño          | `packages/ui`: los colores, letras, radios y sombras de la marca (numeral 16.2) definidos una sola vez, en claro y en oscuro. Los colores que no son de la marca están bloqueados: no se pueden usar ni por descuido   |
| Componentes base           | Botones, campos, tarjetas, etiquetas de estado, alertas, tablas, ventanas, menús desplegables, panel lateral, confirmación de acciones irreversibles y ayuda emergente (shadcn/ui sobre Radix)                         |
| Estados de pantalla        | Cargando (esqueleto gris), vacío (qué se verá allí), error (mensaje en español, código para soporte y botón «Reintentar») y sin permiso (a quién pedirlo, sin mostrar datos). Numeral 16.5                             |
| Estructura de pantalla     | La figura 16.3: menú lateral oscuro por módulos, barra superior con ruta, búsqueda (Ctrl K), avisos, ayuda, apariencia y usuario; título con acción principal; contenido                                               |
| Menú adaptable             | Escritorio: menú completo. Tableta: solo iconos, el nombre aparece al pasar el ratón o con el teclado. Celular: botón ☰ que abre el menú en un panel                                                                  |
| Modo claro y oscuro        | Se elige en el botón de apariencia (Claro, Oscuro o Según el sistema) y se recuerda en el navegador                                                                                                                    |
| Tipografías propias        | Montserrat e Inter se sirven desde el propio servidor: la web no llama a Google ni a ningún otro tercero                                                                                                               |
| Cliente de la API          | La web pide los datos a la API y revisa que cada respuesta tenga la forma acordada en `packages/contracts`. Si algo falla, muestra un mensaje claro en español con el código para soporte                              |
| Pantalla de ejemplo        | **Estado del sistema** (`/app/estado-del-sistema`): consulta de verdad a la API y muestra su versión y si la base de datos, las colas y los archivos responden                                                         |
| Muestrario                 | **Sistema de diseño** (`/app/sistema-de-diseno`): todos los colores, letras, botones, campos y estados en una sola página, para revisarlos de un vistazo                                                               |
| Módulos en construcción    | Cada módulo del menú abre una página que dice en qué bloque se construye (por ejemplo, Comercial en B22)                                                                                                               |
| Seguridad del navegador    | La web le dice al navegador «solo cargue cosas de este servidor y solo envíe datos a la API» (política de seguridad del contenido). La aplicación interna y el portal se marcan para que los buscadores no los indexen |

**Tablas nuevas:** ninguna. **Puntos de la API nuevos:** ninguno. La web usa los que ya existían
(`/version` y `/health`).

## Cómo se probó

- `pnpm check` termina en verde: formato, análisis, tipos, fronteras, código sin uso, 136 pruebas
  unitarias (49 de la API, 38 de la web, 19 del sistema de diseño, 24 de los controles y 6 de los
  contratos), 36 pruebas con base de datos real, compilación, **33 pruebas en navegador** y
  secretos.
- Cobertura de las pruebas unitarias: sistema de diseño, 100 % de líneas; web, 99,4 %. El mínimo
  exigido es 90 %.
- **Comprobé que las revisiones detectan fallas.** Una prueba agrega a propósito un botón sin
  nombre y confirma que axe-core lo reporta. Otra confirma que el analizador de código rechaza una
  imagen sin texto alternativo.
- Recorrí a mano en el navegador integrado: la estructura de pantalla, el estado del sistema con
  la API real encendida y apagada, y el muestrario en modo oscuro con tamaño de celular.

| Criterio de aceptación                                    | Prueba que lo demuestra                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La pantalla de ejemplo pasa accesibilidad sin violaciones | `e2e/accessibility.spec.ts`: axe-core con las reglas WCAG 2.2 AA sobre **las seis pantallas** de B04 (no solo la de ejemplo), en modo claro y en modo oscuro: 12 revisiones, cero violaciones, cero errores en consola                                                                               |
| El menú se adapta a escritorio, tableta y celular         | `e2e/navigation.spec.ts`: en escritorio el menú muestra nombres y se recorre con el teclado; en tableta se contrae a iconos con su nombre al enfocar; en celular se abre desde ☰, navega y se cierra, sin desbordes                                                                                 |
| Ningún recurso se carga desde dominios de terceros        | `e2e/support/fixtures.ts` vigila **todas** las pruebas en navegador: cualquier petición a un dominio que no sea la web o la API hace fallar la prueba. `e2e/security.spec.ts` revisa además la política de seguridad y que las tipografías vienen del propio servidor                                |
| `pnpm check` en verde                                     | Ver arriba. Ahora incluye las pruebas en navegador                                                                                                                                                                                                                                                   |
| Permiso denegado                                          | `navigation.test.ts`: un módulo sin permiso no aparece en el menú. `module-placeholder.test.tsx`: sin permiso, la pantalla del módulo no revela ni su nombre. `system-status.spec.ts` y `system-status-panel.test.tsx`: si la API responde 403, se ve «No tiene acceso a esta sección» y ningún dato |
| Aislamiento entre empresas                                | **No aplica en este bloque**: la web no maneja datos de ninguna empresa todavía. El aislamiento lo garantiza la base de datos (B03) y lo comprobará la prueba por la interfaz del numeral 21.2 cuando existan datos de empresas (B08 y siguientes)                                                   |
| Auditoría                                                 | **No aplica en este bloque**: la web no guarda nada. La auditoría llega en B11                                                                                                                                                                                                                       |
| Documentación y cierre escritos                           | Este documento, `apps/web/README.md`, `packages/ui/README.md`, el `README.md` principal y `.env.example`                                                                                                                                                                                             |

## Cómo lo prueba usted, paso a paso

Use PowerShell en la carpeta del proyecto (`C:\Users\yeaze\arza-one`).

### Preparación (una sola vez)

```bash
git checkout feat/b04-esqueleto-web-y-sistema-de-dis
```

```bash
pnpm install
```

```bash
pnpm build
```

En su archivo `.env` cambie la línea `APP_URL` para que quede así (ver `.env.example`):
`APP_URL=http://localhost:3000/app`

### 1. Ver la web

```bash
pnpm --filter @arza/web dev
```

Espere el mensaje `Ready` y abra http://localhost:3000 en su navegador. La primera vez que abre
cada página tarda unos segundos mientras se prepara.

1. **Sitio público** (`/`): franja oscura con «ARZA ONE», el nombre de la empresa y dos botones.
2. Clic en **«Entrar a la aplicación»**. Debe ver el menú lateral oscuro a la izquierda, la barra
   superior y cuatro recuadros punteados en Inicio (Mis tareas, Vencimientos próximos, Avisos y
   Accesos frecuentes) que explican qué aparecerá allí.
3. En el menú, clic en **Comercial**: «Este módulo está en construcción… bloque B22». Revise que
   la ruta de arriba diga «Inicio › Comercial» y que Comercial quede resaltado en el menú.
4. Clic en **Sistema de diseño**: revise que los colores, las letras y los botones correspondan a
   la marca. Clic en el botón rojo **«Anular registro»**: debe aparecer la confirmación que nombra
   el registro. Ciérrela con «Cancelar».
5. Presione **Ctrl + K**: se abre la búsqueda. Ciérrela con la tecla Escape.
6. Clic en el botón de **apariencia** (el icono de la pantalla, a la izquierda del usuario) y
   elija **Oscuro**. Recargue la página con F5: debe seguir en oscuro. Vuelva a «Claro» si prefiere.
7. **Tamaños de pantalla:** haga la ventana del navegador cada vez más angosta. Primero el menú
   queda solo con iconos (pase el ratón por encima para ver el nombre). Más angosta aún, el menú
   desaparece y arriba a la izquierda aparece el botón ☰ que lo abre.
8. **Teclado:** recargue la página y presione la tecla Tab: arriba a la izquierda aparece «Saltar
   al contenido». Siga con Tab: cada elemento enfocado se marca con un borde azul.
9. Abra http://localhost:3000/portal: la página inicial del portal del cliente.

### 2. Pantalla de ejemplo con la API

Con la web encendida, abra http://localhost:3000/app/estado-del-sistema.

- **Con la API apagada:** tras unos segundos con barras grises (cargando) aparece «No pudimos
  cargar la información… No pudimos comunicarnos con el servidor» y el botón «Reintentar».
- **Con la API encendida:** abra otra ventana de PowerShell en la carpeta del proyecto y ejecute

  ```bash
  pnpm --filter @arza/api dev
  ```

  Vuelva al navegador y pulse «Reintentar». Verá la versión de la API (0.1.0, ambiente Local). Si
  la base de datos de Docker no está encendida, la pantalla avisa «Hay piezas que no responden» y
  marca cada pieza con «No responde». Si enciende la base de datos (pasos de B03) y pulsa
  «Actualizar», «Base de datos» pasa a «Responde». Las colas y los archivos seguirán sin responder
  hasta B06.

Para apagar la web o la API, presione Ctrl + C en su ventana.

### 3. Pruebas automáticas

La primera vez, descargue el navegador de pruebas (unos 300 MB):

```bash
pnpm e2e:install
```

Luego, con Docker Desktop abierto:

```bash
pnpm check
```

Al final debe ver `33 passed` en las pruebas de la web en navegador y `no leaks found`.

> **Si `pnpm e2e:install` falla en su equipo.** En este equipo el descargador de Playwright
> cortaba la conexión aunque internet funcionaba. Lo resolví descargando los mismos archivos
> oficiales con `curl` y descomprimiéndolos donde Playwright los busca
> (`%LOCALAPPDATA%\ms-playwright\chromium-1243` y `chromium_headless_shell-1243`). En su equipo ya
> quedaron instalados; solo tendría que repetirlo en un equipo nuevo.

## Qué quedó pendiente

| Pendiente                                                   | Dónde se resuelve                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Iniciar sesión, «Mi perfil» y «Cerrar sesión» del menú      | B08. Hoy la aplicación interna se abre sin iniciar sesión (solo en su equipo)                    |
| Permisos reales del menú                                    | B10. Hoy el menú muestra todos los módulos; `current-permissions.ts` está marcado para cambiarse |
| Búsqueda global con resultados                              | Con el servicio de búsqueda (13.2) y los primeros módulos con datos                              |
| Avisos y ayuda contextual con enlaces al SGC                | B16 (notificaciones) y cada módulo                                                               |
| Contenido del sitio público y del portal                    | B41 y B30                                                                                        |
| Formatos de fecha, hora y pesos en pantalla (16.6)          | Con la primera pantalla que muestre fechas o dinero                                              |
| Pruebas de la web en GitHub                                 | B05 (integración continua)                                                                       |
| Prueba de aislamiento entre empresas por la interfaz (21.2) | Cuando la web muestre datos de empresas (desde B08)                                              |

## Decisiones que tomé (además de las que usted aprobó en el plan)

1. **Next.js 16.3.8 en lugar de 16.4.0.** La 16.4.0 salió el mismo día. `pnpm` tiene una regla de
   seguridad que rechaza paquetes publicados hace menos de un día (para protegerse de versiones
   maliciosas) y, al instalar, **agregó solo una excepción** a esa regla. No la conservé: borré la
   excepción y usé la versión anterior, que ya cumple la espera. Se podrá actualizar más adelante.
2. **Complemento de accesibilidad `eslint-plugin-jsx-a11y-x`.** El complemento clásico no se
   actualiza desde 2024 y no funciona con nuestra versión del analizador. Usé su continuación
   mantenida (licencia MIT, actualizada en 2026), que revisa las mismas reglas.
3. **Sin estadísticas de uso de Next.js.** Next.js envía por defecto estadísticas anónimas a sus
   servidores. Las desactivé en todos los comandos de la web (`NEXT_TELEMETRY_DISABLED=1`).
   Para eso activé en `pnpm-workspace.yaml` la opción `shellEmulator`, que permite escribir esas
   variables igual en Windows que en Linux.
4. **Sin archivo `AGENTS.md` automático.** Next.js crea por su cuenta un archivo de instrucciones
   para asistentes de programación. Lo desactivé: las instrucciones del proyecto viven solo en
   `CLAUDE.md`.
5. **Estilos en línea permitidos.** La política de seguridad prohíbe scripts en línea, como pide el
   manual. Los _estilos_ en línea sí se permiten, porque Radix los usa para ubicar menús y
   ventanas; el manual solo exige la prohibición para scripts.
6. **En modo oscuro el azul principal es el azul de acento (#7FB2FF).** El #005AFE sobre fondo
   oscuro no alcanza el contraste mínimo de 4,5:1 que exige el manual.
7. **Página no encontrada dentro de `/app`.** Fuera de la aplicación, una dirección inexistente
   responde «404» como debe ser. Dentro de `/app` la página muestra lo mismo, pero el servidor
   responde «200», porque la pantalla de carga ya empezó a enviarse. Es el comportamiento
   documentado de Next.js: en ese caso marca la página para que los buscadores la ignoren. Como la
   aplicación interna ya es no indexable y estará detrás del inicio de sesión, no tiene efecto
   práctico. Lo dejé probado y documentado.
8. **Pruebas en navegador sin API real.** Simulan las respuestas de la API. Así no necesitan
   Docker ni datos, y pueden provocar a voluntad errores difíciles de reproducir (sin permiso,
   servidor caído).

## Observación sobre una prueba existente

La primera vez que ejecuté `pnpm check` falló una prueba de B02 (`apps/api/test/startup.test.ts`):
la API recién compilada tardó más de 10 segundos en arrancar. Ejecutada sola pasa en 4 segundos,
y repetí todas las pruebas en paralelo dos veces más y un `pnpm check` completo sin fallas. Coincide
con lo ya anotado en B03: Windows Defender revisa el programa recién compilado la primera vez. **No
modifiqué la prueba.** Si vuelve a pasar con frecuencia, conviene revisarla en B05 (integración
continua), donde no hay antivirus de por medio.
