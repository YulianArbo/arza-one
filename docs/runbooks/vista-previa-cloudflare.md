# Vista previa de la web en Cloudflare Workers

> **Estado:** ensayo. El despliegue oficial sigue siendo Docker Compose en un servidor por
> ambiente (ADR-017). Publicar la web en Cloudflare como ambiente oficial exige un ADR nuevo
> aprobado por el Director General.

## Qué es

La rama `deploy/cloudflare` compila solo la **interfaz web** (`apps/web`) con OpenNext y la
publica como un Worker de Cloudflare llamado `arza-one`. La API, el procesador de tareas y la
base de datos **no** van a Cloudflare: la web necesita la variable `API_URL` apuntando a una API
publicada. Sin ella, las pantallas abren pero no cargan datos.

## Comandos (desde la raíz del repositorio)

| Comando                              | Qué hace                                                         |
| ------------------------------------ | ---------------------------------------------------------------- |
| `pnpm --filter @arza/web cf:build`   | Compila la web para Cloudflare en `apps/web/.open-next/`         |
| `pnpm --filter @arza/web cf:preview` | Compila y abre la vista previa local en el motor de Cloudflare   |
| `pnpm --filter @arza/web cf:typegen` | Genera los tipos del Worker (archivo local, no se guarda en git) |
| `pnpm --filter @arza/web cf:deploy`  | Publica en Cloudflare. **Solo lo ejecuta el propietario.**       |

Medida del 18/11/2026: el Worker pesa unos 2,4 MB comprimido. El plan gratuito de Cloudflare
admite hasta 3 MB; si la web crece por encima, hará falta el plan pagado (10 MB).

## Configuración del panel de Cloudflare (Workers Builds)

En **Workers & Pages → arza-one → Settings → Build**:

1. **Git repository:** `YulianArbo/arza-one`.
2. **Ramas:** la pantalla tiene dos pestañas.
   - Pestaña **Production**: «Production branch» = `deploy/cloudflare`. No active aquí
     «Disable builds»: apagaría también esta rama.
   - Pestaña **Previews Base**: active **«Disable builds»**. Así Cloudflare deja de compilar los
     pull requests de Renovate y de los bloques, que no tienen esta configuración y siempre
     aparecían con «Workers Builds: arza-one» en rojo.
3. **Root directory:** `/` (la raíz; el monorrepositorio necesita los paquetes compartidos).
4. **Build command:**
   `pnpm install --frozen-lockfile && pnpm --filter "./packages/*" build && pnpm --filter @arza/web cf:build`
5. **Deploy command:** `pnpm --filter @arza/web cf:deploy`
6. **Variables de compilación:** `NODE_VERSION=24` (el proyecto exige Node 24) y
   `NEXT_TELEMETRY_DISABLED=1`.
7. **Variables del Worker (Settings → Variables and Secrets):** `API_URL` con la dirección
   pública de la API de pruebas, y `APP_ENV=staging`. Nunca use datos reales.

## Cómo probar

1. Guarde la configuración anterior.
2. Cloudflare compila solo cuando llega un commit nuevo a `deploy/cloudflare` (por ejemplo, al
   fusionar un pull request hacia esa rama).
   **No use «Retry build» sobre compilaciones viejas:** repite el mismo commit antiguo. El
   18/11/2026 eso compiló una versión sin el comando `cf:build` y falló con
   `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL … failed in apps/web`.
3. Al terminar, abra la dirección `https://arza-one.<su-subdominio>.workers.dev` y verifique que
   carga la pantalla de ingreso.
4. Si **Active deployment** sigue mostrando una versión vieja, abra los «…» de la compilación
   nueva en **Deployments** y elija «Deploy version».
5. Si falla, abra «Build» en la fila de la compilación, confirme que el commit es el último de
   `deploy/cloudflare` y copie las últimas 50 líneas del registro para revisarlas.
