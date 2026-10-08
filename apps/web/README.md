# @arza/web

Sitio público, aplicación interna y portal del cliente de ARZA ONE en Next.js 16 con React 19
(ADR-005). La web pide todos los datos a la API: nunca accede a la base de datos y nunca es la
barrera de seguridad (capítulo 8.2). El esqueleto se construyó en el bloque B04.

## Cómo se ejecuta

| Comando                                             | Qué hace                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm --filter @arza/web dev`                       | Modo de desarrollo en http://localhost:3000 (se recarga al guardar cambios) |
| `pnpm --filter @arza/web build`                     | Construye la versión de producción en `.next/`                              |
| `pnpm --filter @arza/web start`                     | Arranca la versión ya construida en http://localhost:3000                   |
| `pnpm --filter @arza/web test`                      | Pruebas unitarias con cobertura (Vitest y Testing Library)                  |
| `pnpm --filter @arza/web test:e2e`                  | Pruebas en navegador con Playwright y axe-core (construya antes)            |
| `pnpm e2e:install`                                  | Descarga el navegador de pruebas (Chromium), una sola vez por equipo        |
| `pnpm --filter @arza/web exec playwright test --ui` | Abre las pruebas en navegador en modo visual                                |

Antes de `dev`, compile los paquetes compartidos una vez con `pnpm build` (la web usa la versión
compilada de `@arza/ui` y `@arza/contracts`). Las variables de entorno se leen del `.env` de la
raíz (ver `.env.example`); la web solo necesita `API_URL`. Los comandos de Next.js desactivan su
telemetría (`NEXT_TELEMETRY_DISABLED=1`): la web no envía datos de uso a terceros.

## Superficies y direcciones

Una sola aplicación con tres grupos de rutas (capítulo 11.1):

| Grupo          | Dirección | Contenido en B04                                                        | Se completa en |
| -------------- | --------- | ----------------------------------------------------------------------- | -------------- |
| `app/(public)` | `/`       | Página inicial del sitio con enlaces a la aplicación y al portal        | B41            |
| `app/(app)`    | `/app`    | Estructura de pantalla 16.3, Inicio, módulos en construcción y ejemplos | Cada módulo    |
| `app/(portal)` | `/portal` | Página inicial del portal                                               | B30            |

Pantallas de la aplicación interna construidas en B04:

| Dirección                 | Qué muestra                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `/app`                    | Inicio: Mis tareas, Vencimientos próximos, Avisos y Accesos frecuentes, aún vacíos  |
| `/app/estado-del-sistema` | **Pantalla de ejemplo**: versión de la API y estado de sus piezas, con datos reales |
| `/app/sistema-de-diseno`  | Muestrario de colores, tipografías, componentes y estados de pantalla               |
| `/app/<módulo>`           | Módulos del menú aún no construidos: dice en qué bloque se construyen               |
| `/app/perfil`             | Mi perfil (B08): datos propios y cambio de contraseña                               |

## Acceso y sesión (B08)

El grupo `app/(access)` tiene las pantallas de acceso del numeral 16.7, que no se indexan:

| Dirección                 | Qué hace                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `/iniciar-sesion`         | Correo y contraseña. Muestra el aviso del motivo (`?motivo=`) y vuelve a `?volver=` |
| `/activar-cuenta`         | Se abre desde el correo de invitación: nombre y contraseña                          |
| `/recuperar-contrasena`   | Pide el enlace; muestra siempre el mismo mensaje de la API                          |
| `/restablecer-contrasena` | Se abre desde el correo de recuperación: contraseña nueva                           |

- `features/session/session-provider.tsx`: `RequireSession` envuelve la aplicación interna y el
  portal. Consulta `GET /v1/auth/session`; sin sesión lleva a iniciar sesión recordando la pantalla,
  y a quien es del portal (o de la aplicación) lo lleva a su superficie. `useSession()` entrega la
  sesión, el código antifalsificación y la salida. La API sigue siendo la única barrera.
- El cliente de la API envía el código en `X-CSRF-Token` en cada `post` con sesión.
- La llave de los enlaces del correo viene después de `#` (el navegador no la envía al servidor);
  `features/access/link-token.ts` la lee y la quita de la barra de direcciones.
- Los botones de enviar esperan a que la página cargue su lógica (`lib/hydration/use-hydrated.ts`):
  un clic anterior recargaría la página y se perdería lo escrito.
- Las reglas de longitud de la contraseña son las mismas de la API (`packages/contracts`); la lista
  de contraseñas filtradas solo la revisa la API.

## Estructura de pantalla (numeral 16.3)

`src/components/app-shell/` arma las cuatro zonas de la figura 16.3:

| Zona | Componente                                | Comportamiento                                                                                                                                                           |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `sidebar.tsx`, `mobile-navigation.tsx`    | Menú por módulos según permisos: completo en escritorio (≥ 1024 px), solo iconos en tableta (768 a 1023 px, el nombre aparece al enfocar) y panel desplegable en celular |
| 2    | `top-bar.tsx`                             | Ruta de navegación, búsqueda global (Ctrl K), avisos, ayuda, apariencia y usuario                                                                                        |
| 3    | `page-header.tsx`                         | Título de la página y acción principal                                                                                                                                   |
| 4    | `app-shell.tsx` (`<main id="contenido">`) | Contenido. El enlace «Saltar al contenido» es lo primero que se enfoca con Tab                                                                                           |

`navigation.ts` define los módulos del menú, sus íconos y los permisos del anexo G que habilitan
cada uno (basta uno). El menú solo muestra lo que el usuario puede usar, pero **la API es la única
barrera**: ocultar un módulo no protege nada por sí solo. Mientras no existan los roles (B10),
`lib/session/current-permissions.ts` concede los permisos del menú a toda persona con sesión;
B10 lo reemplaza por `GET /api/v1/me/permissions`.

## Cliente de la API

`src/lib/api/` contiene el cliente tipado (`createApiClient`) y su proveedor para React
(`ApiProvider` con TanStack Query):

- Envía la cookie de sesión (`credentials: 'include'`) a `API_URL`; la API ya permite ese origen
  (CORS de B02).
- Revisa cada respuesta con el esquema Zod del contrato en `packages/contracts`. Si la respuesta
  no coincide, no la muestra: falla con `INVALID_RESPONSE`.
- Convierte toda falla en un `ApiError` con el código y el mensaje en español del formato 14.2 y
  el identificador de correlación para soporte. Sin conexión: `NETWORK_ERROR`.
- Reintenta una sola vez y solo las fallas pasajeras (sin conexión o error 5xx).

Ejemplo de uso en una pantalla (ver `features/system-status/use-system-status.ts`):

```ts
const api = useApiClient();
const version = useQuery({
  queryKey: ['platform', 'version'],
  queryFn: ({ signal }) => api.get('/version', { schema: versionResponseSchema, signal }),
});
```

## Estados de pantalla (numeral 16.5)

Los componentes están en `@arza/ui`: `LoadingState`, `EmptyState`, `ErrorState` y
`ForbiddenState`. Además, `app/(app)/app/loading.tsx` muestra el esqueleto mientras llega una
pantalla y `error.tsx` atrapa cualquier falla inesperada con un botón de reintento. Las
direcciones inexistentes muestran `not-found.tsx`.

## Seguridad (numeral 15.6)

| Control                         | Dónde                               | Detalle                                                                                                                                                |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Política de seguridad (CSP)     | `src/proxy.ts`, `lib/security/`     | Todo se carga del propio servidor. Scripts solo con un nonce nuevo en cada página; datos solo hacia `API_URL`; la página no se puede incrustar en otra |
| Cabeceras generales             | `next.config.ts`                    | HSTS, nosniff, Referrer-Policy, X-Frame-Options y Permissions-Policy; sin `X-Powered-By`                                                               |
| No indexar aplicación ni portal | `next.config.ts` y los `layout.tsx` | `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` y la etiqueta `robots` en la página                                                       |
| Tipografías propias             | `app/layout.tsx`                    | Inter y Montserrat desde los paquetes `@fontsource` (licencia OFL), servidas por la propia web                                                         |
| Configuración validada          | `lib/config/web-env.ts`             | Sin `API_URL` válida (http o https) la página falla con un mensaje claro                                                                               |

Los estilos permiten `'unsafe-inline'` porque Radix posiciona menús y ventanas con estilos en
línea; el manual solo lo prohíbe en scripts.

## Modo claro y oscuro

La preferencia se guarda en la cookie funcional `arza_theme` (`light`, `dark` o `system`), sin
datos personales, por un año. El servidor la lee para pintar la página ya en el modo elegido.
Sin cookie, la web sigue la preferencia del sistema operativo. Los colores de cada modo están en
los tokens de `@arza/ui`.

## Pruebas

| Tipo                  | Dónde                       | Qué comprueba                                                                              |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| Unitarias             | `src/**/*.test.ts(x)`       | Cliente de la API, menú por permisos, permiso denegado, tema, configuración, CSP y estados |
| Accesibilidad         | `e2e/accessibility.spec.ts` | Cada pantalla de B04 sin violaciones WCAG 2.2 AA en modo claro y oscuro (axe-core)         |
| Menú adaptable        | `e2e/navigation.spec.ts`    | Escritorio, tableta y celular; teclado; sin desbordes a lo ancho                           |
| Estados con la API    | `e2e/system-status.spec.ts` | Éxito, pieza caída, error 500 con reintento, sin permiso (403) y sin conexión              |
| Seguridad y recursos  | `e2e/security.spec.ts`      | Cabeceras, nonce distinto por página, noindex y tipografías desde el propio servidor       |
| Barra superior y tema | `e2e/shell.spec.ts`         | Ctrl K, modo oscuro recordado, modo del sistema y página no encontrada                     |

**Toda** prueba en navegador falla si la página intenta conectarse a un dominio que no sea la web
o la API (`e2e/support/fixtures.ts`). Las pruebas simulan la API, así que no hace falta
levantarla. Corren contra la versión de producción en el puerto 3100.

En las pruebas unitarias la cobertura mínima es 90 % (capítulo 21.1) sobre `src/lib`,
`src/features` y la lógica del menú.
