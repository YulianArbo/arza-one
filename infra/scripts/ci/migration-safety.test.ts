import { describe, expect, it } from 'vitest';

import { applyContractMarker, findUnsafeStatements } from './migration-safety.ts';

function reasonsFor(sql: string): string[] {
  return findUnsafeStatements('m/migration.sql', sql).map((finding) => finding.reason);
}

/** Cambios que solo expanden: la versión anterior sigue funcionando. */
const EXPANDING_CHANGES = [
  'CREATE TABLE "crm_leads" ("id" UUID NOT NULL, "name" TEXT NOT NULL)',
  'ALTER TABLE "crm_leads" ADD COLUMN "notes" TEXT',
  'ALTER TABLE "crm_leads" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "crm_leads" ADD CONSTRAINT "name_present" CHECK ("name" IS NOT NULL)',
  'ALTER TABLE "crm_leads" ALTER COLUMN "notes" DROP NOT NULL',
  'ALTER TABLE "crm_leads" ALTER COLUMN "score" DROP DEFAULT',
  'ALTER TABLE "crm_leads" DROP CONSTRAINT "name_present"',
  'CREATE INDEX "crm_leads_name_idx" ON "crm_leads" ("name")',
  'DROP INDEX "crm_leads_name_idx"',
  'ALTER TABLE "crm_leads" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "crm_leads" FORCE ROW LEVEL SECURITY',
];

/** Cambios incompatibles con la versión anterior y la razón esperada. */
const BREAKING_CHANGES = [
  ['DROP TABLE "crm_leads"', 'borra un objeto'],
  ['ALTER TABLE "crm_leads" DROP COLUMN "notes"', 'borra un objeto'],
  ['ALTER TABLE "crm_leads" DROP "notes"', 'borra una columna'],
  ['DROP POLICY tenant_isolation ON "crm_leads"', 'borra un objeto'],
  ['ALTER TABLE "crm_leads" RENAME COLUMN "name" TO "full_name"', 'renombra'],
  ['ALTER TABLE "crm_leads" RENAME TO "crm_prospects"', 'renombra'],
  ['ALTER TABLE "crm_leads" ALTER COLUMN "score" TYPE BIGINT', 'cambia el tipo'],
  ['ALTER TABLE "crm_leads" ALTER COLUMN "notes" SET NOT NULL', 'vuelve obligatoria'],
  ['ALTER TABLE "crm_leads" ADD COLUMN "owner" UUID NOT NULL', 'columna obligatoria'],
  ['TRUNCATE "crm_leads"', 'borra datos'],
  ['DELETE FROM "crm_leads" WHERE "score" < 0', 'borra datos'],
];

describe('migraciones compatibles con la versión anterior', () => {
  it.each(EXPANDING_CHANGES)('acepta un cambio que solo expande: %s', (sql) => {
    expect(reasonsFor(sql)).toEqual([]);
  });

  it.each(BREAKING_CHANGES)('rechaza un cambio incompatible: %s', (sql, reason) => {
    const reasons = reasonsFor(sql);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain(reason);
  });
});

describe('seguridad y lectura de las sentencias', () => {
  it.each([
    'ALTER TABLE "crm_leads" DISABLE ROW LEVEL SECURITY',
    'ALTER TABLE "crm_leads" NO FORCE ROW LEVEL SECURITY',
  ])('marca como falla de seguridad desactivar la seguridad por fila: %s', (sql) => {
    const findings = findUnsafeStatements('m/migration.sql', sql);
    expect(findings.map((finding) => finding.severity)).toEqual(['security']);
  });

  it('ignora el texto de los comentarios', () => {
    const sql =
      '-- Antes se usaba DROP TABLE\n/* RENAME pendiente */\nCREATE TABLE "a" ("id" UUID)';
    expect(reasonsFor(sql)).toEqual([]);
  });

  it('revisa cada sentencia y resume la que falla', () => {
    const longName = 'x'.repeat(120);
    const findings = findUnsafeStatements(
      'm/migration.sql',
      `CREATE TABLE "a" ("id" UUID);\nDROP TABLE "${longName}";`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.statement).toMatch(/^DROP TABLE "x+\.\.\.$/);
    expect(findings[0]?.statement).toHaveLength(100);
  });
});

describe('fase de contraer declarada', () => {
  const dropColumn = 'ALTER TABLE "crm_leads" DROP COLUMN "notes";';
  const disableRls = 'ALTER TABLE "crm_leads" DISABLE ROW LEVEL SECURITY;';

  function remaining(sql: string): string[] {
    const findings = findUnsafeStatements('m/migration.sql', sql);
    return applyContractMarker(sql, findings).map((finding) => finding.severity);
  }

  it('permite el cambio destructivo cuando la migración declara su motivo', () => {
    const sql = `-- arza:contract la columna notes dejó de usarse desde v1.4.0\n${dropColumn}`;
    expect(remaining(sql)).toEqual([]);
  });

  it('exige un motivo: la marca vacía o muy corta no cuenta', () => {
    expect(remaining(`-- arza:contract\n${dropColumn}`)).toEqual(['compatibility']);
    expect(remaining(`-- arza:contract ya\n${dropColumn}`)).toEqual(['compatibility']);
  });

  it('nunca permite desactivar la seguridad por fila', () => {
    const sql = `-- arza:contract cambio de política aprobado en v2.0.0\n${disableRls}`;
    expect(remaining(sql)).toEqual(['security']);
  });
});
