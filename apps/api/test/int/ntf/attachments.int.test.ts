import {
  attachmentListSchema,
  createdResponseSchema,
  downloadLinkResponseSchema,
  type RecordRef,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Adjuntos de cualquier registro (B16, ficha 17.5): solo archivos propios que pasaron el
// antivirus; quien ve el registro los descarga; solo quien adjuntó los retira.

const scenario = new NtfScenario('adjuntos');

function query(ref: RecordRef): string {
  return `/v1/attachments?entity_type=${ref.entity_type}&entity_id=${ref.entity_id}`;
}

/** Archivo de la persona, guardado directamente en el estado dado (sin esperar al worker). */
async function file(person: Person, status: 'available' | 'scanning' = 'available') {
  const row = await scenario.db.withTenant(
    { tenantId: scenario.tenant.id, userId: person.id },
    (tx) =>
      tx.file.create({
        data: {
          tenantId: scenario.tenant.id,
          storageKey: `${scenario.tenant.id}/${crypto.randomUUID()}`,
          fileName: 'rut.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1200,
          scanStatus: status,
          ...(status === 'available' ? { sha256: '0'.repeat(64), scannedAt: new Date() } : {}),
        },
      }),
  );
  return row.id;
}

async function attach(person: Person, ref: RecordRef, fileId: string) {
  return scenario.post('/v1/attachments', person.session, {
    ...ref,
    file_id: fileId,
    label: 'RUT',
  });
}

async function attached(person: Person, ref: RecordRef): Promise<string> {
  const response = await attach(person, ref, await file(person));
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

describe('adjuntar un archivo a un tercero', () => {
  it('queda en la lista y cualquiera que vea el tercero lo descarga', async () => {
    const { ref, owner } = await scenario.party();
    const id = await attached(owner, ref);
    const reader = await scenario.people('lector', ['COMERCIAL']);
    const list = attachmentListSchema.parse((await scenario.get(query(ref), reader.session)).body);
    const item = list.items.find((row) => row.id === id);
    expect(item).toMatchObject({ label: 'RUT', can_delete: false });
    expect(item?.file).toMatchObject({ file_name: 'rut.pdf', mime_type: 'application/pdf' });
    const link = await scenario.post(`/v1/attachments/${id}/download-link`, reader.session);
    expect(link.status, link.text).toBe(200);
    expect(downloadLinkResponseSchema.parse(link.body).url).toMatch(/\/v1\/files\/downloads\//);
    expect(await scenario.actionsBy(owner)).toContain('ntf.attachment.create');
    expect(await scenario.actionsBy(reader)).toContain('doc.file.download_link');
  });

  it('solo se adjunta un archivo propio que ya pasó el antivirus', async () => {
    const { ref, owner } = await scenario.party();
    const colleague = await scenario.people('colega', ['ADMIN_FINANCIERO']);
    for (const fileId of [await file(colleague), await file(owner, 'scanning')]) {
      expect(errorCode(await attach(owner, ref, fileId))).toBe('NTF_FILE_NOT_ATTACHABLE');
    }
  });
});

describe('permiso denegado en los adjuntos', () => {
  it('solo quien adjuntó lo retira; quien no tiene permiso no adjunta ni descarga', async () => {
    const { ref, owner } = await scenario.party();
    const id = await attached(owner, ref);
    const colleague = await scenario.people('otro-finanzas', ['ADMIN_FINANCIERO']);
    expect(errorCode(await scenario.delete(`/v1/attachments/${id}`, colleague.session))).toBe(
      'PERMISSION_DENIED',
    );
    const sst = await scenario.people('sst', ['SST']);
    expect(errorCode(await attach(sst, ref, await file(sst)))).toBe('PERMISSION_DENIED');
    const download = await scenario.post(`/v1/attachments/${id}/download-link`, sst.session);
    expect(errorCode(download)).toBe('PERMISSION_DENIED');
    expect((await scenario.delete(`/v1/attachments/${id}`, owner.session)).status).toBe(204);
    expect(await scenario.actionsBy(owner)).toContain('ntf.attachment.delete');
    const list = attachmentListSchema.parse((await scenario.get(query(ref), owner.session)).body);
    expect(list.items.map((row) => row.id)).not.toContain(id);
  });
});

describe('aislamiento de los adjuntos', () => {
  it('la otra empresa no ve, ni descarga, ni retira los adjuntos de esta', async () => {
    const { ref, owner } = await scenario.party();
    const id = await attached(owner, ref);
    const outsider = await scenario.people(
      'externo',
      ['ADMIN_FINANCIERO'],
      scenario.otherTenant.id,
    );
    expect(errorCode(await scenario.get(query(ref), outsider.session))).toBe(
      'NTF_RECORD_NOT_FOUND',
    );
    const link = await scenario.post(`/v1/attachments/${id}/download-link`, outsider.session);
    expect(errorCode(link)).toBe('NTF_ATTACHMENT_NOT_FOUND');
    expect(errorCode(await scenario.delete(`/v1/attachments/${id}`, outsider.session))).toBe(
      'NTF_ATTACHMENT_NOT_FOUND',
    );
  });
});
