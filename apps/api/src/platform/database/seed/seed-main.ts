import { z } from 'zod';

// Las semillas de cada empresa están en tenant-seed.ts (también las usa el alta de una empresa,
// B48); este punto de entrada las reúne con la de la plataforma y los datos ficticios.
import { seedRetentionDemo } from '../../../modules/doc/index.js';
import { seedInnovationDemo } from '../../../modules/inn/index.js';
import { seedSiteDemo } from '../../../modules/web/index.js';
import { seedPartyDemo } from '../../../modules/party/index.js';
import { seedPrivacyDemo } from '../../../modules/privacy/index.js';
import { seedLegalDemo } from '../../../modules/qms/index.js';
import { seedWorkflowDemo } from '../../../modules/wf/index.js';
import { systemClock } from '../../clock/clock.js';
import { DatabaseService } from '../database.service.js';
import { DEMO_TENANTS, PLATFORM_TENANT } from './seed-data.js';
import { seedDemo, seedPlatform } from './seed.js';
import { seedTenantBasics } from './tenant-seed.js';

// Punto de entrada de `pnpm db:seed` y `pnpm db:seed:demo`. Solo necesita DATABASE_URL.
const seedEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_ENV: z.enum(['local', 'staging', 'production']),
});

/** Datos ficticios de las empresas de demostración. */
async function seedDemoData(database: DatabaseService): Promise<void> {
  const demoIds = DEMO_TENANTS.map((tenant) => tenant.id);
  // Los terceros ficticios llegan con su autorización: primero se publican los textos.
  await seedPrivacyDemo(database, demoIds, systemClock);
  await seedPartyDemo(database, demoIds, systemClock);
  await seedWorkflowDemo(database, demoIds, systemClock);
  await seedRetentionDemo(database, demoIds, systemClock);
  await seedInnovationDemo(database, demoIds, systemClock);
  await seedSiteDemo(database, demoIds, systemClock);
  await seedLegalDemo(database, demoIds, systemClock);
}

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
    await seedTenantBasics(database, tenantIds, systemClock);
    if (withDemo) await seedDemoData(database);
    process.stdout.write(withDemo ? 'Semilla y datos ficticios listos.\n' : 'Semilla lista.\n');
  } finally {
    await database.onModuleDestroy();
  }
}

await main();
