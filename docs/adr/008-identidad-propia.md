# ADR-008: Identidad propia: sesiones en cookie segura, Argon2id y MFA con TOTP

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Se necesita control total de la autenticación sin depender de un proveedor externo.

## Decisión

Sesiones de servidor en cookie segura, contraseñas con Argon2id y segundo factor TOTP. Preparado para un proveedor OIDC en el futuro.

## Alternativas consideradas

- Proveedor de identidad externo · menos código · costo y dependencia · descartado por ahora.
- Tokens JWT en el navegador · sin estado · difíciles de revocar · descartado.

## Consecuencias

Control y revocación inmediata de sesiones. Se acepta la responsabilidad de implementarlo con cuidado (bloque crítico).

## Cumplimiento

Pruebas de los bloques B08 y B09.
