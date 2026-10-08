import { Redis } from 'ioredis';

import { PROBE_TIMEOUT_MS } from '../health/health-probe.js';

/** Recibe los errores de conexión, que ioredis emite como eventos. */
export type ConnectionErrorHandler = (error: Error) => void;

/**
 * Conexión compartida a Valkey de la API: límite de peticiones, /health y colas (ADR-014).
 * Sin conexión, cada comando falla de inmediato en lugar de esperar en una fila: la petición
 * del usuario no se queda colgada. ioredis sigue reintentando conectarse por su cuenta.
 *
 * Espera el primer intento de conexión (hasta PROBE_TIMEOUT_MS). Si Valkey no responde, la API
 * arranca igual: /health lo informa y la conexión se recupera sola cuando Valkey vuelve.
 */
export async function connectValkey(url: string, onError: ConnectionErrorHandler): Promise<Redis> {
  const client = new Redis(url, {
    connectTimeout: PROBE_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  client.on('error', onError);
  await client.connect().catch(() => undefined);
  return client;
}

/** Cierra la conexión al apagar la aplicación. */
export async function closeValkey(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    await client.quit();
    return;
  }
  client.disconnect();
}
