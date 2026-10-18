import { describe, expect, it } from 'vitest';

import {
  outputTemplateActions,
  printedFormVersion,
  recordActions,
  recordSequenceKey,
  templateActions,
} from './form-rules.js';

const author = { isAuthor: true, canFill: true, canApprove: true, attendsApproval: true };
const approver = { isAuthor: false, canFill: true, canApprove: true, attendsApproval: true };

describe('acciones sobre un registro diligenciado', () => {
  it('solo quien lo diligencia edita y envía su borrador', () => {
    const draft = { status: 'draft', pdfStatus: 'none', step: null } as const;
    expect(recordActions(draft, author)).toEqual(['edit', 'submit']);
    expect(recordActions(draft, approver)).toEqual([]);
  });

  it('quien lo diligenció no lo aprueba aunque tenga el permiso y la tarea', () => {
    const inApproval = { status: 'in_approval', pdfStatus: 'none', step: 'approval' } as const;
    expect(recordActions(inApproval, author)).toEqual([]);
    expect(recordActions(inApproval, approver)).toEqual(['approve', 'reject']);
    expect(recordActions(inApproval, { ...approver, attendsApproval: false })).toEqual([]);
  });

  it('se descarga cuando terminó y su PDF está listo', () => {
    const done = { status: 'completed', pdfStatus: 'ready', step: null } as const;
    expect(recordActions(done, approver)).toEqual(['download']);
    expect(recordActions({ ...done, pdfStatus: 'pending' }, approver)).toEqual([]);
  });
});

describe('acciones sobre un formato y una plantilla', () => {
  const manager = { manages: true, fills: true };

  it('el borrador se edita y se publica; el publicado se diligencia o se retira', () => {
    expect(
      templateActions({ status: 'draft', fillMode: 'manual', draftExists: true }, manager),
    ).toEqual(['edit', 'publish']);
    expect(
      templateActions({ status: 'published', fillMode: 'manual', draftExists: false }, manager),
    ).toEqual(['retire', 'new_version', 'fill']);
    expect(
      templateActions(
        { status: 'published', fillMode: 'system', draftExists: true },
        { manages: false, fills: true },
      ),
    ).toEqual([]);
  });

  it('una plantilla publicada solo da paso a una versión nueva', () => {
    expect(outputTemplateActions('draft', true)).toEqual(['edit', 'publish']);
    expect(outputTemplateActions('published', false)).toEqual(['new_version']);
    expect(outputTemplateActions('retired', false)).toEqual([]);
  });
});

describe('códigos', () => {
  it('cada formato lleva su propio consecutivo y su versión se imprime con dos cifras', () => {
    expect(recordSequenceKey('FT-COM-002')).toBe('doc.form_record.ft_com_002');
    expect(printedFormVersion(1)).toBe('01');
    expect(printedFormVersion(12)).toBe('12');
  });
});
