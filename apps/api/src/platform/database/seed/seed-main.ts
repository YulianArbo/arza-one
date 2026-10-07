import { z } from 'zod';

import { DatabaseService } from '../database.service.js';
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
    process.stdout.write(withDemo ? 'Semilla y datos ficticios listos.\n' : 'Semilla lista.\n');
  } finally {
    await database.onModuleDestroy();
  }
}

await main();
