import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import type { HealthComponent } from '@arza/contracts';
import { Logger } from 'nestjs-pino';

import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/platform/config/load-config.js';
import { HEALTH_PROBES, type HealthProbe } from '../../src/platform/health/health-probe.js';
import { testEnv } from './test-env.js';

export interface TestAppOptions {
  /** Variables de entorno que cambian frente a testEnv(). */
  readonly env?: Record<string, string | undefined>;
  /** Piezas que /health debe ver caídas. Las demás responden. */
  readonly downComponents?: readonly HealthComponent[];
  /** Controladores de ensayo que solo existen en las pruebas. */
  readonly controllers?: Type[];
  /**
   * Con true, el límite de peticiones cuenta en el Valkey de VALKEY_URL, como en producción
   * (pruebas de integración). Si no, cuenta en memoria: estas pruebas no tienen Valkey.
   */
  readonly realThrottlerStorage?: boolean;
}

function fakeProbe(component: HealthComponent, down: boolean): HealthProbe {
  return {
    component,
    check: () => (down ? Promise.reject(new Error('caída simulada')) : Promise.resolve()),
  };
}

function fakeProbes(down: readonly HealthComponent[]): HealthProbe[] {
  const components: HealthComponent[] = ['database', 'queues', 'files'];
  return components.map((component) => fakeProbe(component, down.includes(component)));
}

/** Levanta la API completa en memoria, con la misma cadena de petición que en producción. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const config = loadConfig(testEnv(options.env));
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(HEALTH_PROBES)
    .useValue(fakeProbes(options.downComponents ?? []));
  if (options.realThrottlerStorage !== true) {
    builder = builder.overrideProvider(getStorageToken()).useValue(new ThrottlerStorageService());
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, config);
  await app.init();
  return app;
}
