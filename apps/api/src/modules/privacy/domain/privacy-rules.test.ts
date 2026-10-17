import { describe, expect, it } from 'vitest';

import {
  hasSensitiveData,
  isGrantDateValid,
  nextVersionNumber,
  purposesFitKey,
  unofferedPurposes,
} from './privacy-rules.js';

describe('reglas de privacidad', () => {
  it('las autorizaciones llevan finalidades y los textos informativos no', () => {
    expect(purposesFitKey('authorization_customer', ['COMMERCIAL'])).toBe(true);
    expect(purposesFitKey('authorization_customer', [])).toBe(false);
    expect(purposesFitKey('privacy_policy', [])).toBe(true);
    expect(purposesFitKey('privacy_notice', ['COMMERCIAL'])).toBe(false);
  });

  it('señala las finalidades que el texto no ofreció', () => {
    expect(unofferedPurposes(['COMMERCIAL', 'BILLING'], ['BILLING'])).toEqual([]);
    expect(unofferedPurposes(['COMMERCIAL'], ['COMMERCIAL', 'MARKETING'])).toEqual(['MARKETING']);
  });

  it('la fecha de la autorización no puede ser futura', () => {
    expect(isGrantDateValid('2026-10-16', '2026-10-16')).toBe(true);
    expect(isGrantDateValid('2026-01-31', '2026-10-16')).toBe(true);
    expect(isGrantDateValid('2026-10-17', '2026-10-16')).toBe(false);
  });

  it('reconoce los datos sensibles', () => {
    expect(hasSensitiveData(['identification', 'contact'])).toBe(false);
    expect(hasSensitiveData(['contact', 'health'])).toBe(true);
    expect(hasSensitiveData(['biometric'])).toBe(true);
  });

  it('numera las versiones desde 1', () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(3)).toBe(4);
  });
});
