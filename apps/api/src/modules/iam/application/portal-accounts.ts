import type { PortalRole } from '@arza/contracts';

import type { User } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { activeAssignmentWhere } from '../infrastructure/access-store.js';
import { revokeAllSessions } from '../infrastructure/accounts-store.js';
import { findRoleByCode, lockUser, revokeAssignment } from '../infrastructure/assignment-store.js';
import { roleNotFound, userNotFound, userStateInvalid } from './access-messages.js';
import { grantRole } from './role-assignment.js';

// Cuentas del portal del cliente (B30, ficha 17.10). El portal pregunta aquí de qué empresa cliente
// es cada persona y le pide al administrador del cliente administrar a los de su empresa: invitar
// (con la invitación de siempre), cambiar entre administrador y usuario, y desactivar. Nunca toca
// cuentas de otra empresa ni cuentas internas: quien no es de la empresa «no existe».

const PORTAL_ROLES: readonly PortalRole[] = ['CLIENTE_ADMIN', 'CLIENTE_USUARIO'];

/** Persona del portal ligada a su empresa cliente. */
export interface PortalAccount {
  readonly userId: string;
  readonly partyId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly mfaRequired: boolean;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
  readonly version: number;
}

/** Quien administra y desde dónde: queda en la auditoría. */
export interface PortalAdminActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly meta: RequestMeta;
  readonly at: Date;
}

function accountOf(user: User): PortalAccount | null {
  if (user.kind !== 'portal' || user.partyId === null || user.deletedAt !== null) return null;
  return {
    userId: user.id,
    partyId: user.partyId,
    email: user.email,
    displayName: user.displayName,
    mfaRequired: user.mfaRequired,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    version: user.version,
  };
}

/** La cuenta del portal de la persona, o null si es interna o no tiene empresa cliente. */
export async function portalAccountOf(
  tx: TenantTransaction,
  userId: string,
): Promise<PortalAccount | null> {
  const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
  return user === null ? null : accountOf(user);
}

/** El rol del portal vigente de la persona: administrador si lo tiene; si no, usuario. */
async function portalRoleOf(tx: TenantTransaction, userId: string, now: Date) {
  const assignments = await tx.userRole.findMany({
    where: { userId, ...activeAssignmentWhere(now), role: { code: { in: [...PORTAL_ROLES] } } },
    include: { role: true },
  });
  const codes = assignments.map((assignment) => assignment.role.code);
  if (codes.includes('CLIENTE_ADMIN')) return { role: 'CLIENTE_ADMIN' as const, assignments };
  if (codes.includes('CLIENTE_USUARIO')) return { role: 'CLIENTE_USUARIO' as const, assignments };
  return { role: null, assignments };
}

export interface CompanyAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: PortalRole;
  readonly status: 'invited' | 'active' | 'locked' | 'inactive';
  readonly lastLoginAt: Date | null;
  readonly version: number;
}

/** Las cuentas del portal de una empresa cliente, con su rol. */
export async function companyAccounts(
  tx: TenantTransaction,
  partyId: string,
  now: Date,
): Promise<CompanyAccount[]> {
  const users = await tx.user.findMany({
    where: { kind: 'portal', partyId, deletedAt: null },
    orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
  });
  return Promise.all(
    users.map(async (user) => ({
      id: user.id,
      name: user.displayName ?? user.email,
      email: user.email,
      role: (await portalRoleOf(tx, user.id, now)).role ?? 'CLIENTE_USUARIO',
      status: user.status as CompanyAccount['status'],
      lastLoginAt: user.lastLoginAt,
      version: user.version,
    })),
  );
}

/** El correo ya es de otra cuenta que no es de esta empresa: no se invita (ni se reenvía). */
export async function emailOutsideCompany(
  tx: TenantTransaction,
  email: string,
  partyId: string,
): Promise<boolean> {
  const user = await tx.user.findFirst({ where: { email, deletedAt: null } });
  return user !== null && (user.kind !== 'portal' || user.partyId !== partyId);
}

/** La cuenta de la empresa, bloqueada para cambiarla; «no existe» si es de otra. */
async function companyUser(tx: TenantTransaction, userId: string, partyId: string): Promise<User> {
  const user = await lockUser(tx, userId);
  if (user === null || accountOf(user)?.partyId !== partyId) throw userNotFound();
  return user;
}

async function auditAccount(
  tx: TenantTransaction,
  actor: PortalAdminActor,
  change: { readonly action: string; readonly userId: string; readonly changes: object },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: change.action,
    entityType: 'iam_user',
    entityId: change.userId,
    result: 'success',
    changes: { ...change.changes },
    meta: actor.meta,
  });
}

/** Cambia el rol del portal: retira el anterior y asigna el nuevo (con su alerta de permisos). */
export async function changePortalRole(
  tx: TenantTransaction,
  actor: PortalAdminActor,
  target: { readonly userId: string; readonly partyId: string; readonly role: PortalRole },
): Promise<boolean> {
  const user = await companyUser(tx, target.userId, target.partyId);
  const current = await portalRoleOf(tx, user.id, actor.at);
  if (current.role === target.role) return false;
  if (user.status === 'inactive') throw userStateInvalid('La cuenta está inactiva.');
  const role = await findRoleByCode(tx, target.role);
  if (role === null) throw roleNotFound();
  for (const assignment of current.assignments) {
    await revokeAssignment(
      tx,
      { userId: user.id, assignmentId: assignment.id },
      actor.userId,
      actor.at,
    );
  }
  await grantRole(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    user,
    role,
    validUntil: null,
    now: actor.at,
    meta: actor.meta,
  });
  return true;
}

/** Activa o desactiva la cuenta; al desactivarla se cierran todas sus sesiones. */
export async function setPortalAccountActive(
  tx: TenantTransaction,
  actor: PortalAdminActor,
  target: { readonly userId: string; readonly partyId: string; readonly active: boolean },
): Promise<boolean> {
  const user = await companyUser(tx, target.userId, target.partyId);
  const isActive = user.status !== 'inactive';
  if (isActive === target.active) return false;
  // Una cuenta que vuelve queda invitada si nunca entró; si ya tenía contraseña, activa.
  const status = target.active ? (user.passwordHash === null ? 'invited' : 'active') : 'inactive';
  await tx.user.update({ where: { id: user.id }, data: { status } });
  const closed = target.active
    ? 0
    : await revokeAllSessions(tx, user.id, 'remote_revoke', actor.at);
  const changes = { status: { from: user.status, to: status }, sessions_closed: closed };
  await auditAccount(tx, actor, { action: 'iam.portal_user.status', userId: user.id, changes });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    eventType: target.active ? 'iam.portal.user.activated' : 'iam.portal.user.deactivated',
    actorId: actor.userId,
    occurredAt: actor.at,
    payload: { id: user.id, party_id: target.partyId },
  });
  return true;
}

/** La persona corrige su propio nombre (If-Match con la versión que vio). */
export async function renamePortalAccount(
  tx: TenantTransaction,
  actor: PortalAdminActor,
  change: { readonly displayName: string; readonly version: number },
): Promise<boolean> {
  const user = await lockUser(tx, actor.userId);
  if (user === null) throw userNotFound();
  if (user.version !== change.version) return false;
  await tx.user.update({ where: { id: user.id }, data: { displayName: change.displayName } });
  const changes = { display_name: 'changed' };
  await auditAccount(tx, actor, { action: 'iam.portal_user.rename', userId: user.id, changes });
  return true;
}

/** El rol del portal vigente de una persona. */
export async function portalRoleOfUser(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<PortalRole | null> {
  return (await portalRoleOf(tx, userId, now)).role;
}
