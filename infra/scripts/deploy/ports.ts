// Revisión de puertos desde fuera del servidor (B07, numeral 10.2): solo 80, 443 y SSH deben
// responder. Se prueban también los puertos de cada servicio interno; ninguno debe contestar.
import { Socket } from 'node:net';

/** Únicos puertos que pueden aceptar conexiones desde internet. */
const ALLOWED_PORTS = [22, 80, 443];
/** Puertos internos de la plataforma (numeral 10.3) y otros comunes que nunca deben abrirse. */
export const PROBED_PORTS = [
  21, 22, 25, 80, 443, 1025, 2019, 2375, 2376, 3000, 3001, 3310, 3900, 3901, 3903, 4000, 5432, 6379,
  8025, 8080, 9090,
];

/** Intenta conectarse a un puerto. Rechazado o sin respuesta (cortafuegos) cuenta como cerrado. */
export type Probe = (host: string, port: number) => Promise<boolean>;

export const tcpProbe: Probe = (host, port) =>
  new Promise((resolve) => {
    const socket = new Socket();
    const finish = (open: boolean): void => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(3000);
    socket.once('connect', () => {
      finish(true);
    });
    socket.once('timeout', () => {
      finish(false);
    });
    socket.once('error', () => {
      finish(false);
    });
    socket.connect(port, host);
  });

export interface PortReport {
  readonly open: number[];
  readonly unexpected: number[];
}

export async function checkPorts(
  host: string,
  probe: Probe = tcpProbe,
  sshPort = 22,
): Promise<PortReport> {
  const allowed = new Set([...ALLOWED_PORTS.filter((port) => port !== 22), sshPort]);
  const ports = [...new Set([...PROBED_PORTS, sshPort])].sort((a, b) => a - b);
  const results = await Promise.all(ports.map(async (port) => [port, await probe(host, port)]));
  const open = results.filter(([, isOpen]) => isOpen).map(([port]) => Number(port));
  return { open, unexpected: open.filter((port) => !allowed.has(port)) };
}

export function describePorts(report: PortReport): string {
  const open = report.open.length === 0 ? 'ninguno' : report.open.join(', ');
  if (report.unexpected.length === 0) {
    return `Puertos abiertos: ${open}. Solo los permitidos (80, 443 y SSH).\n`;
  }
  return `Puertos abiertos: ${open}. NO PERMITIDOS: ${report.unexpected.join(', ')}.\n`;
}
