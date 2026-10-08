import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { checkPorts, describePorts, PROBED_PORTS, tcpProbe, type Probe } from './ports.ts';

const openOnly =
  (...open: number[]): Probe =>
  (_host, port) =>
    Promise.resolve(open.includes(port));

describe('revisión de puertos desde fuera del servidor', () => {
  it('acepta un servidor con solo 80, 443 y SSH abiertos', async () => {
    const report = await checkPorts('203.0.113.10', openOnly(22, 80, 443));
    expect(report).toEqual({ open: [22, 80, 443], unexpected: [] });
    expect(describePorts(report)).toBe(
      'Puertos abiertos: 22, 80, 443. Solo los permitidos (80, 443 y SSH).\n',
    );
  });

  it('señala la base de datos u otro servicio interno expuesto', async () => {
    const report = await checkPorts('203.0.113.10', openOnly(22, 80, 443, 5432, 8025));
    expect(report.unexpected).toEqual([5432, 8025]);
    expect(describePorts(report)).toContain('NO PERMITIDOS: 5432, 8025');
  });

  it('con SSH en otro puerto, el 22 abierto ya no es permitido', async () => {
    const report = await checkPorts('203.0.113.10', openOnly(22, 2222, 443), 2222);
    expect(report).toEqual({ open: [22, 443, 2222], unexpected: [22] });
  });

  it('revisa los puertos internos de cada servicio (numeral 10.3)', () => {
    expect(PROBED_PORTS).toEqual(
      expect.arrayContaining([2019, 3000, 3001, 3310, 3900, 3903, 4000, 5432, 6379, 8025]),
    );
  });

  it('un servidor sin nada abierto también lo informa', async () => {
    expect(describePorts(await checkPorts('203.0.113.10', openOnly()))).toBe(
      'Puertos abiertos: ninguno. Solo los permitidos (80, 443 y SSH).\n',
    );
  });
});

describe('sonda TCP real', () => {
  let server: Server | undefined;

  afterEach(async () => {
    const open = server;
    if (open === undefined) return;
    await new Promise((resolve) => {
      open.close(resolve);
    });
  });

  it('distingue un puerto que escucha de uno cerrado', async () => {
    server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await expect(tcpProbe('127.0.0.1', port)).resolves.toBe(true);
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
    await expect(tcpProbe('127.0.0.1', port)).resolves.toBe(false);
  });

  it('un puerto que no contesta (cortafuegos) cuenta como cerrado', async () => {
    // 192.0.2.0/24 es una red de documentación: nunca responde.
    await expect(tcpProbe('192.0.2.1', 81)).resolves.toBe(false);
  }, 10_000);
});
