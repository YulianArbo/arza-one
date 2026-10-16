import { createTransport, type Transporter } from 'nodemailer';

import type { WorkerEnv } from '../config/env-schema.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Versión HTML con el marco institucional (avisos, B16). */
  readonly html?: string;
}

/** Envío de correo. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Igual que send, y devuelve el identificador que le dio el servidor de correo. */
  sendWithId(message: MailMessage): Promise<string | null>;
  close(): void;
}

/** Tiempo máximo de cada paso de la conexión SMTP: un servidor caído no retiene el trabajo. */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Envío por SMTP (en local, Mailpit). Fuera del entorno local exige TLS: el correo nunca viaja
 * sin cifrar entre servidores (numeral 10.2 y 15.6: TLS 1.2 o superior).
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    config: Pick<
      WorkerEnv,
      'APP_ENV' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'
    >,
  ) {
    const { SMTP_USER: user, SMTP_PASSWORD: pass } = config;
    this.transport = createTransport(
      {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        requireTLS: config.APP_ENV !== 'local',
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
        ...(user === undefined || pass === undefined ? {} : { auth: { user, pass } }),
      },
      { from: config.MAIL_FROM },
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.sendWithId(message);
  }

  async sendWithId(message: MailMessage): Promise<string | null> {
    const info: { messageId?: unknown } = await this.transport.sendMail(message);
    return typeof info.messageId === 'string' ? info.messageId : null;
  }

  close(): void {
    this.transport.close();
  }
}
