import { describe, expect, it } from 'vitest';

import {
  changeRequestCodeSchema,
  createChangeRequestSchema,
  createVersionRequestSchema,
  masterListQuerySchema,
} from '../index.js';

const DOCUMENT = '01900000-0000-7000-8000-000000000001';
const PROCESS = '01900000-0000-7000-8000-000000000002';

const CREATE = {
  action: 'create',
  document_id: null,
  doc_type: 'PR',
  process_id: PROCESS,
  title: 'Control de registros',
  justification: 'El proceso necesita un procedimiento para sus registros.',
};

describe('Solicitud de Acción Documental (FT-SGC-001)', () => {
  it('una creación trae el tipo, el proceso y el nombre del documento', () => {
    expect(createChangeRequestSchema.safeParse(CREATE).success).toBe(true);
    for (const missing of ['doc_type', 'title', 'process_id'] as const) {
      const parsed = createChangeRequestSchema.safeParse({ ...CREATE, [missing]: null });
      expect(parsed.success).toBe(false);
    }
  });

  it('una creación del RIT no lleva proceso', () => {
    const rit = { ...CREATE, doc_type: 'RIT', process_id: null };
    expect(createChangeRequestSchema.safeParse(rit).success).toBe(true);
  });

  it('modificar o eliminar exige el documento', () => {
    const update = { ...CREATE, action: 'update', doc_type: null, title: null, process_id: null };
    expect(createChangeRequestSchema.safeParse(update).success).toBe(false);
    const withDocument = { ...update, document_id: DOCUMENT };
    expect(createChangeRequestSchema.safeParse(withDocument).success).toBe(true);
    const obsolete = { ...withDocument, action: 'obsolete' };
    expect(createChangeRequestSchema.safeParse(obsolete).success).toBe(true);
  });

  it('exige una justificación de al menos diez caracteres', () => {
    const short = { ...CREATE, justification: 'Porque sí' };
    expect(createChangeRequestSchema.safeParse(short).success).toBe(false);
  });

  it('el código es SAD-AAAA-NNNN', () => {
    expect(changeRequestCodeSchema.safeParse('SAD-2026-0001').success).toBe(true);
    expect(changeRequestCodeSchema.safeParse('SAD-26-1').success).toBe(false);
  });
});

describe('versión nueva y Listado Maestro', () => {
  it('la solicitud de la versión nueva es opcional en el contrato (la API la exige en el SGC)', () => {
    const version = {
      title: 'Control de registros',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: DOCUMENT,
      change_summary: 'Ajuste del alcance',
    };
    const parsed = createVersionRequestSchema.parse(version);
    expect(parsed.change_request_id).toBeNull();
  });

  it('el Listado Maestro muestra por defecto los vigentes', () => {
    expect(masterListQuerySchema.parse({}).status).toBe('current');
    expect(masterListQuerySchema.safeParse({ doc_type: 'pr' }).success).toBe(false);
  });
});
