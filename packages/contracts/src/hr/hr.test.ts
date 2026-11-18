import { describe, expect, it } from 'vitest';

import {
  NEXT_STAGE,
  OPEN_CANDIDATE_STAGES,
  hireCandidateSchema,
  needsEndDate,
  registerCandidateSchema,
} from './selection.js';
import {
  FILE_ITEMS,
  ONBOARDING_TASKS,
  onboardingTaskListQuerySchema,
  updateFileEntrySchema,
} from './employees.js';

const ID = '01900000-0000-7000-8000-000000000001';

const HIRE = {
  position_id: ID,
  hire_date: '2026-12-01',
  contract_type: 'indefinite',
  work_mode: 'on_site',
  salary_band: 'BANDA_2',
  salary: '3500000',
  work_email: 'nueva.persona@arzatech.test',
  contract_file_id: ID,
  company_signer_id: ID,
};

const CONSENT = {
  notice_id: ID,
  accepted: true,
  purposes: ['RECRUITMENT'],
  channel: 'digital',
  granted_on: '2026-11-12',
};

describe('proceso de selección (ficha 17.13)', () => {
  it('avanza paso a paso hasta «seleccionado»; vincular y descartar son pasos aparte', () => {
    expect(NEXT_STAGE.applied).toBe('shortlisted');
    expect(NEXT_STAGE.shortlisted).toBe('evaluating');
    expect(NEXT_STAGE.evaluating).toBe('selected');
    expect(NEXT_STAGE.selected).toBeUndefined();
    expect(OPEN_CANDIDATE_STAGES).not.toContain('hired');
    expect(OPEN_CANDIDATE_STAGES).not.toContain('discarded');
  });

  it('registrar un candidato exige la autorización de tratamiento', () => {
    const person = {
      first_name: 'Ana',
      last_name: 'Prueba',
      id_type: 'CC',
      id_number: '1000000001',
      email: 'ana@correo.test',
    };
    const base = { vacancy_id: ID, person, source: 'referral', applied_on: '2026-11-12' };
    expect(registerCandidateSchema.safeParse(base).success).toBe(false);
    const parsed = registerCandidateSchema.parse({ ...base, consent: CONSENT });
    expect(parsed.talent_bank).toBe(false);
    expect(parsed.resume_file_id).toBeNull();
    expect(parsed.person.phone).toBeNull();
  });
});

describe('contrato laboral', () => {
  it('exige identificar el PDF que se enviará a firma', () => {
    expect(hireCandidateSchema.safeParse({ ...HIRE, contract_file_id: undefined }).success).toBe(
      false,
    );
    expect(
      hireCandidateSchema.safeParse({ ...HIRE, contract_file_id: 'contrato.pdf' }).success,
    ).toBe(false);
  });

  it('el término indefinido no lleva terminación; los demás sí', () => {
    expect(needsEndDate('indefinite')).toBe(false);
    expect(needsEndDate('fixed')).toBe(true);
    expect(hireCandidateSchema.safeParse(HIRE).success).toBe(true);
    expect(hireCandidateSchema.safeParse({ ...HIRE, contract_type: 'fixed' }).success).toBe(false);
    const fixed = { ...HIRE, contract_type: 'fixed', ends_on: '2027-11-30' };
    expect(hireCandidateSchema.safeParse(fixed).success).toBe(true);
    const backwards = { ...fixed, ends_on: '2026-11-30' };
    expect(hireCandidateSchema.safeParse(backwards).success).toBe(false);
  });

  it('el salario se escribe en pesos con hasta dos decimales', () => {
    expect(hireCandidateSchema.safeParse({ ...HIRE, salary: '3.500.000' }).success).toBe(false);
    expect(hireCandidateSchema.safeParse({ ...HIRE, salary: '3500000.50' }).success).toBe(true);
  });
});

describe('vinculación e historia laboral', () => {
  it('la vinculación crea la evaluación médica y la asignación de equipo', () => {
    expect(ONBOARDING_TASKS.medical_exam.responsible).toBe('sst');
    expect(ONBOARDING_TASKS.equipment.responsible).toBe('assets');
  });

  it('la lista de chequeo incluye el contrato firmado y la autorización de datos', () => {
    expect(FILE_ITEMS.signed_contract).toBeDefined();
    expect(FILE_ITEMS.data_authorization).toBeDefined();
  });

  it('solo un documento recibido lleva soporte', () => {
    const pending = { status: 'pending', file_id: ID };
    expect(updateFileEntrySchema.safeParse(pending).success).toBe(false);
    expect(updateFileEntrySchema.parse({ status: 'received', file_id: ID }).note).toBeNull();
  });

  it('el filtro de tareas pendientes llega como texto', () => {
    expect(onboardingTaskListQuerySchema.parse({ pending: 'true' }).pending).toBe(true);
    expect(onboardingTaskListQuerySchema.parse({}).pending).toBe(false);
  });
});
