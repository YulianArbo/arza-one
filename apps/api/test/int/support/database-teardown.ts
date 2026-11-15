import { afterAll } from 'vitest';

import { closeCreatedDatabases } from './integration-database.js';

// Cada archivo abre sus clientes; cerrarlos evita que la suite completa acumule conexiones y
// termine fallando por espera al iniciar transacciones.
afterAll(async () => {
  await closeCreatedDatabases();
});
