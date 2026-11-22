import { describe, expect, it } from 'vitest';

import type { PermissionCode } from '../iam/permissions.js';
import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { SYSTEM_ROLES } from '../iam/roles.js';
import { actionTypeOf, createQmsActionSchema, verifyQmsActionSchema } from './actions.js';
import { saveContextItemSchema } from './context.js';
import {
  analyzeNonconformitySchema,
  canNonconformityStep,
  reportNonconformitySchema,
} from './nonconformities.js';
import { rateRisk, saveQmsRiskSchema } from './risks.js';

const ID = '01900000-0000-7000-8000-000000000001';

describe('riesgos y oportunidades (decisión 9)', () => {
  it('calcula el valor y el nivel en los bordes de cada rango', () => {
    expect(rateRisk(1, 1)).toEqual({ score: 1, level: 'low' });
    expect(rateRisk(2, 2)).toEqual({ score: 4, level: 'low' });
    expect(rateRisk(1, 5)).toEqual({ score: 5, level: 'moderate' });
    expect(rateRisk(3, 3)).toEqual({ score: 9, level: 'moderate' });
    expect(rateRisk(2, 5)).toEqual({ score: 10, level: 'high' });
    expect(rateRisk(4, 4)).toEqual({ score: 16, level: 'high' });
    expect(rateRisk(4, 5)).toEqual({ score: 20, level: 'critical' });
    expect(rateRisk(5, 5)).toEqual({ score: 25, level: 'critical' });
  });

  it('una oportunidad se aprovecha y un riesgo no', () => {
    const base = {
      kind: 'risk',
      process_id: ID,
      description: 'Pérdida de un cliente clave',
      probability: 3,
      impact: 4,
      treatment: 'mitigate',
      owner_id: ID,
      review_on: '2027-03-31',
    };
    expect(saveQmsRiskSchema.safeParse(base).success).toBe(true);
    expect(saveQmsRiskSchema.safeParse({ ...base, treatment: 'exploit' }).success).toBe(false);
    expect(saveQmsRiskSchema.safeParse({ ...base, kind: 'opportunity' }).success).toBe(false);
    expect(saveQmsRiskSchema.safeParse({ ...base, probability: 6 }).success).toBe(false);
  });
});

describe('contexto DOFA-PESTEL', () => {
  it('el factor PESTEL solo va en oportunidades y amenazas', () => {
    const base = { kind: 'threat', description: 'Nueva regulación', impact: 'high', year: 2026 };
    expect(saveContextItemSchema.safeParse({ ...base, pestel_factor: 'legal' }).success).toBe(true);
    const strength = { ...base, kind: 'strength', pestel_factor: 'legal' };
    expect(saveContextItemSchema.safeParse(strength).success).toBe(false);
  });
});

describe('flujo de la no conformidad (ficha 17.15)', () => {
  it('cada paso sale solo de sus estados', () => {
    expect(canNonconformityStep('contain', 'detected')).toBe(true);
    expect(canNonconformityStep('contain', 'contained')).toBe(false);
    expect(canNonconformityStep('analyze', 'reopened')).toBe(true);
    expect(canNonconformityStep('plan', 'contained')).toBe(false);
    expect(canNonconformityStep('close', 'planned')).toBe(false);
    expect(canNonconformityStep('close', 'verified')).toBe(true);
    expect(canNonconformityStep('reopen', 'closed')).toBe(false);
  });

  it('el análisis exige causa raíz y al menos una causa (decisión 7)', () => {
    const whys = { analysis: { method: 'five_whys', whys: ['No se revisó'] }, root_cause: 'x' };
    expect(analyzeNonconformitySchema.safeParse(whys).success).toBe(false);
    const ok = { ...whys, root_cause: 'No había lista de verificación' };
    expect(analyzeNonconformitySchema.safeParse(ok).success).toBe(true);
    const empty = { analysis: { method: 'ishikawa', causes: {} }, root_cause: ok.root_cause };
    expect(analyzeNonconformitySchema.safeParse(empty).success).toBe(false);
    const fish = { ...empty, analysis: { method: 'ishikawa', causes: { method: ['Sin guía'] } } };
    expect(analyzeNonconformitySchema.safeParse(fish).success).toBe(true);
  });

  it('un reporte pide qué y cuándo', () => {
    const report = { description: 'El informe salió sin revisar', detected_on: '2026-11-20' };
    expect(reportNonconformitySchema.parse(report)).toMatchObject({ process_id: null });
    expect(reportNonconformitySchema.safeParse({ ...report, description: 'x' }).success).toBe(
      false,
    );
  });
});

describe('acciones (decisiones 8 y 10)', () => {
  it('la de una no conformidad es correctiva y las demás de mejora', () => {
    expect(actionTypeOf('nonconformity')).toBe('corrective');
    expect(actionTypeOf('risk')).toBe('improvement');
    expect(actionTypeOf('improvement')).toBe('improvement');
  });

  it('una mejora no lleva origen y las demás sí', () => {
    const base = { description: 'Crear la lista', responsible_id: ID, due_on: '2026-12-15' };
    const improvement = { ...base, origin_type: 'improvement' };
    expect(createQmsActionSchema.safeParse(improvement).success).toBe(true);
    expect(createQmsActionSchema.safeParse({ ...improvement, origin_id: ID }).success).toBe(false);
    expect(createQmsActionSchema.safeParse({ ...base, origin_type: 'risk' }).success).toBe(false);
  });

  it('la verificación dice cómo se verificó', () => {
    const verify = { effective: true, verified_on: '2026-12-20', note: 'Revisé tres informes' };
    expect(verifyQmsActionSchema.safeParse(verify).success).toBe(true);
    expect(verifyQmsActionSchema.safeParse({ ...verify, note: '' }).success).toBe(false);
  });
});

describe('permisos de Calidad por rol (decisión 3)', () => {
  const codesOf = (role: SystemRoleCode) => systemRoleGrants(role).map((grant) => grant.code);
  const holders = (code: PermissionCode) =>
    SYSTEM_ROLES.map((role) => role.code).filter((role) => codesOf(role).includes(code));

  it('leen el módulo la Dirección, Calidad y el Auditor', () => {
    expect(holders('qms.read')).toEqual(['DIRECCION', 'CALIDAD', 'AUDITOR']);
  });

  it('las lecciones las lee todo el personal interno y nadie del portal', () => {
    const readers = holders('qms.lesson.read');
    expect(readers).toContain('COLABORADOR');
    expect(readers).toContain('ADMIN_PLATAFORMA');
    expect(readers).not.toContain('CLIENTE_ADMIN');
  });

  it('cierran y verifican la Dirección y Calidad; gestiona solo Calidad', () => {
    expect(holders('qms.nonconformity.close')).toEqual(['DIRECCION', 'CALIDAD']);
    expect(holders('qms.action.verify')).toEqual(['DIRECCION', 'CALIDAD']);
    expect(holders('qms.nonconformity.manage')).toEqual(['CALIDAD']);
  });

  it('todo colaborador reporta y atiende sus acciones, limitado a lo propio', () => {
    const grants = systemRoleGrants('COLABORADOR');
    expect(grants).toContainEqual({ code: 'qms.nonconformity.create', own: true });
    expect(grants).toContainEqual({ code: 'qms.action.manage', own: true });
  });
});
