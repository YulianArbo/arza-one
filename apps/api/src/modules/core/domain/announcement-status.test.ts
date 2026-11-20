import { describe, expect, it } from 'vitest';

import { announcementStatus, audiencesFor } from './announcement-status.js';

const DATES = { startsOn: '2026-11-20', endsOn: '2026-11-30', ended: false };

describe('vigencia de un comunicado (B36A)', () => {
  it('se ve del primer al último día, ambos incluidos', () => {
    expect(announcementStatus(DATES, '2026-11-19')).toBe('scheduled');
    expect(announcementStatus(DATES, '2026-11-20')).toBe('active');
    expect(announcementStatus(DATES, '2026-11-30')).toBe('active');
    expect(announcementStatus(DATES, '2026-12-01')).toBe('expired');
  });

  it('terminado a mano deja de verse aunque sus fechas sigan vigentes', () => {
    expect(announcementStatus({ ...DATES, ended: true }, '2026-11-25')).toBe('ended');
  });

  it('cada pestaña del acceso ve los suyos y los de ambos', () => {
    expect(audiencesFor('staff')).toEqual(['staff', 'both']);
    expect(audiencesFor('clients')).toEqual(['clients', 'both']);
  });
});
