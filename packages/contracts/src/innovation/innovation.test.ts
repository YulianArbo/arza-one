import { describe, expect, it } from 'vitest';

import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { submitViabilitySchema, viabilityTotal } from './ideas.js';
import { addIpAuthorSchema, renewalAlertOn, saveIpAssetSchema } from './ip.js';
import { saveRoadmapItemSchema } from './roadmap.js';

const ID = '01900000-0000-7000-8000-000000000001';

function grant(role: SystemRoleCode, code: string) {
  return systemRoleGrants(role).find((item) => item.code === code) ?? null;
}

const TRADEMARK = {
  kind: 'trademark',
  title: 'ARZA ONE',
  holder: 'Empresa de prueba S.A.S.',
  responsible_id: ID,
} as const;

describe('permisos de Innovación (decisión 1)', () => {
  it('leen el módulo la Dirección, Calidad, el Líder técnico y el Auditor', () => {
    for (const role of ['DIRECCION', 'CALIDAD', 'LIDER_TECNICO', 'AUDITOR'] as const) {
      expect(grant(role, 'inn.read')).toEqual({ code: 'inn.read', own: false });
    }
    expect(grant('COLABORADOR', 'inn.read')).toBeNull();
  });

  it('todo colaborador propone ideas, solo las propias', () => {
    expect(grant('COLABORADOR', 'inn.idea.create')).toEqual({ code: 'inn.idea.create', own: true });
    expect(grant('LIDER_TECNICO', 'inn.idea.create')?.own).toBe(false);
  });

  it('evalúan y aprueban Calidad y la Dirección; el portafolio lo administra Calidad', () => {
    expect(grant('DIRECCION', 'inn.idea.approve')).not.toBeNull();
    expect(grant('CALIDAD', 'inn.idea.evaluate')).not.toBeNull();
    expect(grant('LIDER_TECNICO', 'inn.idea.approve')).toBeNull();
    expect(grant('CALIDAD', 'inn.ip.manage')).not.toBeNull();
    expect(grant('DIRECCION', 'inn.ip.manage')).toBeNull();
  });
});

describe('alerta de renovación (decisión 6)', () => {
  it('la marca avisa seis meses antes, también a fin de mes', () => {
    expect(renewalAlertOn('trademark', '2027-08-15')).toBe('2027-02-15');
    expect(renewalAlertOn('trademark', '2027-08-31')).toBe('2027-02-28');
    expect(renewalAlertOn('trademark', '2027-03-10')).toBe('2026-09-10');
  });

  it('el dominio avisa 60 días antes y el software no avisa', () => {
    expect(renewalAlertOn('domain', '2027-03-01')).toBe('2026-12-31');
    expect(renewalAlertOn('software', null)).toBeNull();
    expect(renewalAlertOn('trademark', null)).toBeNull();
  });
});

describe('formularios del módulo', () => {
  it('suma los criterios de viabilidad', () => {
    const input = submitViabilitySchema.parse({
      scores: { market: 5, technical: 4, strategic: 3, cost_benefit: 2, risk: 1 },
      concept: 'viable',
    });
    expect(viabilityTotal(input.scores)).toBe(15);
    expect(
      submitViabilitySchema.safeParse({ ...input, scores: { ...input.scores, risk: 6 } }).success,
    ).toBe(false);
  });

  it('un activo vigente exige número y vencimiento; el software no vence', () => {
    const registered = { ...TRADEMARK, status: 'registered', filed_on: '2025-01-10' };
    expect(saveIpAssetSchema.safeParse(registered).success).toBe(false);
    const complete = { ...registered, registry_number: 'SD-123', expires_on: '2035-01-10' };
    expect(saveIpAssetSchema.safeParse(complete).success).toBe(true);
    const software = { ...TRADEMARK, kind: 'software', expires_on: '2030-01-01' };
    expect(saveIpAssetSchema.safeParse(software).success).toBe(false);
    expect(
      saveIpAssetSchema.safeParse({ ...TRADEMARK, kind: 'domain', nice_classes: '9' }).success,
    ).toBe(false);
    expect(saveIpAssetSchema.safeParse({ ...TRADEMARK, status: 'filed' }).success).toBe(false);
  });
});

describe('cadena de titularidad y hoja de ruta', () => {
  it('cada autor trae el soporte que corresponde a su tipo', () => {
    const base = { user_id: ID, support_kind: 'employment_contract' } as const;
    expect(addIpAuthorSchema.safeParse(base).success).toBe(true);
    expect(addIpAuthorSchema.safeParse({ ...base, name: 'Otra' }).success).toBe(false);
    const external = { name: 'Autor externo', support_kind: 'employment_contract' } as const;
    expect(addIpAuthorSchema.safeParse(external).success).toBe(false);
    expect(
      addIpAuthorSchema.safeParse({ ...external, support_kind: 'contract', contract_code: 'CT-1' })
        .success,
    ).toBe(true);
    expect(addIpAuthorSchema.safeParse({ ...external, support_kind: 'document' }).success).toBe(
      false,
    );
  });

  it('el trimestre de la hoja de ruta se escribe como 2027-T1', () => {
    const item = { product: 'ARZA ONE', title: 'Portal', quarter: '2027-T1', owner_id: ID };
    expect(saveRoadmapItemSchema.safeParse(item).success).toBe(true);
    expect(saveRoadmapItemSchema.safeParse({ ...item, quarter: '2027-Q1' }).success).toBe(false);
  });
});
