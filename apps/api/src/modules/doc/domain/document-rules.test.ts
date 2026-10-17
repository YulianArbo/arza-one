import { describe, expect, it } from 'vitest';

import {
  allowedActions,
  controlledCodeSequence,
  isVersionSource,
  needsRendering,
  nextVersionNumber,
  versionLabel,
  type VersionActor,
} from './document-rules.js';

const NOBODY: VersionActor = {
  isAuthor: false,
  canEdit: false,
  canSubmit: false,
  canReview: false,
  canApprove: false,
  canPublish: false,
  canObsolete: false,
  attendsApproval: false,
  attendsAction: false,
};

const AUTHOR: VersionActor = { ...NOBODY, isAuthor: true, canEdit: true, canSubmit: true };
const QUALITY: VersionActor = {
  ...NOBODY,
  canEdit: true,
  canSubmit: true,
  canReview: true,
  canApprove: true,
  canPublish: true,
  canObsolete: true,
};

describe('número de versión', () => {
  it('empieza en 00 y avanza de uno en uno', () => {
    expect(versionLabel(nextVersionNumber(null))).toBe('00');
    expect(versionLabel(nextVersionNumber(0))).toBe('01');
    expect(versionLabel(12)).toBe('12');
  });
});

describe('código de PR-SGC-001', () => {
  it('un consecutivo sin año por tipo y proceso', () => {
    expect(controlledCodeSequence('PR', 'SGC')).toEqual({
      key: 'doc.code.pr.sgc',
      name: 'Documentos PR-SGC',
      prefix: 'PR-SGC',
      padding: 3,
    });
  });

  it('sin proceso, un consecutivo solo del tipo (RIT-001)', () => {
    expect(controlledCodeSequence('RIT', null)).toEqual({
      key: 'doc.code.rit',
      name: 'Documentos RIT',
      prefix: 'RIT',
      padding: 3,
    });
  });
});

describe('archivo fuente', () => {
  it('acepta PDF, Word y Excel; las imágenes no son una versión', () => {
    expect(isVersionSource('application/pdf')).toBe(true);
    expect(
      isVersionSource('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
    expect(isVersionSource('image/png')).toBe(false);
  });

  it('solo Word y Excel se convierten a PDF', () => {
    expect(needsRendering('application/pdf')).toBe(false);
    expect(
      needsRendering('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe(true);
  });
});

describe('pasos posibles de una versión', () => {
  const draft = { status: 'draft', pdfReady: true, step: 'drafting' } as const;
  const inReview = { status: 'in_review', pdfReady: true, step: 'review' } as const;
  const inApproval = { status: 'in_review', pdfReady: true, step: 'approval' } as const;
  const approved = { status: 'approved', pdfReady: true, step: 'publication' } as const;
  const current = { status: 'current', pdfReady: true, step: 'published' } as const;
  const attending = { ...QUALITY, attendsApproval: true, attendsAction: true };

  it('quien elabora edita y envía a revisión cuando el PDF está listo', () => {
    expect(allowedActions(draft, AUTHOR)).toEqual(['edit', 'submit']);
    expect(allowedActions({ ...draft, pdfReady: false }, AUTHOR)).toEqual(['edit']);
  });

  it('otra persona no edita ni envía el borrador ajeno', () => {
    expect(allowedActions(draft, attending)).toEqual([]);
  });

  it('quien elabora no aprueba ni devuelve su propia versión, aunque tenga la tarea', () => {
    expect(allowedActions(inReview, { ...attending, isAuthor: true })).toEqual([]);
    expect(allowedActions(inReview, attending)).toEqual(['reject', 'approve']);
  });

  it('decide solo quien tiene abierta la tarea del paso y su permiso', () => {
    expect(allowedActions(inReview, QUALITY)).toEqual([]);
    const reviewerOnly = { ...attending, canApprove: false };
    expect(allowedActions(inReview, reviewerOnly)).toEqual(['reject', 'approve']);
    expect(allowedActions(inApproval, reviewerOnly)).toEqual([]);
    expect(allowedActions({ ...inReview, step: null }, attending)).toEqual([]);
  });

  it('publicar exige la tarea de publicación; declarar obsoleta, el permiso', () => {
    expect(allowedActions(approved, attending)).toEqual(['publish']);
    expect(allowedActions(approved, QUALITY)).toEqual([]);
    expect(allowedActions(current, QUALITY)).toEqual(['obsolete']);
    expect(allowedActions(current, AUTHOR)).toEqual([]);
  });

  it('una versión obsoleta ya no admite pasos', () => {
    expect(allowedActions({ ...current, status: 'obsolete' }, attending)).toEqual([]);
  });
});
