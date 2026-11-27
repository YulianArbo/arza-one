import { IAM_ERROR_CODES, TENANCY_ERROR_CODES as CODES } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  adminEmailTaken,
  exportInProgressError,
  exportNotFound,
  exportNotReady,
  platformError,
  taxIdMismatch,
  taxIdTaken,
} from './tenancy-messages.js';

describe('errores de multiempresa', () => {
  it.each([
    [CODES.operatorOnly, 403],
    [CODES.operatorProtected, 422],
    [CODES.tenantNotFound, 404],
    [CODES.exportRequired, 422],
    [CODES.statusInvalid, 409],
  ])('traduce el error de base de datos %s al estado %i', (code, status) => {
    expect(platformError(new Error(code))).toMatchObject({ code, status });
  });

  it('conserva los errores desconocidos para el filtro general', () => {
    const error = new Error('fallo inesperado');
    expect(platformError(error)).toBe(error);
  });

  it.each([
    [taxIdMismatch, CODES.taxIdMismatch, 422],
    [taxIdTaken, 'CORE_TAX_ID_TAKEN', 409],
    [adminEmailTaken, IAM_ERROR_CODES.emailTaken, 409],
    [exportNotFound, CODES.exportNotFound, 404],
    [exportNotReady, CODES.exportNotReady, 409],
    [exportInProgressError, CODES.exportInProgress, 409],
  ])('expone el error %s con el código %s y el estado %i', (createError, code, status) => {
    expect(createError()).toMatchObject({ code, status });
  });
});
