# ARZA ONE — instrucciones para Claude Code

Plataforma empresarial de ARZA TECH S.A.S. (Colombia). La especificación oficial es el
Manual Maestro MN-TEC-002, disponible por capítulos en `docs/manual/`. Ante cualquier
duda, el manual manda; si el manual no lo resuelve, pregunta antes de decidir.

## Cómo trabajar
- Trabaja un solo bloque a la vez (`docs/bloques/Bnn.md`). No adelantes bloques.
- Antes de escribir código: lee el bloque, los capítulos que cita y el código existente,
  y presenta un plan corto. Espera la aprobación del plan.
- El dueño del producto no es desarrollador: explica en español claro qué hiciste,
  cómo probarlo paso a paso y qué decisiones quedan a su cargo.
- Al terminar: ejecuta todas las verificaciones, actualiza la documentación y escribe
  el cierre en `docs/bloques/Bnn-cierre.md` (qué se hizo, cómo se probó, pendientes).
- Nunca despliegues a producción ni modifiques secretos. Nunca uses datos reales.

## Comandos
- `pnpm install` — instalar dependencias
- `pnpm dev` — levantar api, worker y web (requiere `pnpm infra:up`)
- `pnpm infra:up` / `pnpm infra:reset` — servicios locales en Docker / reiniciar datos
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:int` · `pnpm test:e2e`
- `pnpm db:migrate` · `pnpm db:seed` — migraciones y datos semilla
- `pnpm check` — todas las verificaciones; debe pasar antes de cada commit

## Arquitectura (no negociable)
- Monolito modular. Módulos en `apps/api/src/modules/<modulo>` con capas
  interface → application → domain → infrastructure. Las dependencias apuntan hacia abajo.
- Un módulo usa a otro solo por su `index.ts` o por eventos de dominio. Nunca leas
  tablas de otro módulo.
- Todo caso de uso que escribe: una transacción que incluye el evento de auditoría y
  los eventos de la bandeja de salida.
- Los contratos (esquemas Zod, tipos, permisos) viven en `packages/contracts` y los
  usan api y web. No dupliques tipos.
- El frontend nunca accede a la base de datos y nunca es la barrera de seguridad.

## Seguridad y datos
- Todo punto de la API declara autenticación, permiso y esquema de validación.
- Toda tabla de negocio lleva `tenant_id` y política RLS. Toda funcionalidad nueva
  incluye prueba de permiso denegado y de aislamiento entre empresas.
- Dinero: `numeric(18,2)` y decimal.js. Fechas: UTC en la base; America/Bogota al mostrar.
- Identificadores UUID v7. Códigos de negocio por el servicio de consecutivos.
- Nunca registres contraseñas, códigos, tokens ni datos personales sensibles.
- Secretos solo en variables de entorno. No escribas secretos en código ni en pruebas.
- Consultas siempre parametrizadas. Prohibido `any` y desactivar reglas del analizador.

## Estilo
- Código, tablas, columnas y commits en inglés. Interfaz, mensajes y documentación
  funcional en español de Colombia (trato de usted, fechas dd/mm/aaaa, pesos con $).
- Funciones cortas y de un propósito; nombres descriptivos; sin código muerto.
- Commits con Conventional Commits: `tipo(modulo): descripción`.
- No agregues dependencias sin justificar licencia permisiva y mantenimiento activo.
- No elimines ni debilites una prueba o un control para que algo pase. Si una prueba
  falla, corrige la causa o detente y explica.

## Definición de terminado
Criterios del bloque cumplidos · `pnpm check` en verde · pruebas de permiso, aislamiento
y auditoría · migraciones desde cero y sobre la versión anterior · estados de pantalla
y accesibilidad · documentación y OpenAPI actualizados · cierre del bloque escrito.

## Referencias (léelas cuando el bloque las cite; no las cargues completas sin necesidad)
- Arquitectura: `docs/manual/08-arquitectura-del-sistema.md`
- Repositorio y código: `docs/manual/11-repositorio-y-estandares-de-codigo.md`
- Base de datos: `docs/manual/12-base-de-datos.md`
- Backend y API: `docs/manual/13-diseno-del-backend.md`, `docs/manual/14-interfaz-de-programacion-api.md`
- Seguridad: `docs/manual/15-seguridad-de-la-informacion.md`
- Interfaz: `docs/manual/16-diseno-de-la-interfaz-de-usuario.md`
- Módulos: `docs/manual/17-especificacion-funcional-por-modulo.md`
- Decisiones: `docs/adr/` (léelas antes de proponer un cambio de arquitectura)
