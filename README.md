# ARZA ONE

Plataforma empresarial de ARZA TECH S.A.S. La especificación oficial es el Manual Maestro
MN-TEC-002, disponible por capítulos en [`docs/manual/`](docs/manual/README.md). Las
instrucciones permanentes para Claude Code están en [`CLAUDE.md`](CLAUDE.md).

## Arranque en un equipo nuevo

### 1. Programas necesarios

| Programa                   | Versión           | Cómo instalarlo en Windows                                  |
| -------------------------- | ----------------- | ----------------------------------------------------------- |
| Git                        | Vigente           | `winget install --id Git.Git -e`                            |
| Node.js                    | 24 LTS o superior | `winget install --id OpenJS.NodeJS.LTS -e`                  |
| pnpm                       | 12 o superior     | `npm install -g pnpm`                                       |
| gitleaks                   | 8 o superior      | `winget install --id Gitleaks.Gitleaks -e`                  |
| GitHub CLI (opcional)      | Vigente           | `winget install --id GitHub.cli -e` y luego `gh auth login` |
| Docker Desktop (desde B03) | Vigente           | Ver capítulo 23.3 del manual (requiere WSL 2)               |

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

### 4. Variables de entorno

Copie `.env.example` como `.env` y reemplace los valores ficticios. Los valores reales nunca se
guardan en el repositorio (anexo F del manual). Por ahora ninguna aplicación las usa; se
necesitan a partir del bloque B02.

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
| `pnpm build`                                    | Compila todas las aplicaciones y paquetes                                         |
| `pnpm secrets`                                  | Busca secretos en todo el historial de git (gitleaks)                             |
| `pnpm dev`                                      | Levanta api, worker y web (desde B02 y B04)                                       |

Los comandos `pnpm infra:up`, `pnpm infra:reset`, `pnpm db:migrate` y `pnpm db:seed` se
agregan en los bloques B03 y B06.

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
docs/manual      Manual Maestro por capítulos
docs/adr         Decisiones de arquitectura
docs/bloques     Encargos de cada bloque y su cierre
docs/runbooks    Guías de operación
```

La estructura completa y las reglas de código están en el capítulo 11 del manual.
