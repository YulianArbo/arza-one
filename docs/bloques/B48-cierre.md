# Cierre del bloque B48 — Multiempresa

- Módulo: M00 · Fase F9 · Depende de B47.
- Construido por Claude Code el 27/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b48-multiempresa`, creada desde `main` con B47 fusionado (`55314990`, PR #103).
- Documentación del módulo: `docs/manual/datos/multiempresa.md`.
- Decisión técnica de la eliminación: ADR-028.
- **Bloque crítico: requiere revisión externa antes de fusionarlo.**

## Qué se construyó

- **Panel de empresas** (Administración → Empresas de la plataforma). Solo lo ve el operador de la plataforma, un rol nuevo que existe únicamente en ARZA TECH. Desde ahí:
  - **alta** de una empresa: razón social, NIT con dígito de verificación, plan y correo de su primer administrador. La empresa nace con sus catálogos, roles, plantillas y parámetros, y su administrador recibe la invitación;
  - **cambio de plan**, con un tope de usuarios propio si se necesita;
  - **suspensión** con motivo, y **reactivación**;
  - **eliminación** pedida, con plazo de 30 días y opción de cancelarla.
- **El operador ve la ficha, nunca el contenido.** Nombre, NIT, plan, usuarios y espacio usados, estado y fecha de la última exportación.
- **Suspensión que se cumple.** Una empresa suspendida:
  - no puede entrar (el mensaje lo dice claramente);
  - pierde todas sus sesiones abiertas al instante;
  - deja de correr sus tareas automáticas (correos, recordatorios, PDF, índice del asistente…);
  - conserva sus datos intactos.
- **Planes y límites** (Básico, Profesional, Empresarial). La base de datos impide pasar del máximo de usuarios internos, de usuarios del portal y del espacio de archivos; el asistente de IA se apaga si el plan no lo incluye. No hay cobros ni precios.
- **Marca propia** (Administración → Empresa y sedes): nombre para mostrar, color principal y logo. Se ven en la barra superior de la aplicación y del portal. Un color que no se lee sobre blanco se rechaza.
- **Exportación completa** (Empresa y sedes, solo la Dirección): un ZIP con una hoja CSV por cada tabla de la empresa, sus archivos originales, un índice con las filas de cada tabla y la huella de cada archivo, y una explicación. Nunca salen contraseñas, llaves del segundo factor, sesiones ni códigos de acceso. Queda disponible 7 días.
- **Eliminación definitiva** (ADR-028): borra todas las filas de la empresa en todas las tablas y sus archivos, en una sola transacción, sin apagar la seguridad de ninguna tabla. Queda una constancia mínima: razón social, NIT, fechas y huella de la exportación.
- **Tablas:** columnas nuevas en `core_tenants` y la tabla `core_tenant_exports` (migración `20261130000000_core_multi_tenant`).

### Criterios de aceptación

| Criterio                                             | Cómo se cumple                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dos empresas operan sin ningún dato cruzado          | Prueba que exporta una empresa y comprueba que el identificador de la otra no aparece en ninguna de sus 191 tablas; pruebas de marca, plan, suspensión y exportación entre empresas; la base de datos impide las funciones de la plataforma fuera de ARZA TECH. |
| La exportación de una empresa es completa            | La prueba compara el índice con la lista de tablas que da PostgreSQL (no el código) y, tabla por tabla, el número de filas del CSV con el que tiene la base de datos.                                                                                           |
| `pnpm check` en verde                                | Ver «Cómo se probó».                                                                                                                                                                                                                                            |
| Pruebas de permiso denegado, aislamiento y auditoría | Incluidas en `apps/api/test/int/tenancy/` y en el recorrido de auditoría de todas las rutas que escriben.                                                                                                                                                       |
| Documentación y cierre                               | Este documento, la ficha del módulo, ADR-028, guía de aceptación y capítulo del manual de usuario.                                                                                                                                                              |

## Decisiones (aprobadas el 27/11/2026)

1. **Quién maneja las empresas:** el rol «Operador de la plataforma», solo en ARZA TECH, con segundo factor (como toda cuenta interna) y confirmación de identidad en las acciones delicadas.
2. **El operador no ve el contenido** de las otras empresas; solo su ficha.
3. **La exportación la pide y descarga solo la Dirección** de la propia empresa, con identidad confirmada. El operador ve que existe, pero no la abre. Vence a los 7 días.
4. **No se exportan** contraseñas cifradas, claves del segundo factor, sesiones ni códigos de acceso.
5. **Formato:** una hoja CSV por tabla (abre en Excel) más los archivos originales.
6. **Eliminación total** tras 30 días, con exportación previa. Conservar libros y facturas es responsabilidad de la empresa cliente con su exportación. **Pendiente: validación del asesor jurídico.**
7. **ARZA TECH nunca se suspende ni se elimina.**
8. **Un correo pertenece a una sola empresa.**
9. **Planes con valores de ejemplo** (ver la ficha del módulo), para que usted los ajuste.
10. **Encender y apagar módulos por plan queda pendiente.**
11. **El logo en los PDF queda pendiente;** la marca se ve en la aplicación y el portal.
12. **Un solo PR, con commits pequeños;** sus cambios sueltos no se tocaron.

### Ajustes y decisiones técnicas tomadas durante la construcción

- **Cómo se borra una empresa.** La primera versión apagaba por un momento los controles de cada tabla. Las pruebas mostraron que eso choca con lo que escriben otras empresas al mismo tiempo (bloqueos mutuos). Se cambió por una «política de borrado» en cada tabla que solo usa el proceso de eliminación y solo para la empresa marcada. Ninguna tabla pierde su protección en ningún momento. **Cada tabla nueva de un bloque futuro debe traer su política de borrado;** una prueba lo vigila (ADR-028).
- **Tareas automáticas de empresas suspendidas.** En lugar de tocar cada módulo, la migración envuelve las 31 funciones que eligen a qué empresas atiende el worker para que salten las suspendidas. La verificación diaria de la auditoría sigue para todas.
- **Una empresa no puede cambiarse su propio plan ni su estado,** aunque el código fallara: la base de datos solo deja cambiar los datos legales y la marca. Una empresa creada fuera del panel (la semilla, las pruebas) siempre nace con el plan Profesional.
- **La descarga de la exportación es un POST** con protección antifalsificación, como las demás descargas de la plataforma.
- **El ZIP se escribe sin bibliotecas nuevas,** con la compresión que trae Node.
- **El asistente de IA** también revisa el plan: si no lo incluye, responde que el plan de la empresa no lo trae.

## Cómo probarlo en su navegador

Antes de empezar, una sola vez:

1. Aplique la migración nueva (agrega columnas y una tabla; no borra nada):

   ```powershell
   pnpm db:migrate
   ```

2. Cargue los permisos y el rol nuevo:

   ```powershell
   pnpm db:seed:demo
   ```

3. Dé el rol de operador a **su cuenta de ARZA TECH** (cambie el correo por el suyo; debe ser una cuenta de ARZA TECH):

   ```powershell
   pnpm iam:asignar-rol --correo su-correo@arzatech.test --rol OPERADOR_PLATAFORMA
   ```

4. Levante la plataforma:

   ```powershell
   pnpm dev
   ```

Luego, en el navegador (`http://localhost:3000/app`):

1. **Panel de empresas.** Entre con su cuenta de ARZA TECH y abra **Administración → Empresas de la plataforma**. Verá ARZA TECH («Opera la plataforma», sin botón para suspenderla) y las empresas de demostración «Demo Uno» y «Demo Dos».
2. **Alta.** Elija **Nueva empresa**. Escriba una razón social, el NIT `900123456-8`, el plan Básico y un correo de prueba que no exista. Confirme su identidad. La empresa aparece con plan Básico y 1 usuario interno (el administrador invitado). La invitación llega a Mailpit (`http://localhost:8025`).
3. **NIT errado.** Intente otra alta con `900123456-7`: la pantalla le dice que el dígito no corresponde.
4. **Plan.** En «Demo Uno» elija **Cambiar plan** → Empresarial. La fila muestra «Sin tope» de usuarios.
5. **Marca.** Abra **Administración → Empresa y sedes**. En «Marca de la empresa» escriba un nombre y el color `#1F4E79`, guarde y suba un logo PNG. Arriba a la derecha aparece su logo, el nombre y una línea del color. Pruebe el color `#FFEE88`: no lo deja.
6. **Exportación** (su cuenta debe tener también el rol Dirección). En «Exportación completa» elija **Generar exportación**. En unos minutos (el worker corre cada 5) queda «Lista para descargar». Descárguela y abra el ZIP: carpeta `tablas` con hojas CSV, carpeta `archivos`, `manifest.json` y `LEAME.txt`.
7. **Suspensión.** Abra otra ventana privada y entre con una cuenta de «Demo Dos». En el panel, suspenda «Demo Dos» con un motivo. En la otra ventana, al hacer clic, la sesión se cierra; al intentar entrar, el mensaje dice que el acceso de la empresa está suspendido. **Reactive** «Demo Dos» y vuelva a entrar.
8. **Eliminación (sin llegar a borrar).** Con «Demo Dos» suspendida, elija **Pedir eliminación**: si no tiene exportación, el aviso lo dice y no lo deja. Para probar todo el camino, genere primero la exportación desde una cuenta de Dirección de Demo Dos. Al pedirla con el NIT correcto, la fila muestra «Se elimina el dd/mm/aaaa». Elija **Cancelar eliminación** para que no se borre.
9. **Auditoría.** En **Auditoría** de ARZA TECH verá el alta, el cambio de plan, la suspensión, la reactivación y la eliminación pedida y cancelada, con su nombre.

## Cómo se probó

| Verificación                                                                                                         | Resultado en este equipo                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pruebas de contratos (`packages/contracts`)                                                                          | Pasaron. Se ajustaron los conteos: 22 filas del anexo G (antes 21) y 17 roles (antes 16).                                                                                                                        |
| Integración de multiempresa (`test/int/tenancy`, 6 archivos)                                                         | 26 de 26, junto con migraciones, permisos de la base de datos y firmas: 112 de 112 en 21 archivos.                                                                                                               |
| Recorrido de auditoría de las 12 rutas nuevas que escriben                                                           | 13 de 13 (incluye la revisión de que ninguna ruta queda sin su llamada).                                                                                                                                         |
| Suites de identidad, carga inicial, asistente, portal, documentos y núcleo                                           | 489 pruebas: 477 pasaron a la primera; las 12 que fallaron lo hicieron porque la base de datos de pruebas se reinició por falta de memoria en este equipo. Repetidas aparte, pasaron las 80 de esos 13 archivos. |
| Pruebas unitarias de la API, el worker y la web de lo tocado                                                         | Pasaron.                                                                                                                                                                                                         |
| Navegador (Playwright) de multiempresa, administración, menú y portal, claro y oscuro, con revisión de accesibilidad | 25 de 25 tras agregar a los datos simulados la marca y la lista de exportaciones.                                                                                                                                |
| `pnpm check` completo                                                                                                | Ver la sección de pendientes de verificación.                                                                                                                                                                    |

## Pendientes

- **Revisión externa** del bloque (es crítico).
- **Validación jurídica** de la eliminación total y del plazo de 30 días (decisión 6).
- **Ajustar los valores de los planes** (decisión 9) en `packages/contracts/src/tenancy/plans.ts`.
- **Encender y apagar módulos por plan** (decisión 10) y **logo en los PDF** (decisión 11): bloques futuros.
- **El NIT de una empresa eliminada queda reservado:** no se puede registrar otra empresa con el mismo NIT.
- **Enlaces públicos de firma y encuestas** de una empresa suspendida siguen respondiendo hasta que venzan; no dan acceso a la aplicación. Conviene cerrarlos en un bloque posterior.
- **Exportaciones muy grandes:** el formato ZIP usado admite hasta 4 GB y 65.535 archivos; una empresa más grande necesitará el formato ZIP64.
