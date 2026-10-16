import { notificationPreferencesSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Centro de avisos y entrega diferida (B16, ficha 17.5 y PT-GTH-001). Las fechas son fijas para
// que la prueba no dependa del día ni de la hora en que corre.

const scenario = new NtfScenario('avisos');

/** Sábado 19 de octubre de 2030, 10:00 a. m. en Bogotá. */
const SATURDAY = new Date('2030-10-19T15:00:00Z');
/** Lunes 21 de octubre de 2030, 8:00 a. m.: el inicio de la jornada siguiente. */
const MONDAY_8AM = new Date('2030-10-21T13:00:00Z');
/** Viernes 11 de octubre de 2030, 6:00 p. m.: el lunes 14 es festivo (Día de la Raza). */
const FRIDAY_EVENING = new Date('2030-10-11T23:00:00Z');
const TUESDAY_8AM = new Date('2030-10-15T13:00:00Z');
/** Martes 13 de octubre de 2026, 9:30 a. m.: dentro de la jornada y ya pasado. */
const PAST_WORKDAY = new Date('2026-10-13T14:30:00Z');

/** Tarea real de un trámite, para que el aviso tenga su título. */
async function realTask(): Promise<string> {
  const admin = await scenario.admin();
  const flow = await scenario.publish(admin);
  const requester = await scenario.people('solicitante', ['COLABORADOR']);
  return (await scenario.onlyOpenTask(await scenario.startAs(requester, flow.key))).id;
}

async function assignTo(person: Person, occurredAt: Date): Promise<string> {
  const payload = { task_id: await realTask(), assignee_id: person.id };
  const eventId = await scenario.event('wf.task.assigned', payload, occurredAt);
  await scenario.publishOutbox();
  return eventId;
}

async function rowsOf(eventId: string) {
  return scenario.inTenant(async (tx) => ({
    notifications: await tx.notification.findMany({ where: { eventId } }),
    deliveries: await tx.notificationDelivery.findMany({
      where: { notification: { eventId } },
    }),
  }));
}

describe('entrega diferida fuera de jornada (criterio del bloque)', () => {
  it('un aviso generado un sábado se entrega el lunes a las 8:00 a. m.', async () => {
    const person = await scenario.people('colaborador-sabado', ['COLABORADOR']);
    const { notifications, deliveries } = await rowsOf(await assignTo(person, SATURDAY));
    expect(notifications.map((row) => row.deliverAt)).toEqual([MONDAY_8AM]);
    expect(deliveries.map((row) => [row.deliverAt, row.nextAttemptAt])).toEqual([
      [MONDAY_8AM, MONDAY_8AM],
    ]);
    expect(await scenario.notifications(person)).toEqual([]);
  });

  it('salta el festivo: del viernes en la noche al martes a las 8:00 a. m.', async () => {
    const person = await scenario.people('colaborador-festivo', ['COLABORADOR']);
    const { notifications } = await rowsOf(await assignTo(person, FRIDAY_EVENING));
    expect(notifications.map((row) => row.deliverAt)).toEqual([TUESDAY_8AM]);
  });

  it('dentro de la jornada se entrega de inmediato, con la plantilla aplicada', async () => {
    const person = await scenario.people('colaborador-jornada', ['COLABORADOR']);
    await assignTo(person, PAST_WORKDAY);
    const [notice, ...rest] = await scenario.notifications(person);
    expect(rest).toEqual([]);
    expect(notice?.kind).toBe('task_assigned');
    expect(notice?.title).toMatch(/^Nueva tarea: Borrador: Solicitud /);
    expect(notice?.delivered_at).toBe(PAST_WORKDAY.toISOString());
    expect(notice?.link).toMatch(/^\/app\/mis-tareas\/[0-9a-f-]{36}$/);
  });
});

describe('avisos urgentes (la excepción parametrizada)', () => {
  it('la alerta de seguridad llega al instante a Administración y Dirección', async () => {
    const admin = await scenario.people('admin-alerta', ['ADMIN_PLATAFORMA']);
    const director = await scenario.people('director-alerta', ['DIRECCION']);
    const other = await scenario.people('colaborador-alerta', ['COLABORADOR']);
    const eventId = await scenario.event(
      'security.alert',
      { type: 'iam.account.locked' },
      SATURDAY,
    );
    await scenario.publishOutbox();
    const { notifications, deliveries } = await rowsOf(eventId);
    const users = notifications.map((row) => row.userId);
    expect(users).toEqual(expect.arrayContaining([admin.id, director.id]));
    expect(users).not.toContain(other.id);
    expect(new Set(notifications.map((row) => row.deliverAt.toISOString()))).toEqual(
      new Set([SATURDAY.toISOString()]),
    );
    expect(deliveries).toHaveLength(notifications.length);
    expect(notifications[0]?.title).toContain('una cuenta se bloqueó por intentos fallidos');
  });
});

describe('leer los avisos', () => {
  it('marca uno y luego todos como leídos, y lo deja en la auditoría', async () => {
    const person = await scenario.people('lector', ['COLABORADOR']);
    await assignTo(person, PAST_WORKDAY);
    await assignTo(person, PAST_WORKDAY);
    const [first] = await scenario.notifications(person, '?unread=true');
    const read = await scenario.post(
      `/v1/me/notifications/${String(first?.id)}/read`,
      person.session,
    );
    expect(read.status, read.text).toBe(204);
    expect(await scenario.notifications(person, '?unread=true')).toHaveLength(1);
    const again = await scenario.post(
      `/v1/me/notifications/${String(first?.id)}/read`,
      person.session,
    );
    expect(again.status).toBe(204);
    const all = await scenario.post('/v1/me/notifications/read-all', person.session);
    expect(all.status).toBe(204);
    expect(await scenario.notifications(person, '?unread=true')).toEqual([]);
    const actions = await scenario.actionsBy(person);
    expect(actions).toEqual(
      expect.arrayContaining(['ntf.notification.read', 'ntf.notification.read_all']),
    );
  });
});

describe('preferencias', () => {
  it('quien apaga el correo de un tipo de aviso lo sigue viendo en la aplicación', async () => {
    const person = await scenario.people('sin-correo', ['COLABORADOR']);
    const off = { items: [{ kind: 'task_assigned', email: false }] };
    const saved = await scenario.put('/v1/me/notification-preferences', person.session, off);
    expect(saved.status, saved.text).toBe(200);
    const prefs = notificationPreferencesSchema.parse(saved.body).items;
    expect(prefs.find((pref) => pref.kind === 'task_assigned')?.email).toBe(false);
    const { notifications, deliveries } = await rowsOf(await assignTo(person, PAST_WORKDAY));
    expect(notifications).toHaveLength(1);
    expect(deliveries).toEqual([]);
    const actions = await scenario.actionsBy(person);
    expect(actions).toContain('ntf.preference.update');
  });

  it('un aviso urgente no se puede apagar', async () => {
    const admin = await scenario.people('admin-sin-correo', ['ADMIN_PLATAFORMA']);
    const off = { items: [{ kind: 'security_alert', email: false }] };
    const saved = await scenario.put('/v1/me/notification-preferences', admin.session, off);
    const prefs = notificationPreferencesSchema.parse(saved.body).items;
    expect(prefs.find((pref) => pref.kind === 'security_alert')).toMatchObject({
      email: true,
      urgent: true,
    });
    const eventId = await scenario.event('security.alert', { type: 'iam.mfa.reset' }, SATURDAY);
    await scenario.publishOutbox();
    const { deliveries } = await rowsOf(eventId);
    expect(deliveries.map((row) => row.recipient)).toContain(admin.email);
  });
});

describe('aislamiento y permiso', () => {
  it('nadie ve ni marca los avisos de otra persona, tampoco de otra empresa', async () => {
    const owner = await scenario.people('dueno-aviso', ['COLABORADOR']);
    await assignTo(owner, PAST_WORKDAY);
    const [notice] = await scenario.notifications(owner);
    const colleague = await scenario.people('colega', ['COLABORADOR']);
    const outsider = await scenario.people('externo', ['COLABORADOR'], scenario.otherTenant.id);
    for (const person of [colleague, outsider]) {
      expect(await scenario.notifications(person)).toEqual([]);
      const read = await scenario.post(
        `/v1/me/notifications/${String(notice?.id)}/read`,
        person.session,
      );
      expect(errorCode(read)).toBe('NTF_NOTIFICATION_NOT_FOUND');
    }
  });
});
