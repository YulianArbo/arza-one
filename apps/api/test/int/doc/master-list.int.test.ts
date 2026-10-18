import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Listado Maestro en línea y exportable (B19, RE-SGC-001 y ficha 17.4): los documentos del SGC con
// código, nombre, tipo, proceso, versión, fecha, estado y responsable.

const scenario = new SgcScenario('listado maestro');

beforeAll(async () => {
  await scenario.seed();
});

describe('Listado Maestro en línea', () => {
  it('muestra los vigentes del SGC con su versión y fecha; no los borradores ni los expedientes', async () => {
    const author = await scenario.quality('elabora');
    const published = await scenario.createDocument(author, { title: 'Listado publicado' });
    const current = await scenario.publishLatest(
      author,
      await scenario.quality('aprueba'),
      published,
    );
    const draft = await scenario.createDocument(author, { title: 'Listado en borrador' });
    const record = await scenario.createDocument(author, {
      folder_id: await scenario.folderId('EXP'),
      is_controlled: false,
      process_id: null,
    });
    const entries = await scenario.masterList(author);
    const ids = entries.map((entry) => entry.document_id);
    expect(ids).toContain(published);
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(record);
    const entry = entries.find((row) => row.document_id === published);
    expect(entry).toMatchObject({
      title: 'Listado publicado',
      doc_type: 'PR',
      doc_type_label: 'Procedimiento',
      process: { code: 'SGC' },
      version_label: '00',
      effective_date: current.effective_date,
      status: 'current',
    });
    expect(entries.map((row) => row.code)).toEqual([...entries.map((row) => row.code)].sort());
  });
});

describe('Listado Maestro: filtros', () => {
  it('filtra por estado, proceso, tipo y texto', async () => {
    const author = await scenario.quality('elabora');
    const plan = await scenario.createDocument(author, { doc_type: 'PL', title: 'Plan filtrado' });
    await scenario.publishLatest(author, await scenario.quality('aprueba'), plan);
    const byType = await scenario.masterList(author, '?doc_type=PL&q=filtrado');
    expect(byType.map((entry) => entry.document_id)).toEqual([plan]);
    const otherProcess = await scenario.processId('COM');
    expect(await scenario.masterList(author, `?process_id=${otherProcess}&q=filtrado`)).toEqual([]);
    const drafts = await scenario.masterList(author, '?status=draft');
    expect(drafts.every((entry) => entry.status === 'draft')).toBe(true);
  });
});

describe('exportar el Listado Maestro', () => {
  it('entrega un CSV con las columnas del RE-SGC-001 y queda en la auditoría', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author, { title: 'Exportado; con separador' });
    await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
    const { code } = await scenario.document(author, id);
    const response = await scenario.post('/v1/master-list/export', author.session, {
      q: 'Exportado',
    });
    expect(response.status, response.text).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/listado-maestro-\d{4}-\d{2}-\d{2}/u);
    const [header, row] = response.text.replace('﻿', '').split('\r\n');
    expect(header).toBe('Código;Nombre;Tipo;Proceso;Versión;Fecha;Estado;Responsable');
    expect(row).toMatch(
      new RegExp(
        `^${code};"Exportado; con separador";PR;SGC;00;\\d{2}/\\d{2}/\\d{4};Vigente;$`,
        'u',
      ),
    );
    const exports = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { action: 'doc.master_list.export' } }),
    );
    expect(exports.length).toBeGreaterThan(0);
  });

  it('exportar exige el permiso de exportar documentos', async () => {
    const commercial = await scenario.person('comercial', ['COMERCIAL']);
    expect(errorCode(await scenario.post('/v1/master-list/export', commercial.session))).toBe(
      'PERMISSION_DENIED',
    );
    expect((await scenario.get('/v1/master-list', commercial.session)).status).toBe(200);
  });
});
