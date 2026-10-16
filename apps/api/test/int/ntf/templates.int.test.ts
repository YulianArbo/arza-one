import { notificationTemplateListSchema, notificationTemplateSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Plantillas institucionales de los avisos (B16): versiones, datos permitidos, bloqueo optimista,
// permiso, aislamiento entre empresas y auditoría.

const scenario = new NtfScenario('plantillas');

const EDIT = {
  subject: 'Tiene una tarea nueva: {{tarea}}',
  body: 'Hola, {{nombre}}. La tarea «{{tarea}}» vence {{vence}}.',
  urgent: false,
};

async function template(person: Person, kind: string, tenantId = scenario.tenant.id) {
  const response = await scenario.get('/v1/notification-templates', person.session);
  expect(response.status, response.text).toBe(200);
  const found = notificationTemplateListSchema
    .parse(response.body)
    .items.find((item) => item.kind === kind);
  if (found === undefined) throw new Error(`No hay plantilla ${kind} en ${tenantId}.`);
  return found;
}

describe('editar una plantilla', () => {
  it('cada cambio crea una versión nueva y queda en la auditoría', async () => {
    const admin = await scenario.admin();
    const before = await template(admin, 'task_assigned');
    const saved = await scenario.patch(
      '/v1/notification-templates/task_assigned',
      admin.session,
      EDIT,
      before.version,
    );
    expect(saved.status, saved.text).toBe(200);
    const after = notificationTemplateSchema.parse(saved.body);
    expect(after).toMatchObject({ ...EDIT, version: before.version + 1 });
    expect(await template(admin, 'task_assigned')).toMatchObject({ version: after.version });
    const versions = await scenario.inTenant((tx) =>
      tx.notificationTemplate.count({ where: { key: 'task_assigned' } }),
    );
    expect(versions).toBe(after.version);
    expect(await scenario.actionsBy(admin)).toContain('ntf.template.update');
  });

  it('rechaza una versión vieja y los datos que el aviso no tiene', async () => {
    const admin = await scenario.admin();
    const current = await template(admin, 'task_escalated');
    const path = '/v1/notification-templates/task_escalated';
    const old = await scenario.patch(path, admin.session, EDIT, current.version + 5);
    expect(errorCode(old)).toBe('VERSION_CONFLICT');
    const bad = { ...EDIT, body: 'El monto es {{monto}} y vence {{vence}}.' };
    const invalid = await scenario.patch(path, admin.session, bad, current.version);
    expect(errorCode(invalid)).toBe('NTF_TEMPLATE_INVALID');
    expect(invalid.text).toContain('{{monto}}');
    const unknown = await scenario.patch('/v1/notification-templates/otro', admin.session, EDIT, 1);
    expect(errorCode(unknown)).toBe('NTF_TEMPLATE_NOT_FOUND');
  });
});

describe('la marca «urgente»', () => {
  it('la marca «urgente» exceptúa el aviso del envío diferido', async () => {
    const admin = await scenario.admin();
    const current = await template(admin, 'comment_mention');
    const urgent = { subject: current.subject, body: current.body, urgent: true };
    const path = '/v1/notification-templates/comment_mention';
    const saved = await scenario.patch(path, admin.session, urgent, current.version);
    expect(notificationTemplateSchema.parse(saved.body).urgent).toBe(true);
  });
});

describe('permiso y aislamiento de las plantillas', () => {
  it('sin el permiso no se ven ni se editan', async () => {
    const collaborator = await scenario.people('colaborador-plantillas', ['COLABORADOR']);
    const list = await scenario.get('/v1/notification-templates', collaborator.session);
    expect(errorCode(list)).toBe('PERMISSION_DENIED');
    const edit = await scenario.patch(
      '/v1/notification-templates/task_assigned',
      collaborator.session,
      EDIT,
      1,
    );
    expect(errorCode(edit)).toBe('PERMISSION_DENIED');
  });

  it('el cambio de una empresa no toca las plantillas de la otra', async () => {
    const admin = await scenario.admin();
    const otherAdmin = await scenario.admin(scenario.otherTenant.id);
    const mine = await template(admin, 'security_alert');
    const changed = { subject: 'Alerta: {{alerta}}', body: 'Pasó esto: {{alerta}}.', urgent: true };
    const path = '/v1/notification-templates/security_alert';
    await scenario.patch(path, admin.session, changed, mine.version);
    const theirs = await template(otherAdmin, 'security_alert', scenario.otherTenant.id);
    expect(theirs.subject).not.toBe(changed.subject);
    expect(theirs.version).toBe(1);
  });
});
