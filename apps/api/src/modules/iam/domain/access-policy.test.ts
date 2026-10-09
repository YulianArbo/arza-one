import { describe, expect, it } from 'vitest';

import {
  assignmentExpiryProblem,
  delegationProblem,
  delegationStatus,
  fitsAudience,
  isUnusedAccount,
  roleCodeFromName,
} from './access-policy.js';

const NOW = new Date('2026-10-10T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const days = (count: number): Date => new Date(NOW.getTime() + count * DAY);

describe('vigencia de una asignación de rol', () => {
  it('un rol común puede no vencer, pero no vencer en el pasado', () => {
    expect(assignmentExpiryProblem('COMERCIAL', null, NOW)).toBeNull();
    expect(assignmentExpiryProblem('COMERCIAL', days(400), NOW)).toBeNull();
    expect(assignmentExpiryProblem('COMERCIAL', days(-1), NOW)).toBe('in_past');
    expect(assignmentExpiryProblem('COMERCIAL', NOW, NOW)).toBe('in_past');
  });

  it('el auditor siempre vence, a los 90 días como máximo', () => {
    expect(assignmentExpiryProblem('AUDITOR', null, NOW)).toBe('required');
    expect(assignmentExpiryProblem('AUDITOR', days(90), NOW)).toBeNull();
    expect(assignmentExpiryProblem('AUDITOR', days(91), NOW)).toBe('too_long');
  });

  it('cada rol es para su tipo de cuenta', () => {
    expect(fitsAudience('internal', 'internal')).toBe(true);
    expect(fitsAudience('portal', 'internal')).toBe(false);
  });
});

describe('código de un rol personalizado', () => {
  it('quita tildes y signos', () => {
    expect(roleCodeFromName('Apoyo comercial (junior)')).toBe('APOYO_COMERCIAL_JUNIOR');
    expect(roleCodeFromName('Gestión de órdenes')).toBe('GESTION_DE_ORDENES');
  });

  it('siempre empieza por una letra', () => {
    expect(roleCodeFromName('2026 auditores')).toBe('ROL_2026_AUDITORES');
  });
});

describe('delegación de aprobaciones', () => {
  const ana = '01999a00-0000-7000-8000-00000000a001';
  const luis = '01999a00-0000-7000-8000-00000000a002';
  const admin = '01999a00-0000-7000-8000-00000000a003';
  const draft = { actorId: ana, fromUserId: ana, toUserId: luis, startsAt: NOW, endsAt: days(10) };

  it('acepta una delegación a otra persona por menos de 60 días', () => {
    expect(delegationProblem(draft, NOW)).toBeNull();
    expect(delegationProblem({ ...draft, actorId: admin, endsAt: days(60) }, NOW)).toBeNull();
  });

  it('nadie se delega a sí mismo ni registra una delegación a su favor', () => {
    expect(delegationProblem({ ...draft, toUserId: ana }, NOW)).toBe('same_person');
    expect(delegationProblem({ ...draft, actorId: luis, fromUserId: admin }, NOW)).toBe('to_actor');
  });

  it('las fechas tienen sentido y no pasan de 60 días', () => {
    expect(delegationProblem({ ...draft, endsAt: NOW }, NOW)).toBe('ends_before_start');
    const past = { ...draft, startsAt: days(-5), endsAt: days(-1) };
    expect(delegationProblem(past, NOW)).toBe('ends_in_past');
    expect(delegationProblem({ ...draft, endsAt: days(61) }, NOW)).toBe('too_long');
  });

  it('informa si está programada, vigente, terminada o retirada', () => {
    const base = { startsAt: NOW, endsAt: days(10), revokedAt: null };
    expect(delegationStatus({ ...base, startsAt: days(1) }, NOW)).toBe('scheduled');
    expect(delegationStatus(base, NOW)).toBe('active');
    expect(delegationStatus({ ...base, endsAt: NOW }, NOW)).toBe('ended');
    expect(delegationStatus({ ...base, revokedAt: NOW }, NOW)).toBe('revoked');
  });
});

describe('cuentas sin uso (revisión de accesos)', () => {
  const created = days(-200);

  it('una cuenta activa sin ingresar en 60 días está sin uso', () => {
    const user = { status: 'active', createdAt: created };
    expect(isUnusedAccount({ ...user, lastLoginAt: days(-61) }, NOW)).toBe(true);
    expect(isUnusedAccount({ ...user, lastLoginAt: days(-59) }, NOW)).toBe(false);
  });

  it('si nunca entró, cuenta desde que se creó; las inactivas no cuentan', () => {
    expect(isUnusedAccount({ status: 'active', lastLoginAt: null, createdAt: created }, NOW)).toBe(
      true,
    );
    const recent = { status: 'active', lastLoginAt: null, createdAt: days(-3) };
    expect(isUnusedAccount(recent, NOW)).toBe(false);
    const inactive = { status: 'inactive', lastLoginAt: null, createdAt: created };
    expect(isUnusedAccount(inactive, NOW)).toBe(false);
  });
});
