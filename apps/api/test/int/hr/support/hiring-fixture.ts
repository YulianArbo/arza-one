import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { hrCreatedResponseSchema, type HireCandidate } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import { bogotaToday } from '../../../../src/modules/core/index.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { consentFor, personBody } from '../../party/support/party-scenario.js';
import { registrationBody } from './candidate-fixture.js';

/** Cuerpo de la preparación del contrato: la ruta completa la terminación y el mensaje. */
export type HiringBody = Omit<HireCandidate, 'ends_on' | 'message'>;

export interface HiringFixture {
  readonly recruiter: Person;
  readonly director: Person;
  readonly body: HiringBody;
  readonly prepare: (input?: HiringBody) => request.Test;
}

/** Persona de la Dirección con ficha de tercero: firma por la empresa. */
async function directorParty(s: AccessScenario): Promise<string> {
  const sales = await s.person('terceros', ['COMERCIAL']);
  const party = await s.post('/v1/parties', sales.session, {
    ...personBody(),
    consent: await consentFor(s),
  });
  expect(party.status, party.text).toBe(201);
  return hrCreatedResponseSchema.parse(party.body).id;
}

/** Candidato registrado y pasado a «seleccionado», con su cargo recién creado. */
async function selectedCandidate(
  s: AccessScenario,
  recruiter: Person,
  directorId: string,
  partyId: string,
) {
  const tenantId = s.tenant.id;
  const registered = await s
    .post('/v1/hr/candidates', recruiter.session, await registrationBody(s))
    .set('Idempotency-Key', crypto.randomUUID());
  expect(registered.status, registered.text).toBe(201);
  const { id: candidateId } = hrCreatedResponseSchema.parse(registered.body);
  return s.inTenant(async (tx) => {
    await tx.user.update({ where: { id: directorId }, data: { partyId } });
    const unit = await tx.orgUnit.create({
      data: {
        tenantId,
        code: `HR${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: 'Talento Humano',
        kind: 'area',
      },
    });
    const position = await tx.position.create({
      data: { tenantId, orgUnitId: unit.id, name: 'Analista' },
    });
    const candidate = await tx.hrCandidate.update({
      where: { id: candidateId },
      data: { stage: 'selected' },
    });
    return { position, candidate };
  });
}

/** PDF del contrato ya cargado y aprobado por el antivirus. */
async function contractFile(s: AccessScenario, recruiter: Person): Promise<string> {
  const tenantId = s.tenant.id;
  const content = samplePdf('Contrato laboral de prueba');
  const storageKey = `${tenantId}/${crypto.randomUUID()}`;
  await storage().put(
    { key: storageKey, contentType: 'application/pdf', sizeBytes: content.length },
    Readable.from([content]),
  );
  const file = await s.db.withTenant({ tenantId, userId: recruiter.id }, (tx) =>
    tx.file.create({
      data: {
        tenantId,
        storageKey,
        fileName: 'contrato.pdf',
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        scanStatus: 'available',
        scannedAt: s.clock.now(),
        sha256: createHash('sha256').update(content).digest('hex'),
      },
    }),
  );
  return file.id;
}

function hiringBody(
  s: AccessScenario,
  positionId: string,
  candidateId: string,
  fileId: string,
  directorId: string,
): HiringBody {
  return {
    position_id: positionId,
    hire_date: bogotaToday(s.clock.now()),
    contract_type: 'indefinite',
    work_mode: 'on_site',
    salary_band: 'BANDA_2',
    salary: '3500000',
    work_email: `${candidateId}@arza.test`,
    contract_file_id: fileId,
    company_signer_id: directorId,
  };
}

/** La misma preparación con la misma clave de idempotencia, para repetir o corregir el envío. */
function preparation(
  s: AccessScenario,
  recruiter: Person,
  candidate: { readonly id: string; readonly version: number },
  body: HiringBody,
) {
  const key = crypto.randomUUID();
  return (input: HiringBody = body): request.Test =>
    s
      .post(`/v1/hr/candidates/${candidate.id}/actions/prepare-hiring`, recruiter.session, input)
      .set('If-Match', `"${String(candidate.version)}"`)
      .set('Idempotency-Key', key);
}

export async function hiringFixture(s: AccessScenario): Promise<HiringFixture> {
  const recruiter = await s.person('contrata', ['TALENTO_HUMANO']);
  const director = await s.person('firma', ['DIRECCION']);
  const partyId = await directorParty(s);
  const { position, candidate } = await selectedCandidate(s, recruiter, director.id, partyId);
  const fileId = await contractFile(s, recruiter);
  const body = hiringBody(s, position.id, candidate.id, fileId, director.id);
  return { recruiter, director, body, prepare: preparation(s, recruiter, candidate, body) };
}
