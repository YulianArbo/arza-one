import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

// Almacenamiento (Garage) y antivirus (ClamAV) reales para las pruebas de archivos (B14), con las
// mismas versiones que el entorno local (infra/compose/local.yml).

const GARAGE_IMAGE = 'dxflrs/garage:v2.1.0';
const CLAMAV_IMAGE = 'clamav/clamav:1.4.6';
const GARAGE_CONFIG = fileURLToPath(
  new URL('../../../../../infra/garage/garage.local.toml', import.meta.url),
);

export interface TestStorage {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface TestAntivirus {
  readonly host: string;
  readonly port: number;
}

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

async function garage(container: StartedTestContainer, args: string[]): Promise<string> {
  const result = await container.exec(['/garage', ...args]);
  if (result.exitCode !== 0) throw new Error(`Garage ${args.join(' ')}: ${result.output}`);
  return result.output;
}

/** Distribución del único nodo, depósito y llave, como infra/scripts/local/garage-setup.ts. */
async function prepareGarage(container: StartedTestContainer): Promise<TestStorage> {
  const nodeId = (await garage(container, ['node', 'id', '--quiet'])).trim().split('@')[0] ?? '';
  await garage(container, ['layout', 'assign', '--zone', 'test', '--capacity', '1G', nodeId]);
  await garage(container, ['layout', 'apply', '--version', '1']);
  const storage = {
    endpoint: `http://${container.getHost()}:${String(container.getMappedPort(3900))}`,
    region: 'garage',
    bucket: 'arza-one-test',
    accessKeyId: `GK${hex(12)}`,
    secretAccessKey: hex(32),
  };
  await garage(container, ['bucket', 'create', storage.bucket]);
  await garage(container, [
    'key',
    'import',
    '--yes',
    '-n',
    'pruebas',
    storage.accessKeyId,
    storage.secretAccessKey,
  ]);
  await garage(container, [
    'bucket',
    'allow',
    '--read',
    '--write',
    '--owner',
    storage.bucket,
    '--key',
    storage.accessKeyId,
  ]);
  return storage;
}

/** Un nodo de Garage con su depósito y una llave desechable, como `pnpm infra:up`. */
export async function startGarage(): Promise<{
  container: StartedTestContainer;
  storage: TestStorage;
}> {
  const container = await new GenericContainer(GARAGE_IMAGE)
    .withEnvironment({ GARAGE_RPC_SECRET: hex(32), GARAGE_ADMIN_TOKEN: hex(32) })
    .withCopyFilesToContainer([{ source: GARAGE_CONFIG, target: '/etc/garage.toml' }])
    .withExposedPorts(3900)
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .start();
  return { container, storage: await prepareGarage(container) };
}

/**
 * clamd con una sola firma: la del archivo de ensayo EICAR (su huella MD5 y su tamaño). Arranca en
 * segundos, en lugar de los minutos que tarda en cargar la base completa de firmas.
 */
const EICAR_SIGNATURE = '44d88612fea8a8f36de82e1278abb02f:68:Eicar-Test-Signature\n';
const CLAMD_CONFIG = [
  'DatabaseDirectory /opt/testdb',
  'TCPSocket 3310',
  'TCPAddr 0.0.0.0',
  'Foreground yes',
  '',
].join('\n');

/** Respuesta de clamd a «PING»; vacía si el puerto aún no llega al demonio. */
async function ping(antivirus: TestAntivirus): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(antivirus);
    const received: Buffer[] = [];
    socket.on('data', (data: Buffer) => received.push(data));
    socket.on('error', () => {
      resolve('');
    });
    socket.on('end', () => {
      resolve(Buffer.concat(received).toString());
    });
    socket.on('connect', () => socket.write(`zPING${String.fromCharCode(0)}`));
  });
}

/**
 * clamd anuncia que está listo un instante antes de atender: con el equipo cargado, la primera
 * conexión se cierra sin respuesta. Se espera hasta que conteste PONG (como mucho 30 s).
 */
async function untilAnswers(antivirus: TestAntivirus): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await ping(antivirus)).startsWith('PONG')) return;
    await delay(500);
  }
  throw new Error('ClamAV de pruebas no respondió a PING.');
}

export async function startClamav(): Promise<{
  container: StartedTestContainer;
  antivirus: TestAntivirus;
}> {
  const container = await new GenericContainer(CLAMAV_IMAGE)
    .withEntrypoint(['clamd'])
    .withCommand(['-c', '/opt/clamd.conf'])
    .withCopyContentToContainer([
      { content: CLAMD_CONFIG, target: '/opt/clamd.conf' },
      { content: EICAR_SIGNATURE, target: '/opt/testdb/test.hdb' },
    ])
    .withExposedPorts(3310)
    .withWaitStrategy(Wait.forLogMessage(/Self checking every/))
    .start();
  // En Docker Desktop, «localhost» puede ir por IPv6 a un puerto que acepta la conexión y la
  // cierra sin responder; 127.0.0.1 llega siempre al contenedor.
  const host = container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
  const antivirus = { host, port: container.getMappedPort(3310) };
  await untilAnswers(antivirus);
  return { container, antivirus };
}
