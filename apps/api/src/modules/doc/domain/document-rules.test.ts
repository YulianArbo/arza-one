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
  it('quien elabora edita y envía a revisión cuando el PDF está listo', () => {
    expect(allowedActions({ status: 'draft', pdfReady: true }, AUTHOR)).toEqual(['edit', 'submit']);
    expect(allowedActions({ status: 'draft', pdfReady: false }, AUTHOR)).toEqual(['edit']);
  });

  it('otra persona no edita ni envía el borrador ajeno', () => {
    expect(allowedActions({ status: 'draft', pdfReady: true }, QUALITY)).toEqual([]);
  });

  it('quien elabora no aprueba ni devuelve su propia versión', () => {
    const author = { ...QUALITY, isAuthor: true };
    expect(allowedActions({ status: 'in_review', pdfReady: true }, author)).toEqual([]);
    expect(allowedActions({ status: 'in_review', pdfReady: true }, QUALITY)).toEqual([
      'reject',
      'approve',
    ]);
  });

  it('publicar y declarar obsoleta dependen del permiso', () => {
    expect(allowedActions({ status: 'approved', pdfReady: true }, QUALITY)).toEqual(['publish']);
    expect(allowedActions({ status: 'current', pdfReady: true }, QUALITY)).toEqual(['obsolete']);
    expect(allowedActions({ status: 'current', pdfReady: true }, AUTHOR)).toEqual([]);
  });

  it('una versión obsoleta ya no admite pasos', () => {
    expect(allowedActions({ status: 'obsolete', pdfReady: true }, QUALITY)).toEqual([]);
  });
});
