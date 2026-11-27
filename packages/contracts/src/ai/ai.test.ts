import { describe, expect, it } from 'vitest';

import { systemRoleGrants } from '../iam/role-matrix.js';
import {
  AI_TARGET_USE_CASES,
  AI_USE_CASES,
  aiAssistRequestSchema,
  aiSearchRequestSchema,
  createAiPromptSchema,
  saveAiUseCaseSchema,
} from './index.js';

const ID = '01900000-0000-7000-8000-000000000001';

function codesOf(role: Parameters<typeof systemRoleGrants>[0]): string[] {
  return systemRoleGrants(role).map((grant) => grant.code);
}

describe('peticiones al asistente de IA (B47)', () => {
  it('pide una pregunta de entre 5 y 500 caracteres', () => {
    expect(aiSearchRequestSchema.safeParse({ question: 'hola' }).success).toBe(false);
    expect(aiSearchRequestSchema.safeParse({ question: 'x'.repeat(501) }).success).toBe(false);
    expect(aiSearchRequestSchema.parse({ question: '  ¿Cómo se aprueba un documento?  ' })).toEqual(
      { question: '¿Cómo se aprueba un documento?' },
    );
  });

  it('solo trabaja sobre registros con los usos que tienen destino', () => {
    expect(AI_TARGET_USE_CASES).not.toContain('doc_search');
    expect(AI_TARGET_USE_CASES.every((key) => key in AI_USE_CASES)).toBe(true);
    expect(aiAssistRequestSchema.safeParse({ use_case: 'doc_search', target_id: ID }).success).toBe(
      false,
    );
    expect(aiAssistRequestSchema.parse({ use_case: 'doc_summary', target_id: ID }).use_case).toBe(
      'doc_summary',
    );
  });
});

describe('gobierno del asistente de IA (B47)', () => {
  it('no activa un uso sin la evaluación de impacto aprobada (decisión 7)', () => {
    expect(saveAiUseCaseSchema.safeParse({ enabled: true, version: 0 }).success).toBe(false);
    expect(
      saveAiUseCaseSchema.safeParse({
        enabled: true,
        assessment_reference: 'EIPD-IA-001',
        version: 0,
      }).success,
    ).toBe(false);
    const enabled = saveAiUseCaseSchema.parse({
      enabled: true,
      assessment_reference: 'EIPD-IA-001',
      assessment_approved_on: '2026-11-26',
      version: 0,
    });
    expect(enabled.enabled).toBe(true);
    expect(saveAiUseCaseSchema.parse({ enabled: false, version: 1 }).assessment_reference).toBe(
      null,
    );
  });

  it('pide instrucciones con contenido', () => {
    expect(createAiPromptSchema.safeParse({ use_case: 'doc_summary', body: 'corta' }).success).toBe(
      false,
    );
  });
});

describe('permisos del asistente de IA (B47)', () => {
  it('reparte los permisos según la decisión 6', () => {
    expect(codesOf('COLABORADOR')).toContain('ai.assist.use');
    expect(codesOf('CLIENTE_ADMIN')).not.toContain('ai.assist.use');
    expect(codesOf('CLIENTE_USUARIO')).not.toContain('ai.assist.use');
    expect(codesOf('ADMIN_PLATAFORMA')).toEqual(
      expect.arrayContaining(['ai.prompt.manage', 'ai.request.read']),
    );
    expect(codesOf('CALIDAD')).toContain('ai.prompt.manage');
    expect(codesOf('CALIDAD')).not.toContain('ai.request.read');
    expect(codesOf('OFICIAL_DATOS')).toEqual(
      expect.arrayContaining(['ai.use_case.manage', 'ai.request.read']),
    );
    expect(codesOf('OFICIAL_DATOS')).not.toContain('ai.prompt.manage');
    expect(codesOf('AUDITOR')).toContain('ai.request.read');
    expect(codesOf('DIRECCION')).not.toContain('ai.use_case.manage');
  });
});
