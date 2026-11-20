import { describe, expect, it } from 'vitest';

import { systemRoleGrants, SYSTEM_ROLES } from '../iam/index.js';
import {
  announcementRequestSchema,
  ANNOUNCEMENT_LIMITS,
  publicAnnouncementQuerySchema,
} from './announcements.js';

const VALID = {
  title: 'Mantenimiento programado',
  body: 'El sábado la plataforma estará en mantenimiento de 6 a 8 a. m.',
  audience: 'both',
  starts_on: '2026-11-20',
  ends_on: '2026-11-30',
};

describe('comunicados del acceso (B36A)', () => {
  it('acepta un comunicado completo sin enlace ni imagen', () => {
    expect(announcementRequestSchema.parse(VALID)).toEqual({
      ...VALID,
      link_url: null,
      image_file_id: null,
    });
  });

  it('pide fin igual o posterior al inicio, enlace https y respeta los límites', () => {
    const wrongDates = announcementRequestSchema.safeParse({ ...VALID, ends_on: '2026-11-19' });
    expect(wrongDates.error?.issues[0]?.path).toEqual(['ends_on']);
    expect(
      announcementRequestSchema.safeParse({ ...VALID, ends_on: VALID.starts_on }).success,
    ).toBe(true);
    const http = { ...VALID, link_url: 'http://arza.example/aviso' };
    expect(announcementRequestSchema.safeParse(http).success).toBe(false);
    const long = { ...VALID, title: 'x'.repeat(ANNOUNCEMENT_LIMITS.title + 1) };
    expect(announcementRequestSchema.safeParse(long).success).toBe(false);
    expect(announcementRequestSchema.safeParse({ ...VALID, audience: 'all' }).success).toBe(false);
  });

  it('el acceso solo pide los de una pestaña: personal o clientes', () => {
    expect(publicAnnouncementQuerySchema.safeParse({ audience: 'staff' }).success).toBe(true);
    expect(publicAnnouncementQuerySchema.safeParse({ audience: 'both' }).success).toBe(false);
  });

  it('administran los comunicados solo la Dirección y el administrador de la plataforma', () => {
    const holders = SYSTEM_ROLES.filter((role) =>
      systemRoleGrants(role.code).some((grant) => grant.code === 'core.announcement.manage'),
    ).map((role) => role.code);
    expect(holders.sort()).toEqual(['ADMIN_PLATAFORMA', 'DIRECCION']);
  });
});
