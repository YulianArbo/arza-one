# Cierre del bloque B36A — Comunicados en el acceso

- Estado: **Terminado** con este pull request (la primera entrega, PR #84, ya está unida a `main`).
- Pedido por el propietario el 20/11/2026, en lugar del banco de fotos aleatorias de B22B. Plan
  aprobado ese mismo día («Sí, apruebo B36A»).
- Construido por Claude Code el 20/11/2026, en dos entregas.

## Qué se construyó

| Parte                        | Qué hace                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administración › Comunicados | Lista con vigencia (dd/mm/aaaa) y estado: programado, vigente, vencido o terminado. Crear, editar y terminar antes de tiempo, con confirmación. Imagen opcional con vista previa                |
| Cada comunicado              | Título (hasta 80 caracteres), texto (hasta 400), para quién (Personal, Clientes o ambos), fechas «Desde» y «Hasta», enlace opcional `https://` e imagen opcional PNG o JPG de hasta 2 MB        |
| Pantalla de acceso           | En escritorio, sobre el panel de la izquierda; en celular, debajo del formulario. Uno a la vez, con flechas, puntos y las flechas del teclado; nada cambia solo. Cambian con la pestaña elegida |
| Seguridad                    | Solo Dirección y Administrador de plataforma los administran. La lectura pública solo entrega los vigentes hoy de la empresa del sitio, sin autor, con límite de consultas                      |
| Mensaje del día              | Se conserva debajo de los comunicados. Sin comunicados vigentes, el acceso muestra solo el mensaje                                                                                              |

Detalle técnico en `apps/api/README.md` (sección «Comunicados del acceso»).

### Criterios de aceptación

| Criterio                                                                                   | Cómo se cumple                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Personal se ve en «Ingreso plataforma», Clientes en «Portal de clientes», Ambos en las dos | `audiencesFor()` en la API y prueba `announcements.int.test.ts`; en la web, `access-announcements.test.tsx` y e2e |
| No se ve antes de su inicio ni después de su fin (fechas de Colombia)                      | `announcementStatus()` con pruebas de los días límite; consulta pública con `starts_on ≤ hoy ≤ ends_on`           |
| Uno a la vez, con flechas, puntos y teclado; nada cambia solo                              | `AnnouncementCarousel`; pruebas unitarias y e2e                                                                   |
| Sin comunicados vigentes, solo el mensaje del día                                          | El carrusel no se dibuja con la lista vacía o si la API no responde                                               |
| Imagen revisada, limitada y sin romper la política de contenido                            | Carga de la foto de perfil (antivirus, PNG o JPG, 2 MB); se muestra desde la memoria del navegador (`blob:`)      |
| El punto público no expone vencidos, de otra empresa ni el autor                           | Pruebas de integración de vigencia, de aislamiento y de la imagen de un comunicado terminado (404)                |
| Permiso denegado, aislamiento y auditoría                                                  | `announcements.int.test.ts` y el recorrido global de auditoría con las 4 rutas nuevas                             |
| axe en claro y oscuro; sin desborde a 390 px                                               | e2e de Administración y del acceso                                                                                |
| `pnpm check` en verde                                                                      | Ver «Verificaciones»                                                                                              |

## Decisiones (20/11/2026)

1. Bloque propio, después de B22B; queda en el índice entre B36 y B37.
2. Se cargan en Administración, con vigencia de una fecha a otra; varios a la vez.
3. En el acceso, uno a la vez con flechas y puntos, sin cambio automático.
4. Público por comunicado: Personal, Clientes o ambos, según la pestaña del acceso.
5. Título, texto, enlace opcional e imagen opcional.
6. Permiso para Dirección y Administrador de plataforma.

### Decisiones técnicas menores

- El código quedó en el módulo `core` (Administración, M00), no en el de notificaciones como decía
  el borrador del bloque: el permiso es del grupo «Núcleo» y `core` ya resuelve la empresa del
  sitio público. La tabla es `core_announcements`.
- La imagen acepta PNG y JPG (no WebP), porque reusa la carga ya probada de la foto de perfil.
- Terminar un comunicado no lo borra: deja de verse y conserva su historia en la auditoría.
- Si el sitio no tiene empresa configurada (`PUBLIC_SITE_TAX_ID`), la lista pública sale vacía y el
  acceso sigue funcionando.
- La pestaña elegida en el acceso se comparte entre el formulario y el panel (`AudienceProvider`).

## Cómo probarlo en el navegador (paso a paso)

1. `pnpm infra:up`, `pnpm db:migrate` y `pnpm dev`; entre con un usuario de Dirección o
   Administrador de plataforma de la semilla.
2. Abra **Administración › Comunicados** y pulse «Crear comunicado». Escriba un título y un texto,
   elija «Personal y clientes», deje las fechas de hoy y guarde.
3. Cree otro solo para «Clientes», con una imagen PNG o JPG.
4. Cierre la sesión. En la pantalla de acceso, a la izquierda, verá el primer comunicado. Pase a
   «Portal de clientes»: verá los dos y podrá cambiar entre ellos con las flechas o los puntos.
5. En el celular (o con la ventana angosta), los comunicados aparecen debajo del formulario.
6. Vuelva a Administración y pulse «Terminar» en uno: desaparece del acceso de inmediato.

## Verificaciones

- **Primera entrega (PR #84):** CI completa en verde (9 verificaciones), incluidos knip, fronteras,
  pruebas de integración y despliegue a pruebas. En la CI aparecieron dos listas de control que
  faltaba actualizar (la de rutas públicas permitidas y el conteo de permisos); se corrigieron sin
  debilitarlas.
- **Segunda entrega (este PR):** en este equipo, pruebas unitarias del acceso y de comunicados en
  verde; pruebas de navegador del acceso, segundo factor, superficies, accesibilidad y sitio: 53/53;
  tipos, analizador y compilación de la web en verde. La CI completa corre en el PR.
- Integración de B36A contra la base real: 8 pruebas propias y el recorrido global de auditoría
  (405/405).

### Problemas reales que encontraron las pruebas (corregidos)

- Las pruebas de navegador que ya existían no simulaban la consulta nueva de comunicados: la
  simulación base de la API ahora responde «sin comunicados» por defecto.
- Al correr a la vez la compilación, las pruebas de navegador y las de integración, la base de
  datos local se reinició por falta de memoria. No fue el código: solas, todas pasan.

## Pendientes

- Ninguno del bloque. Idea para más adelante, si el dueño la pide: mostrar los comunicados también
  en Inicio y en el portal, para quien ya inició sesión.
