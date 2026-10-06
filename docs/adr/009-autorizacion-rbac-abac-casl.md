# ADR-009: Autorización RBAC más ABAC evaluada en el backend con CASL

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Los permisos dependen del rol y también del registro concreto (por ejemplo, ser miembro del proyecto).

## Decisión

Permisos por rol con condiciones sobre el registro, evaluados siempre en el backend con CASL. Nombres `modulo.recurso.accion` (anexo G).

## Alternativas consideradas

- Solo roles · simple · insuficiente para reglas por registro · descartado.
- Validar permisos en la web · cómodo · no es una barrera de seguridad · descartado.

## Consecuencias

Permisos expresivos y verificables. Toda funcionalidad necesita pruebas de permiso denegado.

## Cumplimiento

Pruebas de permiso denegado en cada bloque desde B10.
