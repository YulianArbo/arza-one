import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

/** Lo que el guarda de NestJS espera de cada conteo (los tiempos van en segundos). */
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const KEY_PREFIX = 'arza:throttle';
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Cuenta y bloquea en un solo paso atómico dentro de Valkey, para que varias peticiones
 * simultáneas (o varias copias de la API) no se salten el límite.
 * KEYS[1] conteo · KEYS[2] bloqueo · ARGV[1] ventana (ms) · ARGV[2] límite · ARGV[3] bloqueo (ms).
 * Devuelve: impactos, ms para que venza la ventana, bloqueado (0/1), ms para que venza el bloqueo.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

function toSeconds(milliseconds: number): number {
  return Math.ceil(Math.max(milliseconds, 0) / MILLISECONDS_PER_SECOND);
}

function parseReply(reply: unknown): ThrottlerRecord {
  if (!Array.isArray(reply) || reply.length !== 4 || !reply.every(Number.isInteger)) {
    throw new TypeError('Respuesta inesperada de Valkey al contar peticiones.');
  }
  const [hits = 0, ttl = 0, blocked = 0, blockTtl = 0] = reply.map(Number);
  return {
    totalHits: hits,
    timeToExpire: toSeconds(ttl),
    isBlocked: blocked === 1,
    timeToBlockExpire: toSeconds(blockTtl),
  };
}

/**
 * Conteo del límite de peticiones en Valkey (numeral 13.1, paso 3; pendiente de B02). Sobrevive a
 * un reinicio de la API y es el mismo para todas sus copias. Si Valkey no responde, la petición
 * falla en lugar de pasar sin control: el límite es una protección de seguridad.
 */
export class ValkeyThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly client: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const base = `${KEY_PREFIX}:${throttlerName}:${key}`;
    const reply: unknown = await this.client.eval(
      INCREMENT_SCRIPT,
      2,
      `${base}:hits`,
      `${base}:blocked`,
      ttl,
      limit,
      blockDuration,
    );
    return parseReply(reply);
  }
}
