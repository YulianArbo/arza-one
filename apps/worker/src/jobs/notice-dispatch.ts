import {
  publishOutboxEvents,
  sendDueNoticeEmails,
  type DispatchResult,
  type NoticeEmail,
  type PublishResult,
  type PublisherDependencies,
} from '@arza/api/ntf';
import { noticeEmail } from '@arza/templates';

import type { Mailer } from '../mail/mailer.js';

export interface NoticeDispatchJobDependencies extends PublisherDependencies {
  readonly mailer: Pick<Mailer, 'sendWithId'>;
  /** Dirección de la aplicación interna (APP_URL). */
  readonly appUrl: string;
}

/**
 * Avisos (B16, ficha 17.5): primero publica la bandeja de salida (cada evento produce sus avisos
 * en la aplicación y sus correos) y luego envía los correos cuya hora llegó. Un aviso diferido
 * fuera de jornada espera en la base de datos hasta el inicio de la siguiente.
 */
export async function processNoticeDispatch(
  deps: NoticeDispatchJobDependencies,
): Promise<{ readonly events: PublishResult; readonly emails: DispatchResult }> {
  const events = await publishOutboxEvents(deps);
  const emails = await sendDueNoticeEmails({
    ...deps,
    sendNoticeEmail: async (email: NoticeEmail) =>
      deps.mailer.sendWithId({ to: email.to, ...noticeEmail(email) }),
  });
  return { events, emails };
}
