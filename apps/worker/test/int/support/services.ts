import type { DatabaseService } from '@arza/api/platform';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';
import { z } from 'zod';

import { loadWorkerConfig } from '../../../src/config/load-worker-config.js';
import type { WorkerEnv } from '../../../src/config/env-schema.js';

// Piezas desechables que levantan la configuración de pruebas de la API (PostgreSQL y Valkey) y
// mailpit-setup.ts. Ningún valor es real.
declare module 'vitest' {
  export interface ProvidedContext {
    database: { readonly appUrl: string; readonly migrationUrl: string };
    valkeyUrl: string;
    mailpit: { readonly smtpHost: string; readonly smtpPort: number; readonly apiUrl: string };
    storage: {
      readonly endpoint: string;
      readonly region: string;
      readonly bucket: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    };
    antivirus: { readonly host: string; readonly port: number };
  }
}

/**
 * Configuración del worker contra las piezas de prueba. Cada archivo de pruebas usa su propia base
 * de Valkey (`database`) para que sus colas no se mezclen con las de otro archivo.
 */
export function workerConfig(valkeyDatabase: number): WorkerEnv {
  const mailpit = inject('mailpit');
  const storage = inject('storage');
  const antivirus = inject('antivirus');
  return loadWorkerConfig({
    NODE_ENV: 'test',
    APP_ENV: 'local',
    LOG_LEVEL: 'fatal',
    DATABASE_URL: inject('database').appUrl,
    VALKEY_URL: `${inject('valkeyUrl')}/${String(valkeyDatabase)}`,
    APP_URL: 'http://localhost:3000/app',
    SMTP_HOST: mailpit.smtpHost,
    SMTP_PORT: String(mailpit.smtpPort),
    MAIL_FROM: 'ARZA ONE <no-responder@arza-one.test>',
    S3_ENDPOINT: storage.endpoint,
    S3_REGION: storage.region,
    S3_BUCKET: storage.bucket,
    S3_ACCESS_KEY: storage.accessKeyId,
    S3_SECRET_KEY: storage.secretAccessKey,
    CLAMAV_HOST: antivirus.host,
    CLAMAV_PORT: String(antivirus.port),
  });
}

export interface TestTenant {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string;
  readonly taxId: string;
}

/** Crea una empresa ficticia en su propio contexto, como lo harían los datos semilla. */
export async function createTenant(database: DatabaseService, label: string): Promise<TestTenant> {
  const id = uuidv7();
  const tenant = { id, legalName: `Empresa ${label} S.A.S.`, tradeName: label, taxId: `T-${id}` };
  await database.withTenant({ tenantId: id, userId: null }, (transaction) =>
    transaction.tenant.create({ data: tenant }),
  );
  return tenant;
}

const mailpitMessagesSchema = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      Subject: z.string(),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});

export type MailpitMessage = z.infer<typeof mailpitMessagesSchema>['messages'][number];

/** Correos que recibió Mailpit cuyo asunto contiene el texto dado. */
export async function mailsAbout(text: string): Promise<MailpitMessage[]> {
  const url = `${inject('mailpit').apiUrl}/api/v1/messages?limit=200`;
  const body: unknown = await (await fetch(url)).json();
  return mailpitMessagesSchema
    .parse(body)
    .messages.filter((message) => message.Subject.includes(text));
}

/** Texto del correo con ese asunto que recibió la dirección dada. */
export async function mailTextTo(subject: string, recipient: string): Promise<string> {
  const mail = (await mailsAbout(subject)).find((message) =>
    message.To.some((to) => to.Address === recipient),
  );
  if (mail === undefined) throw new Error(`No llegó el correo «${subject}».`);
  const url = `${inject('mailpit').apiUrl}/api/v1/message/${mail.ID}`;
  const body: unknown = await (await fetch(url)).json();
  return z.object({ Text: z.string() }).parse(body).Text;
}
