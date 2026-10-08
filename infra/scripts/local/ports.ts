// Puertos del entorno local (B06). Si un puerto ya está ocupado en el equipo (por ejemplo, por un
// PostgreSQL instalado en Windows), `pnpm env:local` escoge el siguiente libre y lo usa también en
// las direcciones que lo nombran.

export interface LocalPort {
  /** Variable de .env con el puerto que publica Docker. */
  readonly variable: string;
  readonly defaultPort: number;
  /** Variables cuyas direcciones apuntan a localhost:<puerto>. */
  readonly addresses: readonly string[];
}

export const LOCAL_PORTS: readonly LocalPort[] = [
  {
    variable: 'POSTGRES_PORT',
    defaultPort: 5432,
    addresses: ['DATABASE_URL', 'DATABASE_MIGRATION_URL'],
  },
  { variable: 'VALKEY_PORT', defaultPort: 6379, addresses: ['VALKEY_URL'] },
  { variable: 'GARAGE_S3_PORT', defaultPort: 3900, addresses: ['S3_ENDPOINT'] },
  { variable: 'GOTENBERG_PORT', defaultPort: 3001, addresses: ['GOTENBERG_URL'] },
  { variable: 'CLAMAV_PORT', defaultPort: 3310, addresses: [] },
  { variable: 'SMTP_PORT', defaultPort: 1025, addresses: [] },
  { variable: 'MAILPIT_UI_PORT', defaultPort: 8025, addresses: [] },
];

/** Cuántos puertos siguientes se prueban antes de rendirse. */
export const PORT_SEARCH_RANGE = 20;

export interface PortChange {
  readonly variable: string;
  readonly from: number;
  readonly to: number;
}

/** Elige, para cada puerto ocupado, el siguiente libre que no haya tomado otro servicio. */
export function choosePorts(isFree: (port: number) => boolean): PortChange[] {
  const taken = new Set(LOCAL_PORTS.map((port) => port.defaultPort));
  const changes: PortChange[] = [];
  for (const { variable, defaultPort } of LOCAL_PORTS) {
    if (isFree(defaultPort)) continue;
    const to = candidates(defaultPort).find((port) => !taken.has(port) && isFree(port));
    if (to === undefined) {
      throw new Error(`No hay un puerto libre para ${variable} cerca de ${String(defaultPort)}.`);
    }
    taken.add(to);
    changes.push({ variable, from: defaultPort, to });
  }
  return changes;
}

function candidates(port: number): number[] {
  return Array.from({ length: PORT_SEARCH_RANGE }, (_, index) => port + index + 1);
}

/** Aplica los cambios de puerto al contenido de un .env. */
export function applyPortChanges(env: string, changes: readonly PortChange[]): string {
  return env
    .split('\n')
    .map((line) => changes.reduce((current, change) => changeLine(current, change), line))
    .join('\n');
}

function changeLine(line: string, change: PortChange): string {
  const name = line.split('=', 1)[0] ?? '';
  const port = LOCAL_PORTS.find((candidate) => candidate.variable === change.variable);
  if (name === change.variable) return `${name}=${String(change.to)}`;
  if (port?.addresses.includes(name) !== true) return line;
  return line.replace(`localhost:${String(change.from)}`, `localhost:${String(change.to)}`);
}
