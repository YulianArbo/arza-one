import { employeeDetailResponseSchema, hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect, it } from 'vitest';

import { bogotaToday } from '../../../src/modules/core/index.js';
import { publishTenantEvents } from '../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { SignatureScenario } from '../contract/support/signature-scenario.js';
import { putVersioned } from '../fin/support/ledger-steps.js';
import type { Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { hiringFixture, type HiringBody } from './support/hiring-fixture.js';

const scenario = new SignatureScenario('contrato laboral');

interface HiringContext {
  readonly prepare: (input?: HiringBody) => request.Test;
  readonly recruiter: Person;
  readonly director: Person;
  readonly contributor: Person;
  readonly employee: { readonly id: string };
  readonly envelopeId: string;
}

interface LinkedEmployee {
  readonly onboardingTasks: readonly {
    readonly id: string;
    readonly kind: string;
    readonly responsibleId: string | null;
  }[];
  readonly fileChecklist: readonly { readonly id: string }[];
}

/** Activación del colaborador pendiente con la versión que se espera. */
function activation(session: Person['session'], employeeId: string): request.Test {
  return scenario
    .post(`/v1/hr/employees/${employeeId}/actions/activate`, session)
    .set('If-Match', '"1"');
}

/** Contrato en firma: el adjunto aprobado, la versión y quién puede verlo. */
async function hiringInProgress(): Promise<HiringContext> {
  const { body, prepare, recruiter, director } = await hiringFixture(scenario);
  expect((await prepare({ ...body, contract_file_id: crypto.randomUUID() })).status).toBe(422);
  expect((await prepare({ ...body, salary_band: 'BANDA_9' })).status).toBe(422);
  const created = await prepare();
  expect(created.status, created.text).toBe(201);
  const employee = hrCreatedResponseSchema.parse(created.body);
  const recordPath = `/v1/hr/employees/${employee.id}`;
  const details = await scenario.get(recordPath, recruiter.session);
  expect(details.status, details.text).toBe(200);
  expect(employeeDetailResponseSchema.parse(details.body).contract?.salary).toBe('3500000.00');
  const contributor = await scenario.person('colaborador', ['COLABORADOR']);
  expect((await scenario.get(recordPath, contributor.session)).status).toBe(404);
  expect((await activation(recruiter.session, employee.id)).status).toBe(409);
  expect((await prepare()).body).toEqual(employee);
  const contract = await scenario.inTenant((tx) =>
    tx.hrContract.findFirstOrThrow({ where: { employeeId: employee.id } }),
  );
  expect(contract.status).toBe('in_signature');
  return {
    prepare,
    recruiter,
    director,
    contributor,
    employee,
    envelopeId: contract.envelopeId ?? '',
  };
}

/** Firma de la persona y de Dirección; el reclutador no puede firmar por la empresa. */
async function signedByDirector(context: HiringContext): Promise<void> {
  const address = await scenario.inTenant(async (tx) => {
    const signer = await tx.sigSigner.findFirstOrThrow({
      where: { envelopeId: context.envelopeId, kind: 'client' },
    });
    return signer.email;
  });
  await scenario.signatureWork();
  const { token, ticket } = await scenario.ticketFor(address);
  expect((await scenario.publicSign('sign', { token, ticket, accept: true })).status).toBe(204);
  const path = `/v1/hr/employees/${context.employee.id}/contract/actions/sign`;
  expect((await scenario.post(path, context.recruiter.session, { accept: true })).status).toBe(404);
  const signed = await scenario.post(path, context.director.session, { accept: true });
  expect(signed.status, signed.text).toBe(204);
  expect(
    await scenario.inTenant((tx) =>
      tx.sigEnvelope.findFirst({ where: { id: context.envelopeId } }),
    ),
  ).toMatchObject({ status: 'completed' });
  await scenario.signatureWork();
}

/** Activación efectiva: cuenta, inducción y expediente del colaborador. */
async function activatedEmployee(context: HiringContext): Promise<LinkedEmployee> {
  const activated = await activation(context.recruiter.session, context.employee.id);
  expect(activated.status, activated.text).toBe(204);
  const linked = await scenario.inTenant((tx) =>
    tx.hrEmployee.findUniqueOrThrow({
      where: { id: context.employee.id },
      include: { onboardingTasks: true, fileChecklist: true },
    }),
  );
  expect(linked).toMatchObject({ status: 'active' });
  expect(typeof linked.userId).toBe('string');
  expect(linked.onboardingTasks.map(({ kind }) => kind)).toEqual(
    expect.arrayContaining(['induction', 'medical_exam', 'equipment']),
  );
  expect(linked.fileChecklist).toHaveLength(13);
  const detail = await scenario.get(
    `/v1/hr/employees/${context.employee.id}`,
    context.recruiter.session,
  );
  expect(employeeDetailResponseSchema.parse(detail.body).file).toHaveLength(13);
  expect((await activation(context.recruiter.session, context.employee.id)).status).toBe(204);
  return linked;
}

/** Expediente e inducción: permisos del archivo y cierre de una tarea. */
async function fileAndInduction(context: HiringContext, linked: LinkedEmployee): Promise<void> {
  const recordPath = `/v1/hr/employees/${context.employee.id}`;
  const updatePath = `${recordPath}/file/education`;
  const denied = await putVersioned(
    scenario,
    updatePath,
    context.contributor,
    { status: 'received' },
    1,
  );
  expect(denied.status).toBe(403);
  const filed = await putVersioned(
    scenario,
    updatePath,
    context.recruiter,
    { status: 'received', note: 'Soporte verificado' },
    1,
  );
  expect(filed.status, filed.text).toBe(204);
  const induction = linked.onboardingTasks.find(({ kind }) => kind === 'induction');
  if (induction === undefined) throw new Error('Falta la inducción');
  const doneOn = bogotaToday(scenario.clock.now());
  const done = await scenario
    .post(`${recordPath}/onboarding/${induction.id}/actions/complete`, context.recruiter.session, {
      done_on: doneOn,
    })
    .set('If-Match', '"1"');
  expect(done.status, done.text).toBe(204);
  const updated = employeeDetailResponseSchema.parse(
    (await scenario.get(recordPath, context.recruiter.session)).body,
  );
  expect(updated.file).toContainEqual(
    expect.objectContaining({ item: 'education', status: 'received', version: 2 }),
  );
  expect(updated.onboarding).toContainEqual(
    expect.objectContaining({ id: induction.id, done_on: doneOn, version: 2 }),
  );
}

/** Cada tarea tiene su responsable y el evento de vinculación lo lleva para el aviso (decisión 6). */
async function responsiblesNotified(
  context: HiringContext,
  linked: LinkedEmployee,
  owners: { readonly sst: Person; readonly assets: Person },
): Promise<void> {
  const ownerOf = (kind: string) =>
    linked.onboardingTasks.find((task) => task.kind === kind)?.responsibleId;
  expect(ownerOf('medical_exam')).toBe(owners.sst.id);
  expect(ownerOf('sst_induction')).toBe(owners.sst.id);
  expect(ownerOf('equipment')).toBe(owners.assets.id);
  expect(ownerOf('induction')).toBe(context.recruiter.id);
  const event = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'employee.hired',
        payload: { path: ['employee_id'], equals: context.employee.id },
      },
    }),
  );
  expect(JSON.stringify(event.payload)).toContain(owners.sst.id);
  expect(JSON.stringify(event.payload)).not.toContain('@');
  // La semilla crea en cada empresa la plantilla del aviso nuevo (pnpm db:seed).
  await seedNotificationTemplates(apiDatabase(), [scenario.tenant.id], scenario.clock);
  await publishTenantEvents(
    { database: apiDatabase(), clock: scenario.clock },
    scenario.tenant.id,
    scenario.clock.now(),
  );
  const notices = await scenario.inTenant((tx) =>
    tx.notification.findMany({ where: { kind: 'hr_onboarding_task' } }),
  );
  const toSst = notices.filter((notice) => notice.userId === owners.sst.id);
  expect(toSst.map((notice) => notice.title)).toContain(
    'Tarea de inducción: Evaluación médica ocupacional de ingreso',
  );
  expect(notices.find((notice) => notice.userId === owners.assets.id)?.link).toBe(
    '/app/compras/activos',
  );
  expect(notices.some((notice) => notice.userId === context.recruiter.id)).toBe(false);
}

it('envía a firma el adjunto aprobado y permite firmar únicamente a Dirección designada', async () => {
  const owners = {
    sst: await scenario.person('lider-sst', ['SST']),
    assets: await scenario.person('activos', ['ADMIN_FINANCIERO']),
  };
  const context = await hiringInProgress();
  await signedByDirector(context);
  const linked = await activatedEmployee(context);
  await responsiblesNotified(context, linked, owners);
  await fileAndInduction(context, linked);
});
