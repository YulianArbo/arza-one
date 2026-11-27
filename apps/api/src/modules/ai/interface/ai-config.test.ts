import { AI_ERROR_CODES } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { testEnv } from '../../../../test/support/test-env.js';
import type { Principal } from '../../../platform/access/principal.js';
import { systemClock } from '../../../platform/clock/clock.js';
import { ConfigError, loadConfig } from '../../../platform/config/load-config.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { AiGateway } from '../application/gateway.js';
import { aiModelFor } from './ai.module.js';

// Configuración de la pasarela de IA (B47, decisión 2): apagada por defecto, el modo de ensayo
// nunca en producción y Claude solo con su llave.

function problemsOf(raw: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

const KEY = 'k'.repeat(40);

describe('configuración del asistente de IA (B47)', () => {
  it('sin proveedor el asistente queda apagado', () => {
    const config = loadConfig(testEnv());
    expect(config.AI_GATEWAY_PROVIDER).toBe('off');
    expect(config.AI_GATEWAY_DAILY_LIMIT).toBe(50);
    expect(aiModelFor(config)).toBeNull();
  });

  it('Claude exige su llave y el modo de ensayo no se usa en producción', () => {
    expect(problemsOf(testEnv({ AI_GATEWAY_PROVIDER: 'anthropic' }))).toEqual([
      'AI_GATEWAY_API_KEY: falta; es obligatoria',
    ]);
    const production = testEnv({ APP_ENV: 'production', AI_GATEWAY_PROVIDER: 'rehearsal' });
    expect(problemsOf(production).join('\n')).toContain(
      'AI_GATEWAY_PROVIDER: el modo de ensayo no se usa en producción',
    );
    const problems = problemsOf(testEnv({ AI_GATEWAY_MODEL: 'gpt-x' }));
    expect(problems.join('\n')).toMatch(/AI_GATEWAY_MODEL: .+/);
  });

  it('elige el adaptador del proveedor configurado', () => {
    const rehearsal = aiModelFor(loadConfig(testEnv({ AI_GATEWAY_PROVIDER: 'rehearsal' })));
    expect(rehearsal).toMatchObject({ provider: 'rehearsal', model: 'ensayo-local' });
    const claude = aiModelFor(
      loadConfig(testEnv({ AI_GATEWAY_PROVIDER: 'anthropic', AI_GATEWAY_API_KEY: KEY })),
    );
    expect(claude).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5' });
  });

  it('apagado responde que no está disponible sin tocar la base de datos', async () => {
    const database = {} as DatabaseService;
    const gateway = new AiGateway(database, systemClock, null, {
      dailyLimit: 50,
      maxInputChars: 24_000,
    });
    const principal = { userId: 'u', tenantId: 't' } as Principal;
    const viewer = { principal, ability: {} as never };
    const failure = await gateway.admit(viewer, 'doc_search').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: AI_ERROR_CODES.gatewayOff });
  });
});
