import { createHash } from 'node:crypto';

import { publicSignatureSchema, verifyDocumentResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  sendEmploymentSignature,
  signEmploymentAsCompany,
} from '../../../src/modules/contract/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  SignatureScenario,
  type Prepared,
  type SigningClient,
} from './support/signature-scenario.js';

// El recorrido completo de la firma electrónica (B25, numeral 19.2 y criterios de la ficha 17.7):
// Comercial prepara, la Dirección envía, el cliente firma con el código de su correo, la empresa
// firma de última y el documento firmado supera la verificación pública. Cambiar un solo byte del
// PDF firmado hace fallar la verificación.

const scenario = new SignatureScenario('firma recorrido');

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

interface EmploymentCase {
  readonly contractId: string;
  readonly envelopeId: string;
  readonly signerEmail: string;
  readonly director: Person;
}

/** El contrato laboral aprobado se envía con el caso de uso directo, sin pasar por la ruta. */
async function employmentEnvelope(
  sales: Person,
  client: SigningClient,
  director: Person,
): Promise<EmploymentCase> {
  const signer = client.signers[0];
  if (signer === undefined) throw new Error('Falta la persona que firma');
  const contractId = await scenario.approvedFor(sales, client);
  const envelopeId = await scenario.inTenant(async (tx) => {
    const contract = await tx.ctrContract.findUniqueOrThrow({ where: { id: contractId } });
    if (contract.pdfFileId === null || contract.pdfSha256 === null) throw new Error('Falta el PDF');
    const result = await sendEmploymentSignature(
      tx,
      { tenantId: scenario.tenant.id, userId: sales.id, at: scenario.clock.now(), meta: null },
      {
        contractId,
        personId: signer.personId,
        email: signer.email,
        companySignerId: director.id,
        pdf: { id: contract.pdfFileId, sha256: contract.pdfSha256 },
        expiresOn: scenario.day(10),
        message: null,
      },
    );
    return result.id;
  });
  return { contractId, envelopeId, signerEmail: signer.email, director };
}

/** La empresa firma de última y solo con verificación reciente de su cuenta. */
async function companyAfterRecentVerification(context: EmploymentCase): Promise<void> {
  const tenantId = scenario.tenant.id;
  const actor = {
    tenantId,
    userId: context.director.id,
    at: scenario.clock.now(),
    meta: null,
  };
  const principal = {
    tenantId,
    userId: context.director.id,
    sessionId: crypto.randomUUID(),
    csrfToken: 'fixture',
    signInComplete: true,
    recentlyVerified: false,
  };
  const target = { contractId: context.contractId, envelopeId: context.envelopeId };
  await expect(
    scenario.inTenant((tx) => signEmploymentAsCompany(tx, actor, principal, target)),
  ).rejects.toThrow();
  await scenario.inTenant((tx) =>
    signEmploymentAsCompany(tx, actor, { ...principal, recentlyVerified: true }, target),
  );
  await scenario.signatureWork();
}

it('envía el contrato laboral al colaborador antes de Dirección', async () => {
  const sales = await scenario.sales();
  const client = await scenario.signingClient(sales);
  const director = await scenario.signingDirector(sales);
  const context = await employmentEnvelope(sales, client, director);
  await scenario.signatureWork();
  const { token, ticket } = await scenario.ticketFor(context.signerEmail);
  expect((await scenario.publicSign('sign', { token, ticket, accept: true })).status).toBe(204);
  const envelope = await scenario.inTenant((tx) =>
    tx.sigEnvelope.findUniqueOrThrow({
      where: { id: context.envelopeId },
      include: { signers: { orderBy: { signOrder: 'asc' } } },
    }),
  );
  expect(envelope).toMatchObject({
    source: 'hr_contract',
    status: 'sent',
    signers: [{ status: 'signed' }, { userId: director.id, status: 'pending' }],
  });
  await companyAfterRecentVerification(context);
  expect(
    await scenario.inTenant((tx) =>
      tx.sigEnvelope.findUnique({ where: { id: context.envelopeId } }),
    ),
  ).toMatchObject({ status: 'completed', sealStatus: 'ready' });
});

function firstSigner(prepared: Prepared): { readonly email: string } {
  const [signer] = prepared.client.signers;
  if (signer === undefined) throw new Error('Falta el firmante');
  return signer;
}

/** Comercial prepara, pero solo la Dirección envía; el primer firmante recibe su enlace. */
async function send(sales: Person, prepared: Prepared): Promise<void> {
  expect(errorCode(await scenario.sendEnvelope(sales, prepared))).toBe('PERMISSION_DENIED');
  const sent = await scenario.sendEnvelope(prepared.director, prepared);
  expect(sent.status, sent.text).toBe(204);
  expect((await scenario.contractDetail(sales, prepared.contractId)).status).toBe('in_signature');
  await scenario.signatureWork();
  const invitation = scenario.lastMailTo(firstSigner(prepared).email);
  expect(invitation.subject).toContain('firme el documento CTR-');
  expect(invitation.text).toContain('Quedamos atentos a su firma.');
}

/** El cliente abre el enlace, pide el código, lo valida, lee el documento y firma. */
async function clientSigns(prepared: Prepared): Promise<void> {
  const { email } = firstSigner(prepared);
  const token = scenario.linkOf(email);
  const opened = publicSignatureSchema.parse((await scenario.publicSign('open', { token })).body);
  expect(opened).toMatchObject({ state: 'pending', code_locked: false, signed_copy: false });
  expect(opened.signer.email_hint).toMatch(/^fi\*\*\*@cliente\.test$/iu);
  const { ticket } = await scenario.ticketFor(email);
  const pdf = await scenario.publicSign('document', { token, ticket, document: 'original' });
  expect(pdf.status).toBe(200);
  expect(pdf.headers['content-type']).toContain('application/pdf');
  const signed = await scenario.publicSign('sign', { token, ticket, accept: true });
  expect(signed.status, signed.text).toBe(204);
}

/** La empresa firma de última; el worker arma el documento firmado y el contrato queda vigente. */
async function companySigns(sales: Person, prepared: Prepared) {
  const before = await scenario.envelope(sales, prepared.contractId);
  expect(before.signers.map((item) => item.status)).toEqual(['signed', 'pending']);
  const company = await scenario.companySigns(prepared.director, prepared.envelopeId);
  expect(company.status, company.text).toBe(204);
  expect((await scenario.signatureWork()).sealed).toBe(1);
  const envelope = await scenario.envelope(sales, prepared.contractId);
  expect(envelope).toMatchObject({ status: 'completed', chain_intact: true });
  expect(envelope.signed?.status).toBe('ready');
  const contract = await scenario.contractDetail(sales, prepared.contractId);
  expect(contract.status).toBe('active');
  expect(contract.signed?.signed_on).toBe(scenario.day(0));
  return { envelope, contract };
}

describe('recorrido completo de la firma', () => {
  it('preparar, enviar, firmar el cliente y la empresa, y recibir cada uno su copia', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.prepared(sales);
    await send(sales, prepared);
    await clientSigns(prepared);
    const { envelope } = await companySigns(sales, prepared);
    await scenario.signatureWork();
    const code = envelope.signed?.verification_code ?? '';
    expect(scenario.lastMailTo(firstSigner(prepared).email).text).toContain(code);
    expect(scenario.lastMailTo(prepared.director.email).subject).toContain('firmado por todas');
  });
});

describe('verificación pública', () => {
  it('el documento firmado la supera; cambiar un solo byte la hace fallar', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    await scenario.clientSigns(firstSigner(prepared).email);
    const { envelope, contract } = await companySigns(sales, prepared);
    const code = envelope.signed?.verification_code ?? '';
    const verified = await scenario.verify({ code });
    expect(verified.status, verified.text).toBe(200);
    expect(verifyDocumentResponseSchema.parse(verified.body)).toMatchObject({
      result: 'valid',
      document: { code: contract.code, signatures: 2, verification_code: code },
    });
    expect(verified.text).not.toContain(firstSigner(prepared).email);
    const original = await scenario.signedPdf(prepared.envelopeId);
    expect(sha256(original)).toBe(envelope.signed?.sha256);
    const byFile = await scenario.verify({ sha256: sha256(original) });
    expect(verifyDocumentResponseSchema.parse(byFile.body).result).toBe('valid');
    const tampered = Buffer.from(original);
    tampered[tampered.length - 2] = (tampered[tampered.length - 2] ?? 0) ^ 1;
    const altered = await scenario.verify({ sha256: sha256(tampered) });
    expect(verifyDocumentResponseSchema.parse(altered.body).result).toBe('not_found');
    const both = await scenario.verify({ code, sha256: sha256(tampered) });
    expect(verifyDocumentResponseSchema.parse(both.body).result).toBe('mismatch');
  });
});

describe('copia y auditoría', () => {
  it('el firmante descarga su copia firmada y cada paso queda en la auditoría', async () => {
    const sales = await scenario.sales();
    const prepared = await scenario.sentEnvelope(sales);
    const { email } = firstSigner(prepared);
    await scenario.clientSigns(email);
    expect((await scenario.companySigns(prepared.director, prepared.envelopeId)).status).toBe(204);
    await scenario.signatureWork();
    await scenario.signatureWork();
    const token = scenario.linkOf(email);
    const opened = publicSignatureSchema.parse((await scenario.publicSign('open', { token })).body);
    expect(opened).toMatchObject({ state: 'completed', signed_copy: true });
    const body = { token, document: 'signed', disposition: 'attachment' };
    const copy = await scenario.publicSign('document', body);
    expect(copy.status).toBe(200);
    expect(copy.headers['content-disposition']).toContain('firmado.pdf');
    expect(await scenario.auditActions(prepared.envelopeId)).toEqual(
      expect.arrayContaining([
        'signature.envelope.create',
        'signature.envelope.send',
        'signature.code.request',
        'signature.code.verify',
        'signature.sign',
        'signature.envelope.complete',
        'signature.envelope.seal',
        'signature.document.download',
      ]),
    );
    expect(await scenario.auditActions(prepared.contractId)).toContain(
      'contract.signature.electronic',
    );
  });
});
