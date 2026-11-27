# ADR-028: Eliminación de una empresa con exportación previa, plazo de espera y políticas de borrado

- Estado: aceptada
- Fecha: 27/11/2026
- Aprobó: Director General (decisiones 1 a 7 del plan del bloque B48)

## Contexto

B48 pide dar de alta, suspender, exportar y eliminar empresas. La plataforma guarda los datos de
todas las empresas en las mismas tablas, separados por `tenant_id` y seguridad por fila (ADR-007).
Muchas tablas solo admiten agregar (auditoría con cadena de huellas, evidencia de firma) y la
aplicación no tiene permiso de borrar en ninguna. Eliminar una empresa exige borrar todo lo suyo sin
abrir una puerta para que nadie borre lo de otra.

Además, la empresa cliente es la responsable de conservar sus libros, facturas y registros el tiempo
que exige la ley colombiana. ARZA TECH, como encargado, debe entregarle sus datos y borrarlos al
terminar el servicio.

## Decisión

1. **Quién.** Solo el operador de la plataforma (rol `OPERADOR_PLATAFORMA`, que existe únicamente en
   la empresa operadora, con identificador fijo `core_operator_tenant_id()`). Las funciones de la
   plataforma en la base de datos exigen ese contexto; la empresa operadora nunca se suspende ni se
   elimina (restricción `core_tenants_operator_active_check`).
2. **Antes de borrar, exportar.** La Dirección de la empresa genera su exportación completa (un ZIP
   con una hoja CSV por tabla, sus archivos y un índice con huellas). Pedir la eliminación exige una
   exportación lista de los últimos 30 días, la empresa suspendida y el NIT escrito.
3. **Plazo de espera.** Los datos se borran 30 días después de la solicitud. Hasta entonces el
   operador puede cancelarla.
4. **Borrado sin tocar la estructura.** Cada tabla con `tenant_id` tiene una política
   `<tabla>_purge` que solo vale para el dueño del esquema y solo para la empresa fijada en
   `app.purge_tenant`. Esa variable la fija únicamente `core_purge_tenant`, que corre como dueña, en
   el contexto de la empresa operadora, y solo para una empresa suspendida cuyo plazo venció. El
   borrado se hace en una transacción, tabla por tabla, en varias pasadas para respetar las llaves
   foráneas. La evidencia de firma admite el borrado solo en ese caso. Ninguna tabla pierde su
   seguridad por fila ni sus disparadores en ningún momento.
5. **Constancia mínima.** La fila de `core_tenants` queda con estado `closed`: razón social, NIT,
   fechas y la huella del índice de la exportación entregada. La auditoría del borrado queda en la
   empresa operadora.
6. **Archivos.** Después de la transacción, el worker borra la carpeta de la empresa y sus
   exportaciones en el almacenamiento. Si falla, la empresa queda cerrada y lo intenta cada día.

## Alternativas consideradas

- Desactivar por un momento los disparadores y la seguridad forzada de cada tabla · simple ·
  bloquea todas las tablas y choca con lo que escriben las demás empresas (bloqueos mutuos
  comprobados en las pruebas) · descartado.
- `session_replication_role = replica` · sin cambios de estructura · exige un permiso que solo
  concede el superusuario en cada ambiente · descartado.
- Borrado lógico (marcar y nunca borrar) · reversible · no cumple el deber de borrar al terminar el
  servicio · descartado.

## Consecuencias

- Toda tabla nueva con `tenant_id` debe crear su política `<tabla>_purge` en su migración. Si falta,
  `core_purge_tenant` no borra nada y lo dice (`TENANCY_PURGE_POLICY_MISSING`); la prueba
  `tenant-purge.int.test.ts` también falla.
- El NIT de una empresa cerrada sigue reservado: no se puede registrar otra con el mismo NIT.
- La validación jurídica del plazo y del alcance del borrado queda pendiente (cierre de B48).

## Cumplimiento

Pruebas de integración de B48: la eliminación borra todas las filas de la empresa en todas las
tablas del catálogo y ninguna de otra empresa, borra sus archivos y deja la seguridad por fila y los
disparadores intactos.
