# infra/scripts

Guiones de operación del repositorio. Node los ejecuta directamente (sin compilar), por eso solo
usan sintaxis de TypeScript que se puede borrar.

## ci/ — ayudantes de la integración continua (B05)

| Guion                                                | Verificación (numeral 11.4) | Qué hace                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node infra/scripts/ci/check-migrations.ts <base>`   | 7. Migraciones              | Compara las migraciones con la rama base. Falla si una migración ya integrada cambió o si una nueva borra, renombra o vuelve obligatorio algo que la versión anterior usa (numeral 10.6)       |
| `node infra/scripts/ci/check-vulnerabilities.ts <f>` | 6. Dependencias             | Lee el informe JSON de osv-scanner y falla solo con vulnerabilidades altas o críticas (CVSS 7 o más, o etiqueta HIGH/CRITICAL). Los avisos sin severidad se listan para revisión, sin bloquear |

### Fase de contraer

Borrar o renombrar algo es legítimo cuando la versión anterior ya no lo usa (expandir, migrar,
contraer). En ese caso, la migración declara el motivo en una línea:

```sql
-- arza:contract la columna notes dejó de usarse desde v1.4.0
ALTER TABLE "crm_leads" DROP COLUMN "notes";
```

La marca queda a la vista en la revisión del pull request. Desactivar la seguridad por fila
(`DISABLE` o `NO FORCE ROW LEVEL SECURITY`) nunca se permite, ni con la marca (ADR-007).

## Pruebas

```bash
pnpm --filter @arza/infra-scripts test
```
