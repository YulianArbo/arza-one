# Mantenimiento del 18/11/2026: PR de Renovate #52 y #53 e integración con Cloudflare

No es un bloque del plan: es mantenimiento de dependencias y de la integración continua,
aprobado por el propietario el 18/11/2026.

## Qué se encontró

| Verificación que fallaba                | PR       | Causa                                                                                                                                                                                                                                               |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6. Secretos, seguridad y dependencias   | #52, #53 | Aviso GHSA-fc5q-39xc-vjpf de `picomatch`. La excepción aprobada en el B35 llegó a `main` después de que Renovate abrió los PR.                                                                                                                      |
| 4. Pruebas unitarias (`@arza/api`)      | #53      | `@nestjs/swagger` 11.4.8 corrige cómo describe los campos que admiten vacío: 61 campos aparecían como «lista de textos» en `apps/api/openapi.json` cuando en realidad son «texto o vacío». El archivo guardado quedó desactualizado.                |
| 9. Pruebas en navegador y accesibilidad | #53      | `axe-core` 4.14 agrega la regla «etiqueta en el nombre» (WCAG 2.5.3). Ocho botones tenían un nombre para lectores de pantalla que no contenía su texto visible; por ejemplo, «Aprobar presupuesto» se anunciaba como «Aprobar el presupuesto 2026». |
| Workers Builds: arza-one (Cloudflare)   | Todos    | El panel de Cloudflare compila todas las ramas, pero la configuración solo existe en `deploy/cloudflare`. Ver `docs/runbooks/vista-previa-cloudflare.md` en esa rama.                                                                               |

## Qué se hizo

- **#52:** se actualizó contra `main`. Todas las verificaciones de GitHub pasan; solo queda
  la de Cloudflare, que se corrige en el panel de Cloudflare.
- **#53** (en la rama `claude/beautiful-planck-twsikg`, que contiene el #53 más estas correcciones):
  - `apps/api/openapi.json` regenerado. Ahora describe bien los campos que admiten vacío. No
    cambia ningún contrato: es la documentación la que se corrige.
  - `apps/web/src/components/app-shell/top-bar-menus.tsx`: el botón del menú del usuario toma
    su nombre accesible del texto visible, con «Menú del usuario» como texto solo para lectores
    de pantalla, y la foto o las iniciales quedan como decoración. No cambia nada visual.
  - Otros siete botones ahora empiezan su nombre accesible con el texto visible: «Mover a»
    (proyectos y embudo comercial), «Cerrar mes», «Exportar», «Aprobar presupuesto»,
    «Legalizar viaje», «Registrar recepción» y «Ver evidencia». Se ajustaron las pruebas que
    buscan esos botones por su nombre.
  - No se bajó de versión ninguna librería ni se debilitó ninguna prueba.

## Cómo se probó

Con Node 24 y las versiones del #53:

- `pnpm format:check`, `build:types`, `lint`, `typecheck`, `boundaries`, `unused`, `test`,
  `build` y `secrets`: en verde.
- `pnpm test:e2e`: 393 pruebas en verde con Chromium.
- Pruebas unitarias de la web: 783 en verde.
- `pnpm test:int` y el análisis de vulnerabilidades (osv-scanner) necesitan Docker y acceso a
  osv.dev, que no hay en el entorno de trabajo. Los cubre la integración continua del PR.

## Pendientes y decisiones del propietario

1. Fusionar #52 cuando le parezca. Si quiere que la verificación de Cloudflare deje de salir en
   rojo, haga antes el cambio del panel descrito en el runbook.
2. Para el #53: fusionar el PR de `claude/beautiful-planck-twsikg` (o pasar estos cambios
   al #53) y cerrar el #53 de Renovate.
3. Cloudflare sigue siendo un **ensayo**. Para usarlo como ambiente oficial se necesita un ADR
   nuevo que reemplace o complemente el ADR-017, aprobado por el Director General.
