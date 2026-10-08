import { describe, expect, it } from 'vitest';

import { InFlightJobs } from './in-flight-jobs.js';

describe('trabajos en curso al apagar', () => {
  it('sin trabajos en curso, no espera', async () => {
    expect(await new InFlightJobs().settle(10_000)).toBe(true);
  });

  it('espera a que terminen todos los trabajos en curso', async () => {
    const inFlight = new InFlightJobs();
    inFlight.start('platform:1');
    inFlight.start('platform:2');
    const settled = inFlight.settle(10_000);
    inFlight.finish('platform:1');
    expect(inFlight.size).toBe(1);
    setTimeout(() => {
      inFlight.finish('platform:2');
    }, 20);
    expect(await settled).toBe(true);
    expect(inFlight.size).toBe(0);
  });

  it('ignora trabajos sin identificar', async () => {
    const inFlight = new InFlightJobs();
    inFlight.start(undefined);
    inFlight.finish(undefined);
    expect(inFlight.size).toBe(0);
    expect(await inFlight.settle(10)).toBe(true);
  });

  it('deja de esperar al vencer el plazo y dice que quedaron pendientes', async () => {
    const inFlight = new InFlightJobs();
    inFlight.start('platform:3');
    expect(await inFlight.settle(30)).toBe(false);
    expect(inFlight.size).toBe(1);
  });
});
