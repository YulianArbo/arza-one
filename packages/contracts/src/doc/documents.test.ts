import { describe, expect, it } from 'vitest';

import {
  createDocumentRequestSchema,
  createFolderRequestSchema,
  documentCodeSchema,
  isLoggedClassification,
  publishVersionRequestSchema,
  rejectVersionRequestSchema,
} from '../index.js';

const FOLDER = '01900000-0000-7000-8000-000000000001';
const PROCESS = '01900000-0000-7000-8000-000000000002';
const FILE = '01900000-0000-7000-8000-000000000003';
const PARTY = '01900000-0000-7000-8000-000000000004';
const REQUEST = '01900000-0000-7000-8000-000000000005';

const DOCUMENT = {
  folder_id: FOLDER,
  doc_type: 'PR',
  is_controlled: true,
  process_id: PROCESS,
  change_request_id: REQUEST,
  title: 'Control de documentos',
  classification: 'internal',
  owner_position_id: null,
  source_file_id: FILE,
  change_summary: 'Creación del documento',
};

describe('código del documento (PR-SGC-001)', () => {
  it('acepta TIPO-PROCESO-NNN, TIPO-NNN sin proceso (RIT-001) y el código de expediente', () => {
    for (const code of ['PR-SGC-001', 'PVE-SST-012', 'MN-TEC-002', 'RIT-001', 'DOC-2026-0001']) {
      expect(documentCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rechaza códigos sin el formato', () => {
    for (const code of ['PR-SGC-1', 'pr-sgc-001', 'RIT-1', 'DOC-26-0001']) {
      expect(documentCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe('documento nuevo', () => {
  it('un documento del SGC lleva su proceso', () => {
    expect(createDocumentRequestSchema.safeParse(DOCUMENT).success).toBe(true);
    const withoutProcess = { ...DOCUMENT, process_id: null };
    expect(createDocumentRequestSchema.safeParse(withoutProcess).success).toBe(false);
  });

  it('el Reglamento Interno de Trabajo es del SGC y no lleva proceso', () => {
    const rit = { ...DOCUMENT, doc_type: 'RIT', process_id: null };
    expect(createDocumentRequestSchema.safeParse(rit).success).toBe(true);
    expect(createDocumentRequestSchema.safeParse({ ...rit, process_id: PROCESS }).success).toBe(
      false,
    );
  });

  it('un documento del SGC nace de una solicitud de creación (B19)', () => {
    const withoutRequest = { ...DOCUMENT, change_request_id: null };
    expect(createDocumentRequestSchema.safeParse(withoutRequest).success).toBe(false);
  });

  it('un documento de expediente puede ir sin proceso ni solicitud', () => {
    const record = { ...DOCUMENT, is_controlled: false, process_id: null, change_request_id: null };
    expect(createDocumentRequestSchema.safeParse(record).success).toBe(true);
  });

  it('rechaza un tipo que no es del catálogo y campos de más', () => {
    expect(createDocumentRequestSchema.safeParse({ ...DOCUMENT, doc_type: 'pr' }).success).toBe(
      false,
    );
    expect(createDocumentRequestSchema.safeParse({ ...DOCUMENT, code: 'PR-SGC-001' }).success).toBe(
      false,
    );
  });
});

describe('carpetas y expedientes', () => {
  it('un expediente se liga a un tercero y una carpeta a ninguno', () => {
    const caseFile = { parent_id: null, name: 'Cliente', kind: 'case_file' };
    expect(createFolderRequestSchema.safeParse(caseFile).success).toBe(false);
    const linked = { ...caseFile, entity_type: 'party', entity_id: PARTY };
    expect(createFolderRequestSchema.safeParse(linked).success).toBe(true);
    const folder = { parent_id: null, name: 'Actas', entity_type: 'party', entity_id: PARTY };
    expect(createFolderRequestSchema.safeParse(folder).success).toBe(false);
  });
});

describe('pasos de una versión', () => {
  it('devolver exige el motivo', () => {
    expect(rejectVersionRequestSchema.safeParse({ note: 'no' }).success).toBe(false);
    expect(rejectVersionRequestSchema.safeParse({ note: 'Falta el alcance' }).success).toBe(true);
  });

  it('publicar acepta una fecha de vigencia opcional', () => {
    expect(publishVersionRequestSchema.safeParse({}).success).toBe(true);
    expect(publishVersionRequestSchema.safeParse({ effective_date: '2026-10-20' }).success).toBe(
      true,
    );
    expect(publishVersionRequestSchema.safeParse({ effective_date: '20/10/2026' }).success).toBe(
      false,
    );
  });

  it('solo lo confidencial y lo restringido va al registro de accesos', () => {
    expect(isLoggedClassification('confidential')).toBe(true);
    expect(isLoggedClassification('restricted')).toBe(true);
    expect(isLoggedClassification('internal')).toBe(false);
  });
});
