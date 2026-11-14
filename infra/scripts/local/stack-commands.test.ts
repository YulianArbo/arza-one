import { describe, expect, it } from 'vitest';

import type { CommandResult, RunCommand } from './local-stack.ts';
import {
  databaseAddress,
  infraDown,
  infraReset,
  infraStatus,
  infraUp,
  type StackDependencies,
} from './stack-commands.ts';

const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' });
const failed = (stderr = 'falló'): CommandResult => ({ status: 1, stdout: '', stderr });

const ENV = {
  S3_BUCKET: 'arza-one-local',
  S3_ACCESS_KEY: 'GK000000000000000000000000',
  S3_SECRET_KEY: 'secreto-de-prueba',
  POSTGRES_PORT: '5433',
};
const FILES = { composeFile: 'local.yml', envFile: '.env' };
const READY_LAYOUT = 'Current cluster layout version: 1';

interface Recorder {
  readonly calls: string[];
  readonly printed: string[];
  readonly deps: StackDependencies;
}

/** Simula docker y pnpm: responde según el comando y registra cada llamada. */
function recorder(responses: Record<string, CommandResult> = {}): Recorder {
  const calls: string[] = [];
  const printed: string[] = [];
  const answer = (line: string): CommandResult =>
    Object.entries(responses).find(([prefix]) => line.startsWith(prefix))?.[1] ?? ok();
  const run: RunCommand = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    return answer(line);
  };
  const garage = (args: readonly string[]): CommandResult => {
    const line = ['garage', ...args].join(' ');
    calls.push(line);
    return answer(line);
  };
  const print = (message: string): void => {
    printed.push(message);
  };
  return {
    calls,
    printed,
    deps: { run, garage, files: FILES, pnpm: ['node', 'pnpm.cjs'], node: 'node', env: ENV, print },
  };
}

describe('infraUp', () => {
  it('enciende los servicios, prepara Garage y la base de datos, en ese orden', () => {
    const { calls, printed, deps } = recorder({ 'garage layout show': ok(READY_LAYOUT) });
    infraUp(deps);
    expect(calls[0]).toBe('docker info --format {{.ServerVersion}}');
    expect(calls[1]).toBe(
      'docker compose --file local.yml --env-file .env up --detach --wait --wait-timeout 300 ' +
        'postgres valkey garage gotenberg mailpit',
    );
    expect(calls[2]).toBe('docker compose --file local.yml --env-file .env up --detach clamav');
    expect(calls.at(-3)).toMatch(/^node -e .*net\.connect\(5433, "localhost"\)/su);
    expect(calls.slice(-2)).toEqual(['node pnpm.cjs db:migrate', 'node pnpm.cjs db:seed:demo']);
    expect(printed.join('')).toContain('localhost:5433');
    expect(printed.join('')).toContain('http://localhost:8025');
  });
});

describe('infraUp: fallas', () => {
  it('pide abrir Docker Desktop si Docker no responde', () => {
    const { calls, deps } = recorder({ 'docker info': failed() });
    expect(() => {
      infraUp(deps);
    }).toThrow('Abra Docker Desktop');
    expect(calls).toHaveLength(1);
  });
});

describe('infraUp: fallas', () => {
  it('explica cómo cambiar un puerto ocupado si los servicios no arrancan', () => {
    const { deps } = recorder({ 'docker compose': failed() });
    expect(() => {
      infraUp(deps);
    }).toThrow('POSTGRES_PORT=5433');
  });
});

describe('infraUp: fallas', () => {
  it('si la base de datos no abre su puerto, lo explica y no migra', () => {
    const { calls, deps } = recorder({
      'garage layout show': ok(READY_LAYOUT),
      'node -e': failed(),
    });
    expect(() => {
      infraUp(deps);
    }).toThrow('La base de datos no responde en localhost:5433');
    expect(calls).not.toContain('node pnpm.cjs db:migrate');
  });
});

describe('infraUp: fallas', () => {
  it('se detiene en la migración que falla, sin cargar datos semilla', () => {
    const { calls, deps } = recorder({
      'garage layout show': ok(READY_LAYOUT),
      'node pnpm.cjs db:migrate': failed(),
    });
    expect(() => {
      infraUp(deps);
    }).toThrow('Falló «pnpm db:migrate»');
    expect(calls).not.toContain('node pnpm.cjs db:seed:demo');
  });
});

describe('infraUp: fallas', () => {
  it('exige las variables del almacenamiento antes de encender nada', () => {
    const { calls, deps } = recorder();
    expect(() => {
      infraUp({ ...deps, env: { S3_BUCKET: 'arza-one-local' } });
    }).toThrow('Faltan S3_BUCKET, S3_ACCESS_KEY o S3_SECRET_KEY');
    expect(calls).toEqual([]);
  });
});

describe('databaseAddress', () => {
  it('toma la dirección de DATABASE_MIGRATION_URL y, sin ella, POSTGRES_PORT', () => {
    const url = 'postgresql://migration_user:clave@127.0.0.1:5434/arza_one';
    expect(databaseAddress({ DATABASE_MIGRATION_URL: url })).toEqual({
      host: '127.0.0.1',
      port: 5434,
    });
    expect(databaseAddress({ POSTGRES_PORT: '5433' })).toEqual({ host: 'localhost', port: 5433 });
    expect(databaseAddress({})).toEqual({ host: 'localhost', port: 5432 });
  });
});

describe('infraDown', () => {
  it('detiene los servicios sin borrar datos', () => {
    const { calls, printed, deps } = recorder();
    infraDown(deps);
    expect(calls).toEqual([
      'docker info --format {{.ServerVersion}}',
      'docker compose --file local.yml --env-file .env down',
    ]);
    expect(printed.join('')).toContain('Los datos se conservan');
  });
});

describe('infraDown', () => {
  it('avisa si no pudo detenerlos', () => {
    const { deps } = recorder({ 'docker compose': failed() });
    expect(() => {
      infraDown(deps);
    }).toThrow('No se pudieron detener');
  });
});

describe('infraStatus', () => {
  it('muestra el estado de todos los servicios, también los detenidos', () => {
    const { calls, deps } = recorder();
    infraStatus(deps);
    expect(calls.at(-1)).toBe('docker compose --file local.yml --env-file .env ps --all');
  });
});

describe('infraReset', () => {
  const volumes = ok('arza-one-local_postgres-data\narza-one-local_clamav-signatures\notro\n');

  it('borra solo los volúmenes de datos existentes y vuelve a encender todo', () => {
    const { calls, deps } = recorder({
      'docker volume ls': volumes,
      'garage layout show': ok(READY_LAYOUT),
    });
    infraReset(deps);
    expect(calls).toContain('docker volume rm arza-one-local_postgres-data');
    expect(calls.join('\n')).not.toContain('volume rm arza-one-local_clamav-signatures');
    expect(calls.at(-1)).toBe('node pnpm.cjs db:seed:demo');
  });

  it('no intenta borrar si no hay volúmenes de datos', () => {
    const { calls, deps } = recorder({
      'docker volume ls': ok(''),
      'garage layout show': ok(READY_LAYOUT),
    });
    infraReset(deps);
    expect(calls.some((call) => call.startsWith('docker volume rm'))).toBe(false);
  });

  it('se detiene si no puede borrar los datos', () => {
    const { calls, deps } = recorder({
      'docker volume ls': volumes,
      'docker volume rm': failed(),
    });
    expect(() => {
      infraReset(deps);
    }).toThrow('No se pudieron borrar los datos locales');
    expect(calls.some((call) => call.includes(' up '))).toBe(false);
  });
});
