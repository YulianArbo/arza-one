import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';
import { idempotencyKeyFrom, idempotencyKeyReused } from './idempotency-key.js';

function errorOf(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return null;
}

describe('llave Idempotency-Key', () => {
  it('acepta un UUID y quita los espacios', () => {
    expect(idempotencyKeyFrom(' 0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d ')).toBe(
      '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d',
    );
  });

  it.each([undefined, '', 'corta', 'con espacios dentro de la llave', 'x'.repeat(129)])(
    'rechaza «%s» con IDEMPOTENCY_KEY_REQUIRED',
    (header) => {
      const error = errorOf(() => idempotencyKeyFrom(header));
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    },
  );

  it('una llave ya usada con otros datos responde 409', () => {
    expect(idempotencyKeyReused()).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
