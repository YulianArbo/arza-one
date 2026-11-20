import { HttpStatus } from '@nestjs/common';
import { HR_ERROR_CODES, type HrRef } from '@arza/contracts';

import type { HrEmployee, Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { superiorPositionId } from '../../core/index.js';
import { activeUsersInPosition, peopleById, positionOfUser } from '../../iam/index.js';
import { candidateParties } from '../../party/index.js';

// Ayudas que comparten los casos de uso de B36: quién consulta, a qué colaborador corresponde su
// cuenta, quién es su jefe inmediato (numeral 15.4: el jefe ve y decide lo de su equipo directo),
// los nombres para mostrar y la auditoría dentro de la transacción.

/** Quien actúa: la persona, la hora del caso de uso y los datos de la petición. */
export interface HrActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

/** Quien consulta, con sus permisos. */
export interface HrViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

export function hrNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, HR_ERROR_CODES.recordNotFound, message);
}

export function hrInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, HR_ERROR_CODES.recordInvalid, message);
}

export function hrConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, HR_ERROR_CODES.statusInvalid, message);
}

/** Bloquea por clave para que un reintento o una petición simultánea no duplique el registro. */
export async function lockKey(tx: TenantTransaction, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Auditoría de Talento humano en la misma transacción del cambio. */
export async function auditHr(
  tx: TenantTransaction,
  actor: HrActor,
  event: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly changes: Prisma.InputJsonObject;
  },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    result: 'success',
    changes: event.changes,
    meta: actor.meta,
  });
}

/** El colaborador activo que corresponde a la cuenta, o null si no tiene vinculación. */
export async function employeeOfUser(
  tx: TenantTransaction,
  userId: string,
): Promise<HrEmployee | null> {
  return tx.hrEmployee.findFirst({
    where: { userId, status: 'active', deletedAt: null },
    orderBy: { hireDate: 'desc' },
  });
}

/** El colaborador activo de la cuenta; si no tiene, la acción no le corresponde. */
export async function requireOwnEmployee(
  tx: TenantTransaction,
  userId: string,
): Promise<HrEmployee> {
  const employee = await employeeOfUser(tx, userId);
  if (employee === null) {
    throw hrNotFound('Su cuenta no está vinculada como colaborador activo.');
  }
  return employee;
}

/** Colaborador activo por su identificador. */
export async function requireActiveEmployee(
  tx: TenantTransaction,
  employeeId: string,
): Promise<HrEmployee> {
  const employee = await tx.hrEmployee.findFirst({
    where: { id: employeeId, status: 'active', deletedAt: null },
  });
  if (employee === null) throw hrNotFound('El colaborador no existe o no está activo.');
  return employee;
}

/** Cuenta del jefe inmediato según el organigrama; null en la cabeza o si el cargo está vacío. */
export async function managerOf(
  tx: TenantTransaction,
  employee: Pick<HrEmployee, 'positionId' | 'userId'>,
): Promise<string | null> {
  const superior = await superiorPositionId(tx, employee.positionId);
  if (superior === null) return null;
  const managers = await activeUsersInPosition(tx, superior);
  return managers.find((id) => id !== employee.userId) ?? null;
}

/** La persona ocupa el cargo al que reporta el colaborador. */
export async function isManagerOf(
  tx: TenantTransaction,
  userId: string,
  employee: Pick<HrEmployee, 'positionId' | 'userId'>,
): Promise<boolean> {
  if (employee.userId === userId) return false;
  const superior = await superiorPositionId(tx, employee.positionId);
  if (superior === null) return false;
  return (await positionOfUser(tx, userId)) === superior;
}

/** Colaboradores activos cuyo cargo reporta al cargo de la persona: su equipo directo. */
export async function teamOf(tx: TenantTransaction, userId: string): Promise<HrEmployee[]> {
  const position = await positionOfUser(tx, userId);
  if (position === null) return [];
  const subordinates = await tx.position.findMany({
    where: { reportsToId: position, deletedAt: null },
    select: { id: true },
  });
  if (subordinates.length === 0) return [];
  return tx.hrEmployee.findMany({
    where: {
      positionId: { in: subordinates.map(({ id }) => id) },
      status: 'active',
      deletedAt: null,
      NOT: { userId },
    },
    orderBy: [{ hireDate: 'asc' }, { id: 'asc' }],
  });
}

/** Decide quien tiene el permiso sobre todos, o el jefe inmediato designado del registro. */
export function decidesAsHrOrManager(
  viewer: HrViewer,
  permission: Parameters<typeof hasUnconditionalPermission>[1],
  approverId: string | null,
): boolean {
  return (
    hasUnconditionalPermission(viewer.ability, permission) ||
    (approverId !== null && approverId === viewer.principal.userId)
  );
}

/** Nombre de cada colaborador, por su identificador. */
export async function employeeRefs(
  tx: TenantTransaction,
  employees: readonly Pick<HrEmployee, 'id' | 'partyId'>[],
): Promise<Map<string, HrRef>> {
  const people = await candidateParties(
    tx,
    employees.map(({ partyId }) => partyId),
  );
  return new Map(
    employees.map((employee) => {
      const person = people.get(employee.partyId);
      const name =
        person === undefined
          ? 'Colaborador'
          : `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Colaborador';
      return [employee.id, { id: employee.id, name }];
    }),
  );
}

/** Nombre de los colaboradores por su identificador, cargándolos de la base. */
export async function employeeRefsById(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, HrRef>> {
  if (ids.length === 0) return new Map();
  const employees = await tx.hrEmployee.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, partyId: true },
  });
  return employeeRefs(tx, employees);
}

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, HrRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, present);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

/** Referencia a una cuenta, o null. */
export function refOf(refs: ReadonlyMap<string, HrRef>, id: string | null): HrRef | null {
  if (id === null) return null;
  return refs.get(id) ?? { id, name: 'Persona' };
}
