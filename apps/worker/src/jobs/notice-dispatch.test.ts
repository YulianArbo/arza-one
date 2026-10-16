import type { EmailDispatchDependencies } from '@arza/api/ntf';
import { describe, expect, it, vi } from 'vitest';

import type { MailMessage } from '../mail/mailer.js';
import { processNoticeDispatch, type NoticeDispatchJobDependencies } from './notice-dispatch.js';

// El recorrido completo, con PostgreSQL y Mailpit reales, está en
// test/int/notice-dispatch.int.test.ts. Aquí se revisa cómo el trabajo arma el correo.

const EMAIL = {
  to: 'ana@demo-uno.test',
  subject: 'Nueva tarea: Revisar <cotización>',
  body: 'Le asignaron la tarea «Revisar <cotización>».',
  url: 'http://localhost:3000/app/mis-tareas/1',
};

vi.mock('@arza/api/ntf', () => ({
  publishOutboxEvents: vi.fn(async () => Promise.resolve({ published: 2, failed: 0 })),
  sendDueNoticeEmails: vi.fn(async (deps: EmailDispatchDependencies) => {
    await deps.sendNoticeEmail(EMAIL);
    return { sent: 1, failed: 0 };
  }),
}));

function dependencies(sent: MailMessage[]): NoticeDispatchJobDependencies {
  return {
    database: {
      withTenant: async () => Promise.reject(new Error('no se usa')),
      withoutTenant: async () => Promise.reject(new Error('no se usa')),
    },
    clock: { now: () => new Date() },
    appUrl: 'http://localhost:3000/app',
    mailer: {
      sendWithId: async (message) => {
        sent.push(message);
        return Promise.resolve('<1@mailpit>');
      },
    },
  };
}

describe('trabajo de avisos', () => {
  it('publica la bandeja de salida y envía los correos con el marco institucional', async () => {
    const sent: MailMessage[] = [];
    const result = await processNoticeDispatch(dependencies(sent));
    expect(result).toEqual({
      events: { published: 2, failed: 0 },
      emails: { sent: 1, failed: 0 },
    });
    const [mail] = sent;
    expect(mail?.to).toBe(EMAIL.to);
    expect(mail?.subject).toBe(EMAIL.subject);
    expect(mail?.text).toContain(`Abrir en ARZA ONE: ${EMAIL.url}`);
    expect(mail?.html).toContain('Revisar &lt;cotización&gt;');
  });
});
