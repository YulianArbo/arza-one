// Latido del worker (numeral 10.3: «verificación de salud: latido en la cola»). El worker escribe
// cada 15 segundos una marca que vence a los 45; si la marca falta, el worker no está trabajando.

export const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TTL_MS = 45_000;

export function heartbeatKey(workerId: string): string {
  return `arza:worker:heartbeat:${workerId}`;
}

/** Lo único que el latido usa de Valkey. */
export interface HeartbeatClient {
  set(key: string, value: string, mode: 'PX', milliseconds: number): Promise<unknown>;
  exists(key: string): Promise<number>;
}

export async function beat(client: HeartbeatClient, workerId: string, now: Date): Promise<void> {
  await client.set(heartbeatKey(workerId), now.toISOString(), 'PX', HEARTBEAT_TTL_MS);
}

/** true si el worker emitió su latido en los últimos 45 segundos. */
export async function isAlive(client: HeartbeatClient, workerId: string): Promise<boolean> {
  return (await client.exists(heartbeatKey(workerId))) === 1;
}

/** Emite el latido de inmediato y luego cada 15 segundos. Devuelve la función para detenerlo. */
export function startHeartbeat(
  client: HeartbeatClient,
  workerId: string,
  onError: (error: unknown) => void,
): () => void {
  const emit = (): void => {
    beat(client, workerId, new Date()).catch(onError);
  };
  emit();
  const timer = setInterval(emit, HEARTBEAT_INTERVAL_MS);
  return () => {
    clearInterval(timer);
  };
}
