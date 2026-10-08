import { describe, expect, it } from 'vitest';

import { SmtpMailer } from './mailer.js';

const CONFIG = {
  APP_ENV: 'local' as const,
  SMTP_HOST: '127.0.0.1',
  // Puerto 1: nadie escucha allí.
  SMTP_PORT: 1,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  MAIL_FROM: 'ARZA ONE <no-responder@arza-one.test>',
};
const MESSAGE = { to: 'pruebas@arza-one.test', subject: 'Prueba', text: 'Hola' };

describe('envío por SMTP', () => {
  it('falla rápido si el servidor de correo no responde (el trabajo se reintentará)', async () => {
    const mailer = new SmtpMailer(CONFIG);
    await expect(mailer.send(MESSAGE)).rejects.toThrow(/ECONNREFUSED/);
    mailer.close();
  });

  it('con usuario y contraseña, y fuera del entorno local, también intenta conectarse', async () => {
    const mailer = new SmtpMailer({
      ...CONFIG,
      APP_ENV: 'staging',
      SMTP_USER: 'usuario-ficticio',
      SMTP_PASSWORD: 'ficticia',
    });
    await expect(mailer.send(MESSAGE)).rejects.toThrow(/ECONNREFUSED/);
    mailer.close();
  });
});
