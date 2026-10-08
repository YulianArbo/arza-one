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

### 3. Encender el entorno local

Abra Docker Desktop y espere a que diga «Engine running». Docker Desktop necesita unos 4 GB de
memoria libres. Luego, desde la carpeta del proyecto:

```bash
pnpm env:local
```

Crea el archivo `.env` con contraseñas al azar que solo sirven en su equipo. Si un puerto está
ocupado (por ejemplo, por un PostgreSQL instalado en Windows), escoge otro y se lo dice. Los
valores reales de los servidores nunca se guardan en el repositorio (anexo F del manual).

```bash
pnpm infra:up
```

Enciende la base de datos, las colas, el almacenamiento de archivos, el conversor a PDF, el
antivirus y la bandeja de correo de prueba, y carga datos ficticios. La primera vez descarga las
imágenes (unos 3,5 GB) y tarda varios minutos. Termina con la lista de servicios y sus direcciones.
Detalles y solución de problemas: [`docs/runbooks/entorno-local.md`](docs/runbooks/entorno-local.md).

### 4. Encender la aplicación

```bash
pnpm dev
```

Enciende la API, el worker (trabajos en segundo plano) y la web. Deje esa terminal abierta. Al
guardar un cambio en el código, la API y el worker se reinician solos. Abra:

- http://localhost:3000 (sitio público), http://localhost:3000/app (aplicación interna) y
  http://localhost:3000/portal (portal del cliente).
- http://localhost:3000/app/estado-del-sistema: debe decir «Todo funciona».
- http://localhost:4000/health (estado de la API) y http://localhost:4000/api/docs (documentación
  de la API).
- http://localhost:8025: bandeja de correo de prueba (Mailpit).

### 5. Probar el trabajo de ejemplo

En otra terminal, con `pnpm dev` encendido:

```bash
pnpm job:ejemplo demo-uno
```

En unos segundos llega a http://localhost:8025 el correo «Correo de prueba de ARZA ONE para Demo
Uno». Si falla, el worker lo reintenta solo.

### 6. Comprobar que todo funciona

La primera vez descargue el navegador de las pruebas (unos 300 MB):

```bash
pnpm e2e:install
```

```bash
pnpm check
```

Debe terminar sin errores. Si falla, lea el mensaje: indica qué control falló y en qué archivo.
Docker Desktop debe estar abierto: las pruebas de integración crean sus propias bases de datos,
colas y bandejas de correo desechables.

### 7. Apagar o empezar de cero

`Ctrl + C` en la terminal de `pnpm dev` apaga la aplicación. `pnpm infra:down` apaga los servicios
y conserva los datos; `pnpm infra:reset` borra los datos ficticios y vuelve a encender todo.

Más detalles en [`apps/api/README.md`](apps/api/README.md),
[`apps/worker/README.md`](apps/worker/README.md), [`apps/web/README.md`](apps/web/README.md) y
[`packages/ui/README.md`](packages/ui/README.md).

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
| `pnpm env:local`                                | Crea `.env` con contraseñas locales al azar y puertos libres (desde B06)          |
| `pnpm infra:up` · `pnpm infra:down`             | Enciende los servicios locales en Docker · los apaga conservando los datos        |
| `pnpm infra:reset`                              | Borra los datos locales ficticios y vuelve a encender todo                        |
| `pnpm infra:status`                             | Estado de cada servicio local (debe decir `healthy`)                              |
| `pnpm job:ejemplo [empresa]`                    | Encola el trabajo de ejemplo: un correo de prueba que llega a Mailpit             |
| `pnpm db:migrate`                               | Aplica las migraciones pendientes de la base de datos                             |
| `pnpm db:seed` · `pnpm db:seed:demo`            | Datos semilla · semilla más dos empresas ficticias (nunca en producción)          |
| `pnpm secrets`                                  | Busca secretos en todo el historial de git (gitleaks)                             |
| `pnpm dev`                                      | Levanta la API, el worker y la web; la API y el worker se reinician al guardar    |

## Integración continua

Cada pull request pasa por las diez verificaciones del numeral 11.4 en GitHub Actions; `main` solo
acepta cambios con la tarea «Verificaciones» en verde. Qué revisa cada una, qué hacer si falla y
cómo funciona Renovate: [`docs/runbooks/integracion-continua.md`](docs/runbooks/integracion-continua.md).
Las imágenes Docker se construyen con `docker build -f apps/api/Dockerfile -t arza-one/api .` (igual
con `web` y `worker`).

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
apps/worker      Trabajos en segundo plano con BullMQ (bloque B06)
apps/web         Sitio, aplicación interna y portal en Next.js (bloque B04)
packages/contracts  Esquemas, tipos y permisos compartidos entre api y web
packages/ui         Sistema de diseño (bloque B04)
packages/config     Configuración compartida de ESLint y pruebas de los controles
packages/templates  Plantillas de correo y PDF (bloques B16 y B20)
infra/postgres   Guion de preparación de la base de datos (bloque B03)
infra/compose    Docker Compose: entorno local (B06) y copia temporal para OWASP ZAP (B05)
infra/garage     Configuración del almacenamiento de archivos local (bloque B06)
infra/scripts    Guiones del entorno local (B06) y ayudantes de la integración continua (B05)
.github          Flujos de GitHub Actions y plantilla de pull request (bloque B05)
docs/manual      Manual Maestro por capítulos
docs/adr         Decisiones de arquitectura
docs/bloques     Encargos de cada bloque y su cierre
docs/runbooks    Guías de operación
```

La estructura completa y las reglas de código están en el capítulo 11 del manual.
