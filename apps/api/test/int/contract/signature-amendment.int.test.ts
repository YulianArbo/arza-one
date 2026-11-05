import { envelopeListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { SignatureScenario, type SigningClient } from './support/signature-scenario.js';

// Firma electrónica de un otrosí (B25): igual que la del contrato, y al sellarse el otrosí rige y
// cambia el valor del contrato. Datos ficticios.

const scenario = new SignatureScenario('firma de otrosi');

/** Contrato vigente con un otrosí aprobado y su PDF listo. */
async function approvedAmendment(sales: Person, client: SigningClient) {
  const contractId = await scenario.approvedFor(sales, client);
  const signed = await scenario.contractStep(sales, contractId, 'register-signature', {
    file_id: await scenario.signedCopy(sales),
    signed_on: scenario.day(0),
  });
  expect(signed.status, signed.text).toBe(204);
  const amendments = `/v1/contracts/${contractId}/amendments`;
  const amendmentId = await scenario.create(amendments, sales, {
    summary: 'Se agrega soporte',
    body: 'Las partes acuerdan agregar soporte por seis meses.',
    effective_on: scenario.day(0),
    new_ends_on: null,
    new_value: '13000000.00',
  });
  const version = (await scenario.contractDetail(sales, contractId)).amendments[0]?.version ?? 0;
  const approve = `${amendments}/${amendmentId}/actions/approve`;
  expect((await scenario.action(approve, await scenario.director(), version, {})).status).toBe(204);
  await scenario.renderPdfs();
  return { contractId, amendmentId };
}

async function amendmentEnvelope(person: Person, amendmentId: string) {
  const path = `/v1/signature-envelopes?source=amendment&source_id=${amendmentId}`;
  const [envelope] = envelopeListResponseSchema.parse(
    (await scenario.get(path, person.session)).body,
  ).items;
  if (envelope === undefined) throw new Error('El otrosí no tiene proceso de firma');
  return envelope;
}

describe('firma electrónica de un otrosí', () => {
  it('firman el cliente y la empresa, y el otrosí queda firmado y rige', async () => {
    const sales = await scenario.sales();
    const client = await scenario.signingClient(sales);
    const director = await scenario.signingDirector(sales);
    const { contractId, amendmentId } = await approvedAmendment(sales, client);
    const body = scenario.envelopeBody(contractId, client, director, {
      source: 'amendment',
      source_id: amendmentId,
    });
    const envelopeId = await scenario.create('/v1/signature-envelopes', sales, body);
    const { version } = await amendmentEnvelope(sales, amendmentId);
    const send = `/v1/signature-envelopes/${envelopeId}/actions/send`;
    const sent = await scenario
      .action(send, director, version, {})
      .set('Idempotency-Key', crypto.randomUUID());
    expect(sent.status, sent.text).toBe(204);
    await scenario.signatureWork();
    await scenario.clientSigns(client.signers[0]?.email ?? '');
    const company = await scenario.companySigns(director, envelopeId);
    expect(company.status, company.text).toBe(204);
    await scenario.signatureWork();
    expect(await scenario.contractDetail(sales, contractId)).toMatchObject({
      value: '13000000.00',
      amendments: [{ status: 'signed' }],
    });
  });
});
