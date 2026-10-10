import { z } from 'zod';

// Las semillas de acceso, del núcleo y los terceros ficticios son de sus módulos: este punto de entrada las reúne con la
// de la plataforma, como app.module.ts reúne los módulos.
import { seedCore } from '../../../modules/core/index.js';
import { seedAccessControl } from '../../../modules/iam/index.js';
import { seedPartyDemo } from '../../../modules/party/index.js';
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
    await seedAccessControl(
      database,
      tenants.map((tenant) => tenant.id),
      systemClock,
    );
    await seedCore(
      database,
      tenants.map((tenant) => tenant.id),
      systemClock,
    );
    if (withDemo) {
      await seedPartyDemo(
        database,
        DEMO_TENANTS.map((tenant) => tenant.id),
        systemClock,
      );
    }
    process.stdout.write(withDemo ? 'Semilla y datos ficticios listos.\n' : 'Semilla lista.\n');
  } finally {
    await database.onModuleDestroy();
  }
}

await main();
