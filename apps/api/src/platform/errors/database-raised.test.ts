import { describe, expect, it } from 'vitest';

import { mapException } from './error-mapper.js';
import { planLimitError, raisedByDatabase } from './database-raised.js';

describe('errores que lanza la base de datos (B48)', () => {
  it('encuentra el código en el mensaje o en sus causas', () => {
    const inner = new Error('ERROR: PLAN_LIMIT:internal_users');
    expect(raisedByDatabase(new Error('falló la consulta', { cause: inner }))).toBe(
      'PLAN_LIMIT:internal_users',
    );
    expect(raisedByDatabase(new Error('TENANCY_OPERATOR_ONLY'))).toBe('TENANCY_OPERATOR_ONLY');
    expect(raisedByDatabase(new Error('otra cosa'))).toBeNull();
    expect(raisedByDatabase('no es un error')).toBeNull();
  });

  it('el límite del plan llega a la persona como 409 con su mensaje', () => {
    const mapped = mapException(new Error('PLAN_LIMIT:storage'), 'abc');
    expect(mapped.status).toBe(409);
    expect(mapped.body.error.code).toBe('PLAN_LIMIT_REACHED');
    expect(mapped.body.error.message).toContain('espacio de archivos');
  });

  it('un tipo de límite desconocido no se traduce', () => {
    expect(planLimitError(new Error('PLAN_LIMIT:otra'))).toBeNull();
  });
});
