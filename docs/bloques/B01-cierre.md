# Cierre del bloque B01: Monorepo y herramientas de calidad

- Fecha: 05/10/2026
- Rama: `feat/b01-monorepo-y-herramientas-de-cal`
- Estado: en revisión (pendiente de la aprobación del Director General)

## Qué se construyó

Este bloque no tiene pantallas ni datos. Arma la estructura del proyecto y los controles
automáticos que revisan cada cambio antes de aceptarlo.

1. **Estructura del monorepo** (capítulo 11.1): `apps/api`, `apps/worker`, `apps/web` y
   `packages/contracts`, `ui`, `config` y `templates`, administrados con pnpm y Turborepo.
   Las aplicaciones son puntos de partida mínimos; su contenido real llega en los bloques
   B02 (API), B04 (web) y B06 (worker).
2. **Controles de calidad**:
   | Control            | Herramienta                                    | Qué rechaza                                                                                                                                                                                                       |
   | ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Tipos              | TypeScript estricto (`tsconfig.base.json`)     | Errores de tipos                                                                                                                                                                                                  |
   | Formato            | Prettier                                       | Código sin el formato acordado                                                                                                                                                                                    |
   | Análisis           | ESLint (`packages/config/eslint.js`)           | `any`, funciones de más de 40 líneas, archivos de más de 300, más de 3 niveles de anidación, nombres de archivo que no estén en kebab-case, desactivar una regla sin justificarlo. Falla con una sola advertencia |
   | Mensajes de commit | commitlint                                     | Mensajes que no siguen `tipo(modulo): descripción`                                                                                                                                                                |
   | Secretos           | gitleaks                                       | Contraseñas, llaves o tokens en el cambio                                                                                                                                                                         |
   | Fronteras          | dependency-cruiser (`.dependency-cruiser.cjs`) | Un módulo que usa el interior de otro, el núcleo que depende de un módulo de negocio, una capa que depende de una superior, la web que importa el backend, y otros casos                                          |
   | Código sin uso     | knip                                           | Archivos, exportaciones y dependencias sin uso                                                                                                                                                                    |
   | Ganchos de git     | lefthook                                       | Ejecuta secretos, formato y análisis antes de cada commit, y revisa el mensaje                                                                                                                                    |
3. **`pnpm check`**: ejecuta todos los controles en orden: formato, análisis, tipos,
   fronteras, código sin uso, pruebas, compilación y secretos.
4. **Documentación**: `README.md` con el arranque en un equipo nuevo, `.env.example` con las
   variables del anexo F (valores ficticios), plantilla de pull request
   (`.github/pull_request_template.md`) y las decisiones de arquitectura ADR-001 a ADR-022 en
   `docs/adr/`.

## Cómo se probó

- `pnpm check` termina en verde y sin advertencias.
- 23 pruebas automáticas:
  - `packages/config/test/commit-message.test.ts`: acepta mensajes válidos y rechaza cinco
    tipos de mensajes inválidos.
  - `packages/config/test/secrets.test.ts`: crea un repositorio temporal, prepara un archivo con
    un token falso generado en el momento y ejecuta exactamente el mismo comando que lefthook
    ejecuta antes de un commit. Comprueba que lo rechaza y que acepta un archivo sin secretos.
    El token falso nunca se guarda en el repositorio.
  - `packages/config/test/boundaries.test.ts`: con la configuración real de fronteras, comprueba
    que se permite usar otro módulo por su `index.ts` y que se rechazan cuatro tipos de
    violaciones.
  - `packages/config/test/eslint-rules.test.ts`: comprueba que el analizador rechaza `any`,
    exige justificar las excepciones y limita el tamaño de las funciones.
  - `packages/contracts/src/platform-defaults.test.ts`: zona horaria, idioma y moneda de Colombia.
- Demostración en el repositorio real:
  - `git commit -m "arreglé cosas"` fue rechazado («type may not be empty»).
  - Un commit con un token falso fue rechazado («leaks found: 1»).
  - Los commits de este bloque pasaron por los mismos controles. El control de mensajes llegó
    a rechazar mensajes del propio Claude Code por tener líneas demasiado largas.

## Cómo lo prueba usted, paso a paso

Este bloque no tiene pantallas. Se revisa en GitHub desde el navegador y con unos pocos
comandos que puede copiar y pegar en una terminal (PowerShell en Windows). Abra una terminal
**nueva** para que reconozca los programas instalados en esta sesión.

### En el navegador (GitHub)

1. Abra el pull request del bloque B01 en GitHub.
2. En la pestaña **Files changed**, confirme que existen las carpetas `apps/api`, `apps/worker`,
   `apps/web` y `packages/contracts`, `packages/ui`, `packages/config` y `packages/templates`.
3. Abra `docs/adr/README.md`: debe listar las decisiones ADR-001 a ADR-022, cada una con su
   enlace.
4. Abra `README.md`: debe explicar cómo arrancar el proyecto en un equipo nuevo.
5. En la pestaña **Commits**, confirme que todos los mensajes tienen la forma
   `tipo(modulo): descripción`.

### En la terminal

En la carpeta del proyecto (`C:\Users\yeaze\arza-one`), con la rama del bloque:

```bash
git checkout feat/b01-monorepo-y-herramientas-de-cal
```

**Criterio 1. Todo instala, analiza, compila y prueba sin errores:**

```bash
pnpm install
```

```bash
pnpm check
```

Debe terminar sin la palabra `ERROR` y, al final, mostrar «no leaks found».

**Criterio 2a. Un mensaje de commit inválido se rechaza:**

```bash
git commit --allow-empty -m "arreglé cosas"
```

Debe mostrar `✖ type may not be empty` y no crear el commit. Puede comprobarlo con
`git log --oneline -1`: el último commit sigue siendo el del bloque.

**Criterio 2b. Un secreto se rechaza.** No le pedimos escribir un secreto real ni uno falso a mano.
La prueba automática lo hace de forma segura:

```bash
pnpm --filter @arza/config test
```

Busque la línea «rechaza un commit que contiene un token» con una marca de aprobado.

**Criterio 3. Una violación de fronteras hace fallar la verificación.** Estos comandos crean
dos archivos de ensayo en los que el módulo «finance» usa el interior del módulo «crm».
Ejecútelos en PowerShell:

```powershell
New-Item -ItemType Directory -Force apps/api/src/modules/crm/domain, apps/api/src/modules/finance/application | Out-Null
Set-Content apps/api/src/modules/crm/domain/quote.ts "export const quote = 1;"
Set-Content apps/api/src/modules/finance/application/bill.ts "import { quote } from '../../crm/domain/quote.js'; export const bill = quote;"
pnpm boundaries
```

Debe mostrar `error no-module-internals` y `x 1 dependency violations`. Después borre los
archivos de ensayo:

```powershell
Remove-Item -Recurse -Force apps/api/src/modules
```

## Pruebas de permiso denegado, aislamiento entre empresas y auditoría

**No aplican en este bloque**, como aprobó el Director General en el plan: todavía no existen
usuarios, empresas, tablas ni puntos de la API. Empiezan en B03 (aislamiento por empresa con
seguridad por fila), B10 (permisos) y B11 (auditoría). La plantilla de pull request las exige
desde ahora en la lista de la definición de terminado.

## Decisiones tomadas

1. **TypeScript 6.0 en lugar de 7.0.** La versión 7.0 ya salió, pero la herramienta de análisis
   (typescript-eslint) todavía no la admite. Cuando la admita, se actualiza.
2. **Nombres de las carpetas de los módulos del núcleo**: `core`, `iam`, `party`, `doc`, `wf`,
   `privacy` y `audit`, iguales a los prefijos de permisos del anexo G. La regla «el núcleo no
   depende de los módulos de negocio» usa esa lista (`.dependency-cruiser.cjs`). Si un bloque
   futuro usa otro nombre, la lista se actualiza en ese bloque.
3. **Dirección de las capas.** Se prohíbe que una capa dependa de una superior: dominio →
   aplicación o interfaz, aplicación → interfaz, infraestructura → aplicación o interfaz.
4. **Dependencia nueva no listada en el capítulo 9**: `eslint-plugin-unicorn` (licencia MIT,
   mantenimiento activo), usada solo para exigir nombres de archivo en kebab-case (capítulo 11.2).
5. **Documentos oficiales sin reformatear.** Prettier no toca el manual, los encargos de bloque ni
   `CLAUDE.md`. Sí dio formato a la plantilla de ADR (solo agregó líneas en blanco).
6. **Turborepo**: se desactivó la función que escribe instrucciones para asistentes de IA
   (`agentGuidance: false`). Las instrucciones del proyecto viven en `CLAUDE.md`.
7. **Estado de los ADR**: «aceptada», con fecha 05/10/2026, porque ya están aprobados en el
   numeral 8.4 del manual.

## Pendientes

| Pendiente                                                                                                                                                                                                                                                                                   | Responsable                                        | Cuándo                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Decidir si la capa de dominio puede depender de la de infraestructura (o al revés). El manual dice «las dependencias apuntan hacia abajo» y pone infraestructura al final, pero también dice que el dominio «no conoce la base de datos». Hoy ninguna de las dos direcciones está prohibida | Director General, con una propuesta de Claude Code | Antes de B02                         |
| Iniciar sesión en GitHub CLI (`gh auth login`) para que Claude Code pueda abrir pull requests                                                                                                                                                                                               | Director General                                   | Ahora                                |
| Borrar el archivo `AGENTS.md` que creó Turborepo en la raíz. No está en git y no se volverá a crear                                                                                                                                                                                         | Director General (`Remove-Item AGENTS.md`)         | Ahora                                |
| Proteger la rama `main` en GitHub para que no admita cambios directos (capítulo 11.3)                                                                                                                                                                                                       | Director General                                   | B05                                  |
| Ejecutar los controles también en GitHub Actions, junto con Semgrep y osv-scanner (capítulo 11.4, paso 6)                                                                                                                                                                                   | Claude Code                                        | B05                                  |
| Umbral de cobertura de pruebas del capítulo 21 (90 % en dominio y aplicación)                                                                                                                                                                                                               | Claude Code                                        | B02, cuando exista código de dominio |
| Instalar Docker Desktop con WSL 2                                                                                                                                                                                                                                                           | Director General                                   | Antes de B03                         |
| `pnpm test:int` y `pnpm test:e2e` existen, pero todavía no hay pruebas de ese tipo                                                                                                                                                                                                          | Claude Code                                        | B03 y B04                            |
