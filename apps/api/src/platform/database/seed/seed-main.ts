import { z } from 'zod';

// Las semillas de acceso, del núcleo, documentos, privacidad, los parámetros tributarios, el flujo del CRM, los terceros ficticios y el flujo de prueba son de sus
// módulos: este punto de entrada las reúne con la de la plataforma, como app.module.ts reúne los
// módulos.
import { seedCore } from '../../../modules/core/index.js';
import { seedCrmWorkflows } from '../../../modules/crm/index.js';
import {
  seedDocFolders,
  seedDocForms,
  seedDocWorkflows,
  seedRetentionDemo,
} from '../../../modules/doc/index.js';
import { seedTaxParameters } from '../../../modules/fin/index.js';
import { seedAccessControl } from '../../../modules/iam/index.js';
import { seedPartyDemo } from '../../../modules/party/index.js';
import { seedNotificationTemplates } from '../../../modules/ntf/index.js';
import { seedPrivacyDemo, seedPrivacyNotices } from '../../../modules/privacy/index.js';
import { seedWorkflowDemo } from '../../../modules/wf/index.js';
import { systemClock } from '../../clock/clock.js';
import { DatabaseService } from '../database.service.js';
import { DEMO_TENANTS, PLATFORM_TENANT } from './seed-data.js';
import { seedDemo, seedPlatform } from './seed.js';

// Punto de entrada de `pnpm db:seed` y `pnpm db:seed:demo`. Solo necesita DATABASE_URL.
const seedEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_ENV: z.enum(['local', 'staging', 'production']),
});

async function main(): Promise<void> {
  const env = seedEnvSchema.parse(process.env);
  const withDemo = process.argv.includes('--demo');
  if (withDemo && env.APP_ENV === 'production') {
    throw new Error('Los datos ficticios no se cargan en producción.');
  }
  const database = new DatabaseService(env.DATABASE_URL);
  try {
    await seedPlatform(database);
    if (withDemo) {
      await seedDemo(database);
    }
    const tenants = withDemo ? [PLATFORM_TENANT, ...DEMO_TENANTS] : [PLATFORM_TENANT];
    const tenantIds = tenants.map((tenant) => tenant.id);
    await seedAccessControl(database, tenantIds, systemClock);
    await seedCore(database, tenantIds, systemClock);
    await seedDocFolders(database, tenantIds, systemClock);
    await seedDocWorkflows(database, tenantIds, systemClock);
    await seedDocForms(database, tenantIds, systemClock);
    await seedNotificationTemplates(database, tenantIds, systemClock);
    await seedPrivacyNotices(database, tenantIds, systemClock);
    await seedTaxParameters(database, tenantIds, systemClock);
    await seedCrmWorkflows(database, tenantIds, systemClock);
    if (withDemo) {
      const demoIds = DEMO_TENANTS.map((tenant) => tenant.id);
      // Los terceros ficticios llegan con su autorización: primero se publican los textos.
      await seedPrivacyDemo(database, demoIds, systemClock);
      await seedPartyDemo(database, demoIds, systemClock);
      await seedWorkflowDemo(database, demoIds, systemClock);
      await seedRetentionDemo(database, demoIds, systemClock);
    }
    process.stdout.write(withDemo ? 'Semilla y datos ficticios listos.\n' : 'Semilla lista.\n');
  } finally {
    await database.onModuleDestroy();
  }
}

await main();
