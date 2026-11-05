import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { SignatureScenario } from './support/signature-scenario.js';

// Permiso denegado y aislamiento entre empresas de la firma electrónica (B25, capítulo 21 y
// numerales 15.3 y 15.5), y la evidencia que la base de datos no deja cambiar (numeral 19.3).

const scenario = new SignatureScenario('firma acceso');
const ENVELOPES = '/v1/signature-envelopes';

describe('permiso denegado', () => {
  it('el Contador lee pero no prepara, no envía, no anula ni firma', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.prepared(sales);
    const accountant = await scenario.person('contador', ['CONTADOR']);
    expect((await scenario.envelopes(accountant, prepared.contractId)).length).toBe(1);
    const base = `${ENVELOPES}/${prepared.envelopeId}/actions`;
    const body = scenario.envelopeBody(prepared.contractId, prepared.client, prepared.director);
    for (const response of [
      await scenario.post(ENVELOPES, accountant.session, body),
      await scenario.sendEnvelope(accountant, prepared),
      await scenario.post(`${base}/cancel`, accountant.session, { reason: 'Prueba' }),
    ]) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
    expect(errorCode(await scenario.companySigns(accountant, prepared.envelopeId))).toBe(
      'SIGNATURE_STATUS_INVALID',
    );
  });
});

describe('permiso denegado', () => {
  it('Comercial no anula; solo firma por la empresa la persona elegida', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const cancel = `${ENVELOPES}/${prepared.envelopeId}/actions/cancel`;
    expect(errorCode(await scenario.post(cancel, sales.session, { reason: 'No va' }))).toBe(
      'PERMISSION_DENIED',
    );
    await scenario.clientSigns(prepared.client.signers[0]?.email ?? '');
    const otherDirector = await scenario.director();
    const intruder = await scenario.companySigns(otherDirector, prepared.envelopeId);
    expect(errorCode(intruder)).toBe('SIGNATURE_STATUS_INVALID');
    const cancelled = await scenario.post(cancel, prepared.director.session, { reason: 'Cambió' });
    expect(cancelled.status, cancelled.text).toBe(204);
    const envelope = await scenario.envelope(sales, prepared.contractId);
    expect(envelope).toMatchObject({ status: 'cancelled', closed_reason: 'Cambió' });
    expect((await scenario.contractDetail(sales, prepared.contractId)).status).toBe('approved');
  });
});

describe('permiso denegado', () => {
  it('la firma de la empresa exige confirmar la identidad', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    await scenario.clientSigns(prepared.client.signers[0]?.email ?? '');
    scenario.clock.advance(31 * 60_000);
    const stale = await scenario.post(
      `${ENVELOPES}/${prepared.envelopeId}/actions/sign`,
      prepared.director.session,
      { accept: true },
    );
    expect(stale.status).toBe(403);
    expect((await scenario.companySigns(prepared.director, prepared.envelopeId)).status).toBe(204);
  });
});

describe('permiso denegado', () => {
  it('el Colaborador no ve los procesos de un contrato del que no es responsable', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.prepared(sales);
    const worker = await scenario.person('colaborador', ['COLABORADOR']);
    const path = `${ENVELOPES}?source=contract&source_id=${prepared.contractId}`;
    expect(errorCode(await scenario.get(path, worker.session))).toBe('CONTRACT_NOT_FOUND');
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve, no envía, no anula ni firma los procesos de esta', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const outsider = await scenario.person('direccion-otra', ['DIRECCION'], {
      tenantId: scenario.otherTenant.id,
    });
    const path = `${ENVELOPES}?source=contract&source_id=${prepared.contractId}`;
    expect(errorCode(await scenario.get(path, outsider.session))).toBe('CONTRACT_NOT_FOUND');
    const base = `${ENVELOPES}/${prepared.envelopeId}/actions`;
    for (const response of [
      await scenario.action(`${base}/send`, outsider, 1, {}).set('Idempotency-Key', 'k'.repeat(20)),
      await scenario.post(`${base}/cancel`, outsider.session, { reason: 'Intrusa' }),
      await scenario.companySigns(outsider, prepared.envelopeId),
      await scenario.post(`${ENVELOPES}/${prepared.envelopeId}/documents`, outsider.session, {
        document: 'original',
      }),
    ]) {
      expect(errorCode(response)).toBe('SIGNATURE_NOT_FOUND');
    }
    const foreign = scenario.envelopeBody(prepared.contractId, prepared.client, outsider);
    expect(errorCode(await scenario.post(ENVELOPES, outsider.session, foreign))).toBe(
      'CONTRACT_NOT_FOUND',
    );
  });
});

describe('evidencia inalterable', () => {
  it('la base de datos no deja cambiar ni borrar un evento, ni el documento que se firma', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const scope = tenantScope(scenario.db, scenario.tenant.id);
    const change = scope((tx) =>
      tx.sigEvent.updateMany({
        where: { envelopeId: prepared.envelopeId },
        data: { ip: '1.1.1.1' },
      }),
    );
    await expect(change).rejects.toThrow();
    const remove = scope((tx) =>
      tx.sigEvent.deleteMany({ where: { envelopeId: prepared.envelopeId } }),
    );
    await expect(remove).rejects.toThrow();
    const swap = scope((tx) =>
      tx.sigEnvelope.update({
        where: { id: prepared.envelopeId },
        data: { documentSha256: 'f'.repeat(64) },
      }),
    );
    await expect(swap).rejects.toThrow('El documento de un proceso de firma no cambia');
    expect((await scenario.envelope(sales, prepared.contractId)).chain_intact).toBe(true);
  });
});
