import { JOBS } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { createJobRouter, type JobDependencies } from './job-router.js';

const unusedDeps: JobDependencies = {
  database: {
    withTenant: async () => Promise.reject(new Error('no se usa')),
    withoutTenant: async () => Promise.reject(new Error('no se usa')),
  },
  mailer: {
    send: async () => Promise.reject(new Error('no se usa')),
    sendWithId: async () => Promise.reject(new Error('no se usa')),
  },
  clock: { now: () => new Date() },
  appUrl: 'http://localhost:3000/app',
  storage: {
    read: async () => Promise.reject(new Error('no se usa')),
    delete: async () => Promise.reject(new Error('no se usa')),
  },
  antivirus: async () => Promise.reject(new Error('no se usa')),
};

describe('enrutador de trabajos', () => {
  it('envía el trabajo de ejemplo a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    // El procesador de ejemplo rechaza estos datos: prueba de que el trabajo llegó a él.
    await expect(route({ name: JOBS.exampleEmail.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });

  it('envía el correo de una cuenta a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.accountEmail.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });

  it('envía la verificación diaria de la auditoría a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.auditChainCheck.name, data: {} })).rejects.toThrow('no se usa');
  });

  it('envía el análisis de un archivo a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.fileScan.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });

  it('envía el escalamiento de tareas vencidas a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.wfOverdueCheck.name, data: {} })).rejects.toThrow('no se usa');
  });

  it('rechaza sin reintento un trabajo sin procesador', async () => {
    const route = createJobRouter(unusedDeps);
    const failure = route({ name: 'desconocido.trabajo', data: {} });
    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failure).rejects.toThrow(
      'No hay procesador para el trabajo «desconocido.trabajo».',
    );
  });
});
