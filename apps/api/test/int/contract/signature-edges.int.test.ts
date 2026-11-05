import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { DAY } from './support/contract-scenario.js';
import { SignatureScenario } from './support/signature-scenario.js';

// Casos límite de la firma electrónica (B25): la firma de un otrosí, un documento que aún no se
// puede firmar, firmantes repetidos y documentos que todavía no existen. Datos ficticios.

const scenario = new SignatureScenario('firma casos limite');

describe('fuente del proceso de firma', () => {
  it('un otrosí aprobado de un contrato vigente se prepara para firmar', async () => {
    const sales = await scenario.sales();
    const client = await scenario.signingClient(sales);
    const director = await scenario.signingDirector(sales);
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
    expect((await scenario.action(approve, director, version, {})).status).toBe(204);
    await scenario.renderPdfs();
    const body = scenario.envelopeBody(contractId, client, director, {
      source: 'amendment',
      source_id: amendmentId,
    });
    const created = await scenario.post('/v1/signature-envelopes', sales.session, body);
    expect(created.status, created.text).toBe(201);
    const listed = await scenario.get(
      `/v1/signature-envelopes?source=amendment&source_id=${amendmentId}`,
      sales.session,
    );
    expect(listed.status, listed.text).toBe(200);
  });
});

describe('documentos que aún no se firman', () => {
  it('un borrador no se prepara y un firmante no se repite', async () => {
    const sales = await scenario.sales();
    const client = await scenario.signingClient(sales);
    const director = await scenario.signingDirector(sales);
    const draft = await scenario.create(
      '/v1/contracts',
      sales,
      scenario.body(await scenario.templateId(sales), client.partyId),
    );
    const early = scenario.envelopeBody(draft, client, director);
    expect(errorCode(await scenario.post('/v1/signature-envelopes', sales.session, early))).toBe(
      'CONTRACT_PDF_NOT_READY',
    );
    const contractId = await scenario.approvedFor(sales, client);
    const [first] = client.signers;
    const twice = scenario.envelopeBody(contractId, client, director, {
      client_signer_ids: [first?.personId, first?.personId],
    });
    const response = await scenario.post('/v1/signature-envelopes', sales.session, twice);
    expect(response.status).toBe(422);
  });
});

describe('documentos del proceso', () => {
  it('el firmado y el certificado no se descargan antes de terminar', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.prepared(sales);
    const path = `/v1/signature-envelopes/${prepared.envelopeId}/documents`;
    const original = await scenario.post(path, sales.session, { document: 'original' });
    expect(original.status, original.text).toBe(200);
    for (const document of ['signed', 'certificate']) {
      const response = await scenario.post(path, sales.session, { document });
      expect(errorCode(response)).toBe('CONTRACT_PDF_NOT_READY');
    }
  });
});

describe('plazos y turnos de la firma', () => {
  it('la empresa no firma un proceso sin enviar ni uno vencido; vencido no se envía', async () => {
    const sales = await scenario.sales();
    const draft = await scenario.prepared(sales);
    const early = await scenario.companySigns(draft.director, draft.envelopeId);
    expect(errorCode(early)).toBe('SIGNATURE_STATUS_INVALID');
    const sent = await scenario.sentEnvelope(sales);
    scenario.clock.advance(16 * DAY);
    const director = await scenario.refresh(draft.director);
    expect(errorCode(await scenario.companySigns(director, sent.envelopeId))).toBe(
      'SIGNATURE_STATUS_INVALID',
    );
    expect(errorCode(await scenario.sendEnvelope(director, draft))).toBe(
      'SIGNATURE_STATUS_INVALID',
    );
  });

  it('un contrato que ya está vigente no vuelve a firma', async () => {
    const sales = await scenario.sales();
    const client = await scenario.signingClient(sales);
    const director = await scenario.signingDirector(sales);
    const contractId = await scenario.approvedFor(sales, client);
    const signed = await scenario.contractStep(sales, contractId, 'register-signature', {
      file_id: await scenario.signedCopy(sales),
      signed_on: scenario.day(0),
    });
    expect(signed.status, signed.text).toBe(204);
    const body = scenario.envelopeBody(contractId, client, director);
    expect(errorCode(await scenario.post('/v1/signature-envelopes', sales.session, body))).toBe(
      'SIGNATURE_STATUS_INVALID',
    );
  });
});
