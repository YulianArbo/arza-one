import { hrCreatedResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { expireRecruitmentData } from '../../../src/modules/hr/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { registrationBody } from './support/candidate-fixture.js';

// Eliminación de los datos de candidatos no seleccionados (B35, ficha 17.13 y decisiones B y C):
// vencida la fecha se borran la hoja de vida, las evaluaciones y la persona; quien está en el banco
// de hojas de vida puede quedar doce meses más, nunca indefinidamente; y la persona que también se
// usa en otra parte conserva su ficha sin el papel de candidato.

const scenario = new AccessScenario('retención de selección');
const DAY = 24 * 60 * 60 * 1000;
const deleted: string[] = [];

function retentionDeps() {
  const storage = {
    delete: (key: string) => {
      deleted.push(key);
      return Promise.resolve();
    },
  };
  return { database: apiDatabase(), clock: scenario.clock, storage };
}

/** Hoja de vida ya revisada por el antivirus, subida por quien registra al candidato. */
async function resumeFile(recruiter: Person): Promise<{ id: string; storageKey: string }> {
  const tenantId = scenario.tenant.id;
  return scenario.db.withTenant({ tenantId, userId: recruiter.id }, (tx) =>
    tx.file.create({
      data: {
        tenantId,
        storageKey: `${tenantId}/${crypto.randomUUID()}`,
        fileName: 'hoja-de-vida-ana.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        scanStatus: 'available',
        sha256: '0'.repeat(64),
        scannedAt: new Date(),
      },
    }),
  );
}

interface Discarded {
  readonly id: string;
  readonly version: number;
}

/** Candidatura registrada (con evaluación) y descartada. */
async function discardCandidate(
  recruiter: Person,
  options: { readonly talentBank: boolean; readonly resumeId?: string },
): Promise<Discarded> {
  const body = await registrationBody(scenario);
  const created = await scenario
    .post('/v1/hr/candidates', recruiter.session, {
      ...body,
      talent_bank: options.talentBank,
      resume_file_id: options.resumeId ?? null,
    })
    .set('Idempotency-Key', crypto.randomUUID());
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const discarded = await scenario
    .post(`/v1/hr/candidates/${id}/actions/discard`, recruiter.session, {
      reason: 'Motivo ficticio',
    })
    .set('If-Match', '"1"');
  expect(discarded.status, discarded.text).toBe(204);
  return { id, version: 2 };
}

function candidate(id: string) {
  return scenario.inTenant((tx) => tx.hrCandidate.findUniqueOrThrow({ where: { id } }));
}

function extend(person: Person, target: Discarded) {
  return scenario
    .post(`/v1/hr/candidates/${target.id}/actions/extend-retention`, person.session, {})
    .set('If-Match', `"${String(target.version)}"`);
}

it('borra la hoja de vida, la persona y las evaluaciones al vencer, una sola vez', async () => {
  const recruiter = await scenario.person('seleccion-borra', ['TALENTO_HUMANO']);
  const resume = await resumeFile(recruiter);
  const expires = await discardCandidate(recruiter, { talentBank: false, resumeId: resume.id });
  const deps = retentionDeps();
  await expireRecruitmentData(deps);
  expect((await candidate(expires.id)).erasedAt).toBeNull();

  scenario.clock.advance(370 * DAY);
  await expireRecruitmentData(deps);
  await expireRecruitmentData(deps);

  const rows = await scenario.inTenant(async (tx) => {
    const row = await tx.hrCandidate.findUniqueOrThrow({ where: { id: expires.id } });
    return {
      row,
      person: await tx.party.findUniqueOrThrow({ where: { id: row.partyId } }),
      file: await tx.file.findUniqueOrThrow({ where: { id: resume.id } }),
      events: await tx.auditEvent.count({
        where: { entityId: expires.id, action: 'hr.candidate.erase' },
      }),
    };
  });
  expect(rows.row).toMatchObject({ resumeFileId: null, stage: 'discarded' });
  expect(rows.row.erasedAt).toBeInstanceOf(Date);
  expect(rows.person).toMatchObject({ firstName: 'Candidato', idNumber: null, email: null });
  expect(rows.file).toMatchObject({ fileName: 'archivo-eliminado' });
  expect(rows.file.deletedAt).toBeInstanceOf(Date);
  expect(deleted).toContain(resume.storageKey);
  expect(rows.events).toBe(1);
});

it('el banco de hojas de vida aplaza doce meses la eliminación, sin dejarla indefinida', async () => {
  const recruiter = await scenario.person('seleccion-banco', ['TALENTO_HUMANO']);
  const outsider = await scenario.person('seleccion-ajeno', ['COLABORADOR']);
  const banked = await discardCandidate(recruiter, { talentBank: true });
  const plain = await discardCandidate(recruiter, { talentBank: false });

  expect((await extend(outsider, banked)).status).toBe(403);
  const refused = await extend(recruiter, plain);
  expect(refused.status, refused.text).toBe(422);
  const before = (await candidate(banked.id)).retentionUntil;
  const accepted = await extend(recruiter, banked);
  expect(accepted.status, accepted.text).toBe(204);
  const after = await candidate(banked.id);
  expect(after.retentionUntil?.getTime()).toBeGreaterThan((before ?? new Date(0)).getTime());
  expect((await extend(recruiter, banked)).status).toBe(409);

  const deps = retentionDeps();
  scenario.clock.advance(370 * DAY);
  await expireRecruitmentData(deps);
  expect((await candidate(banked.id)).erasedAt).toBeNull();
  expect((await candidate(plain.id)).erasedAt).toBeInstanceOf(Date);

  scenario.clock.advance(370 * DAY);
  await expireRecruitmentData(deps);
  expect((await candidate(banked.id)).erasedAt).toBeInstanceOf(Date);
  const audited = await scenario.inTenant((tx) =>
    tx.auditEvent.count({
      where: { entityId: banked.id, action: 'hr.candidate.extend_retention' },
    }),
  );
  expect(audited).toBe(1);
});

it('la persona que también es cliente conserva su ficha y pierde el papel de candidato', async () => {
  const recruiter = await scenario.person('seleccion-cliente', ['TALENTO_HUMANO']);
  const shared = await discardCandidate(recruiter, { talentBank: false });
  const { partyId } = await candidate(shared.id);
  await scenario.inTenant((tx) =>
    tx.partyRole.create({
      data: { tenantId: scenario.tenant.id, partyId, role: 'customer', since: new Date() },
    }),
  );

  scenario.clock.advance(370 * DAY);
  await expireRecruitmentData(retentionDeps());

  const rows = await scenario.inTenant(async (tx) => ({
    row: await tx.hrCandidate.findUniqueOrThrow({ where: { id: shared.id } }),
    person: await tx.party.findUniqueOrThrow({ where: { id: partyId } }),
    roles: await tx.partyRole.findMany({ where: { partyId, deletedAt: null } }),
  }));
  expect(rows.row.erasedAt).toBeInstanceOf(Date);
  expect(rows.person.firstName).toBe('Ana');
  expect(rows.person.deletedAt).toBeNull();
  expect(rows.roles.map((role) => role.role)).toEqual(['customer']);
});
