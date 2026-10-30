import { publicSignatureSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SignatureScenario, type Prepared } from './support/signature-scenario.js';

// Reglas de la firma electrónica (B25, numeral 19.2 y ficha 17.7): el orden de firma, el código de
// seis números (diez minutos, cinco intentos), el rechazo, la llave contra envíos repetidos, el
// vencimiento y los recordatorios.

const scenario = new SignatureScenario('firma reglas');
const MINUTE = 60_000;

function emailOf(prepared: Prepared, index = 0): string {
  const signer = prepared.client.signers[index];
  if (signer === undefined) throw new Error('Falta el firmante');
  return signer.email;
}

describe('orden de firma', () => {
  it('el segundo firmante espera su turno; la empresa firma de última', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales, 2);
    expect(() => scenario.linkOf(emailOf(prepared, 1))).toThrow('No llegó correo con enlace');
    const early = await scenario.companySigns(prepared.director, prepared.envelopeId);
    expect(errorCode(early)).toBe('SIGNATURE_NOT_YOUR_TURN');
    await scenario.clientSigns(emailOf(prepared, 0));
    const token = scenario.linkOf(emailOf(prepared, 1));
    const opened = publicSignatureSchema.parse((await scenario.publicSign('open', { token })).body);
    expect(opened.state).toBe('pending');
    await scenario.clientSigns(emailOf(prepared, 1));
    const envelope = await scenario.envelope(sales, prepared.contractId);
    expect(envelope.signers.map((signer) => [signer.kind, signer.status])).toEqual([
      ['client', 'signed'],
      ['client', 'signed'],
      ['company', 'pending'],
    ]);
  });
});

describe('código de un solo uso', () => {
  it('al quinto código equivocado el enlace se bloquea; reenviar el enlace lo desbloquea', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const email = emailOf(prepared);
    const token = scenario.linkOf(email);
    expect((await scenario.publicSign('code', { token })).status).toBe(204);
    await scenario.signatureWork();
    const codes = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      codes.push(errorCode(await scenario.publicSign('verify-code', { token, code: '000000' })));
    }
    const invalid = Array.from({ length: 4 }, () => 'SIGNATURE_CODE_INVALID');
    expect(codes).toEqual([...invalid, 'SIGNATURE_CODE_LOCKED']);
    expect(errorCode(await scenario.publicSign('code', { token }))).toBe('SIGNATURE_CODE_LOCKED');
    const envelope = await scenario.envelope(sales, prepared.contractId);
    const signerId = envelope.signers[0]?.id ?? '';
    const path = `/v1/signature-envelopes/${prepared.envelopeId}/signers/${signerId}/actions/resend`;
    expect((await scenario.post(path, prepared.director.session)).status).toBe(204);
    await scenario.signatureWork();
    expect(scenario.linkOf(email)).not.toBe(token);
    expect(errorCode(await scenario.publicSign('open', { token }))).toBe('SIGNATURE_LINK_INVALID');
    await scenario.clientSigns(email);
  });
});

describe('código de un solo uso', () => {
  it('vence a los diez minutos, se pide uno por minuto y sin él no se firma', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const email = emailOf(prepared);
    const token = scenario.linkOf(email);
    expect((await scenario.publicSign('code', { token })).status).toBe(204);
    expect(errorCode(await scenario.publicSign('code', { token }))).toBe('SIGNATURE_CODE_TOO_SOON');
    await scenario.signatureWork();
    const code = /es: ([0-9]{6})/u.exec(scenario.lastMailTo(email).text)?.[1] ?? '';
    const fake = { token, ticket: 'x'.repeat(43), accept: true };
    expect(errorCode(await scenario.publicSign('sign', fake))).toBe('SIGNATURE_CODE_EXPIRED');
    scenario.clock.advance(11 * MINUTE);
    const late = await scenario.publicSign('verify-code', { token, code });
    expect(errorCode(late)).toBe('SIGNATURE_CODE_EXPIRED');
    await scenario.clientSigns(email);
  });
});

describe('rechazo', () => {
  it('un firmante rechaza con su motivo; el contrato vuelve a aprobado y se puede reenviar', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const { token, ticket } = await scenario.ticketFor(emailOf(prepared));
    const reason = 'El valor no corresponde a lo acordado.';
    const rejected = await scenario.publicSign('reject', { token, ticket, reason });
    expect(rejected.status, rejected.text).toBe(204);
    const envelope = await scenario.envelope(sales, prepared.contractId);
    expect(envelope.status).toBe('rejected');
    expect(envelope.closed_reason).toContain(reason);
    expect(envelope.signers[0]).toMatchObject({ status: 'rejected', reject_reason: reason });
    expect((await scenario.contractDetail(sales, prepared.contractId)).status).toBe('approved');
    const again = scenario.envelopeBody(prepared.contractId, prepared.client, prepared.director);
    expect((await scenario.post('/v1/signature-envelopes', sales.session, again)).status).toBe(201);
  });
});

describe('envío a firma', () => {
  it('con la misma llave no se repite; con otra llave ya no está por enviar', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.prepared(sales);
    const key = crypto.randomUUID();
    expect((await scenario.sendEnvelope(prepared.director, prepared, key)).status).toBe(204);
    expect((await scenario.sendEnvelope(prepared.director, prepared, key)).status).toBe(204);
    const other = await scenario.sendEnvelope(prepared.director, prepared);
    expect(errorCode(other)).toBe('IDEMPOTENCY_KEY_REUSED');
    const { version } = await scenario.envelope(sales, prepared.contractId);
    const path = `/v1/signature-envelopes/${prepared.envelopeId}/actions/send`;
    const noKey = await scenario.action(path, prepared.director, version, {});
    expect(errorCode(noKey)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const sends = await scenario.auditActions(prepared.envelopeId);
    expect(sends.filter((action) => action === 'signature.envelope.send')).toHaveLength(1);
  });
});

describe('envío a firma', () => {
  it('solo un contrato aprobado de un cliente verificado, con sus firmantes autorizados', async () => {
    const sales = await scenario.sales();
    const director = await scenario.signingDirector(sales);
    const unverified = await scenario.signingClient(sales, 1, false);
    const contractId = await scenario.approvedFor(sales, unverified);
    const body = scenario.envelopeBody(contractId, unverified, director);
    const blocked = await scenario.post('/v1/signature-envelopes', sales.session, body);
    expect(errorCode(blocked)).toBe('SIGNATURE_PARTY_NOT_VERIFIED');
    await scenario.approveDueDiligence(sales, unverified.partyId);
    const stranger = await scenario.signingClient(sales);
    const foreign = scenario.envelopeBody(contractId, stranger, director);
    const wrong = await scenario.post('/v1/signature-envelopes', sales.session, foreign);
    expect(errorCode(wrong)).toBe('SIGNATURE_SIGNERS_INVALID');
    const notDirector = scenario.envelopeBody(contractId, unverified, sales);
    const company = await scenario.post('/v1/signature-envelopes', sales.session, notDirector);
    expect(errorCode(company)).toBe('SIGNATURE_SIGNERS_INVALID');
    const late = { ...body, expires_on: scenario.day(31) };
    const tooFar = await scenario.post('/v1/signature-envelopes', sales.session, late);
    expect(errorCode(tooFar)).toBe('SIGNATURE_DATES_INVALID');
    expect((await scenario.post('/v1/signature-envelopes', sales.session, body)).status).toBe(201);
    const twice = await scenario.post('/v1/signature-envelopes', sales.session, body);
    expect(errorCode(twice)).toBe('SIGNATURE_STATUS_INVALID');
    const draft = await scenario.contract(sales);
    const notApproved = { ...body, source_id: draft };
    expect(
      errorCode(await scenario.post('/v1/signature-envelopes', sales.session, notApproved)),
    ).toBe('CONTRACT_PDF_NOT_READY');
  });
});

describe('recordatorios y vencimiento', () => {
  it('recuerda cada tres días con un enlace nuevo y, al pasar el plazo, el proceso vence', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const email = emailOf(prepared);
    await scenario.signatureFollowUp();
    await scenario.signatureWork();
    expect(scenario.lastMailTo(email).subject).not.toMatch(/^Recordatorio: /u);
    scenario.clock.advance(3 * 86_400_000 + MINUTE);
    expect((await scenario.signatureFollowUp()).reminders).toBeGreaterThanOrEqual(1);
    await scenario.signatureWork();
    expect(scenario.lastMailTo(email).subject).toMatch(/^Recordatorio: /u);
    scenario.clock.advance(13 * 86_400_000);
    expect((await scenario.signatureFollowUp()).expired).toBeGreaterThanOrEqual(1);
    // Pasaron 16 días: la sesión de la prueba venció.
    const fresh = await scenario.refresh(sales);
    const envelope = await scenario.envelope(fresh, prepared.contractId);
    expect(envelope).toMatchObject({ status: 'expired', signers: [{ reminders: 1 }, {}] });
    expect((await scenario.contractDetail(fresh, prepared.contractId)).status).toBe('approved');
    const token = scenario.linkOf(email);
    // El enlace vencía con el plazo: ya no sirve.
    expect(errorCode(await scenario.publicSign('open', { token }))).toBe('SIGNATURE_LINK_INVALID');
  });
});
