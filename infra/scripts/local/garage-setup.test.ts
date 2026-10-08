import { describe, expect, it } from 'vitest';

import { setupGarage, type GarageCli } from './garage-setup.ts';
import type { CommandResult } from './local-stack.ts';

const SETTINGS = {
  bucket: 'arza-one-local',
  accessKeyId: 'GK0123456789abcdef01234567',
  secretAccessKey: 'f'.repeat(64),
};
const NEW_LAYOUT = [
  '==== CURRENT CLUSTER LAYOUT ====',
  'No nodes currently have a role in the cluster.',
  'Current cluster layout version: 0',
].join('\n');
const READY_LAYOUT = 'Current cluster layout version: 1';

const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' });
const failed = (stderr = 'Error'): CommandResult => ({ status: 1, stdout: '', stderr });

function fakeGarage(responses: Record<string, CommandResult>): {
  cli: GarageCli;
  calls: string[];
} {
  const calls: string[] = [];
  const cli: GarageCli = (args) => {
    const line = args.join(' ');
    calls.push(line);
    return Object.entries(responses).find(([prefix]) => line.startsWith(prefix))?.[1] ?? ok();
  };
  return { cli, calls };
}

describe('setupGarage: preparación', () => {
  it('en un Garage nuevo asigna la capacidad, crea el depósito e importa la llave', () => {
    const { cli, calls } = fakeGarage({
      'layout show': ok(NEW_LAYOUT),
      'node id': ok('cc1f1f274964d3b0aa@127.0.0.1:3901\n'),
      'bucket info': failed('NoSuchBucket'),
      'key info': failed('0 matching keys'),
    });
    setupGarage(cli, SETTINGS);
    expect(calls).toEqual([
      'layout show',
      'node id --quiet',
      'layout assign --zone local --capacity 10G cc1f1f274964d3b0aa',
      'layout apply --version 1',
      'bucket info arza-one-local',
      'bucket create arza-one-local',
      `key info ${SETTINGS.accessKeyId}`,
      `key import --yes -n arza-one-local ${SETTINGS.accessKeyId} ${SETTINGS.secretAccessKey}`,
      `bucket allow --read --write --owner arza-one-local --key ${SETTINGS.accessKeyId}`,
    ]);
  });

  it('si ya estaba preparado, solo confirma el permiso (se puede repetir sin efectos)', () => {
    const { cli, calls } = fakeGarage({ 'layout show': ok(READY_LAYOUT) });
    setupGarage(cli, SETTINGS);
    expect(calls).toEqual([
      'layout show',
      'bucket info arza-one-local',
      `key info ${SETTINGS.accessKeyId}`,
      `bucket allow --read --write --owner arza-one-local --key ${SETTINGS.accessKeyId}`,
    ]);
  });
});

describe('setupGarage: fallas', () => {
  it('informa el paso que falló con el mensaje de Garage', () => {
    const { cli } = fakeGarage({
      'layout show': ok(READY_LAYOUT),
      'bucket info': failed(),
      'bucket create': failed('Invalid bucket name'),
    });
    expect(() => {
      setupGarage(cli, SETTINGS);
    }).toThrow(/no se pudo crear el depósito\.\nInvalid bucket name/);
  });

  it('no muestra el secreto de la llave si falla su importación', () => {
    const { cli } = fakeGarage({
      'layout show': ok(READY_LAYOUT),
      'key info': failed(),
      'key import': failed('Invalid key'),
    });
    let message = '';
    try {
      setupGarage(cli, SETTINGS);
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('no se pudo importar la llave de acceso');
    expect(message).not.toContain(SETTINGS.secretAccessKey);
  });
});
