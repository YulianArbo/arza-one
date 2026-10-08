# ARZA ONE

Plataforma empresarial de ARZA TECH S.A.S. La especificación oficial es el Manual Maestro
MN-TEC-002, disponible por capítulos en [`docs/manual/`](docs/manual/README.md). Las
instrucciones permanentes para Claude Code están en [`CLAUDE.md`](CLAUDE.md).

## Arranque en un equipo nuevo

### 1. Programas necesarios

| Programa              | Versión           | Cómo instalarlo en Windows                                  |
| --------------------- | ----------------- | ----------------------------------------------------------- |
| Git                   | Vigente           | `winget install --id Git.Git -e`                            |
| Node.js               | 24 LTS o superior | `winget install --id OpenJS.NodeJS.LTS -e`                  |
| pnpm                  | 12 o superior     | `npm install -g pnpm`                                       |
| gitleaks              | 8 o superior      | `winget install --id Gitleaks.Gitleaks -e`                  |
| GitHub CLI (opcional) | Vigente           | `winget install --id GitHub.cli -e` y luego `gh auth login` |
| Docker Desktop        | Vigente           | Ver capítulo 23.3 del manual (requiere WSL 2)               |

En macOS o Linux, instale los mismos programas con el gestor de paquetes del sistema.
Después de instalar, cierre y vuelva a abrir la terminal para que reconozca los programas nuevos.

### 2. Descargar e instalar

```bash
git clone https://github.com/YulianArbo/arza-one.git
cd arza-one
pnpm install
```

`pnpm install` también activa los controles que se ejecutan antes de cada commit (lefthook).

### 3. Comprobar que todo funciona

```bash
pnpm check
```

Debe terminar sin errores. Si falla, lea el mensaje: indica qué control falló y en qué archivo.
Docker Desktop debe estar abierto: las pruebas de integración crean un PostgreSQL desechable.
Las pruebas en navegador necesitan antes `pnpm e2e:install` (paso 7).

### 4. Variables de entorno

Copie `.env.example` como `.env` y reemplace los valores ficticios. Los valores reales nunca se
guardan en el repositorio (anexo F del manual). La API no arranca si falta una variable
obligatoria o tiene un formato inválido: el mensaje dice cuál es.

### 5. Base de datos local

Mientras llega el entorno local completo (B06), la base de datos se levanta con un solo
contenedor. Complete en `.env` las contraseñas de `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y
`MIGRATION_DB_PASSWORD` y úselas también en `DATABASE_URL` y `DATABASE_MIGRATION_URL`. Desde la
raíz del proyecto, en PowerShell:

```bash
docker run --rm -d --name arza-postgres --env-file .env -p 5432:5432 -v "${PWD}/infra/postgres/init:/docker-entrypoint-initdb.d:ro" postgres:17
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Si el puerto 5432 ya está ocupado (por ejemplo, por un PostgreSQL instalado en Windows), use
`-p 5433:5432` y cambie `5432` por `5433` en las dos direcciones de `.env`. El contenedor no guarda
los datos al detenerlo (`docker stop arza-postgres`); al volver a crearlo, repita los tres pasos.

### 6. Levantar la API

```bash
pnpm --filter @arza/api dev
```

Abra http://localhost:4000/health (estado), http://localhost:4000/version (versión) y
http://localhost:4000/api/docs (documentación de la API). Con la base de datos del paso 5, /health
la muestra `up`; las colas y los archivos siguen `down` hasta el entorno local completo (B06). Detalles
en [`apps/api/README.md`](apps/api/README.md).

### 7. Levantar la web

La primera vez descargue el navegador de las pruebas (unos 300 MB):

```bash
pnpm e2e:install
```

Para ver la web, compile los paquetes compartidos y arránquela:

```bash
pnpm build
```

```bash
pnpm --filter @arza/web dev
```

Abra http://localhost:3000 (sitio público), http://localhost:3000/app (aplicación interna) y
http://localhost:3000/portal (portal del cliente). La pantalla «Estado del sistema» pide datos a la
API del paso 6; si la API está apagada, muestra el mensaje de error con el botón «Reintentar».
Detalles en [`apps/web/README.md`](apps/web/README.md) y [`packages/ui/README.md`](packages/ui/README.md).

## Comandos

| Comando                                         | Qué hace                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm check`                                    | Todas las verificaciones. Debe pasar antes de cada commit                         |
| `pnpm format` · `pnpm format:check`             | Da formato al código · comprueba el formato                                       |
| `pnpm lint`                                     | Análisis de código; falla con una sola advertencia                                |
| `pnpm typecheck`                                | Comprobación de tipos                                                             |
| `pnpm boundaries`                               | Fronteras entre módulos y aplicaciones (dependency-cruiser)                       |
| `pnpm unused`                                   | Archivos, exportaciones y dependencias sin uso (knip)                             |
| `pnpm test` · `pnpm test:int` · `pnpm test:e2e` | Pruebas unitarias · de integración (desde B03) · de extremo a extremo (desde B04) |
| `pnpm e2e:install`                              | Descarga el navegador de las pruebas de extremo a extremo (una vez por equipo)    |
| `pnpm build`                                    | Compila todas las aplicaciones y paquetes                                         |
| `pnpm db:migrate`                               | Aplica las migraciones pendientes de la base de datos                             |
| `pnpm db:seed` · `pnpm db:seed:demo`            | Datos semilla · semilla más dos empresas ficticias (nunca en producción)          |
| `pnpm secrets`                                  | Busca secretos en todo el historial de git (gitleaks)                             |
| `pnpm dev`                                      | Levanta api y web (la API desde B02, la web desde B04; el worker llega en B06)    |

Los comandos `pnpm infra:up` y `pnpm infra:reset` se agregan en el bloque B06.

## Integración continua

Cada pull request pasa por las diez verificaciones del numeral 11.4 en GitHub Actions; `main` solo
acepta cambios con la tarea «Verificaciones» en verde. Qué revisa cada una, qué hacer si falla y
cómo funciona Renovate: [`docs/runbooks/integracion-continua.md`](docs/runbooks/integracion-continua.md).
Las imágenes Docker se construyen con `docker build -f apps/api/Dockerfile -t arza-one/api .` (igual
con `web`).

## Controles antes de cada commit

Al ejecutar `git commit` se revisa automáticamente:

1. **Secretos**: si el cambio contiene una contraseña, llave o token, el commit se rechaza.
2. **Formato y análisis** de los archivos modificados.
3. **Mensaje**: debe seguir Conventional Commits, `tipo(modulo): descripción` en inglés y en
   imperativo; por ejemplo `feat(crm): add quote approval`. Tipos válidos: `feat`, `fix`,
   `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Estructura

```text
apps/api         Backend NestJS (bloque B02)
apps/worker      Trabajos en segundo plano (bloque B06)
apps/web         Sitio, aplicación interna y portal en Next.js (bloque B04)
packages/contracts  Esquemas, tipos y permisos compartidos entre api y web
packages/ui         Sistema de diseño (bloque B04)
packages/config     Configuración compartida de ESLint y pruebas de los controles
packages/templates  Plantillas de correo y PDF (bloques B16 y B20)
infra/postgres   Guion de preparación de la base de datos (bloque B03)
infra/compose    Docker Compose; hoy solo la copia temporal para OWASP ZAP (bloque B05)
infra/scripts    Guiones de operación y ayudantes de la integración continua (bloque B05)
.github          Flujos de GitHub Actions y plantilla de pull request (bloque B05)
docs/manual      Manual Maestro por capítulos
docs/adr         Decisiones de arquitectura
docs/bloques     Encargos de cada bloque y su cierre
docs/runbooks    Guías de operación
```

La estructura completa y las reglas de código están en el capítulo 11 del manual.
