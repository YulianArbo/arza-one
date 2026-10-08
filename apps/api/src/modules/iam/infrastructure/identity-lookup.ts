import { v7 as uuidv7 } from 'uuid';

import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { LinkPurpose } from '../domain/link-policy.js';
import type { RecentFailures } from '../domain/login-throttle.js';

// Búsquedas antes de conocer la empresa (migración de B08): solo dicen a qué usuario y empresa
// pertenece un correo, una sesión o un enlace. Todo lo demás se lee después en su empresa.

export interface IdentityRef {
  readonly userId: string;
  readonly tenantId: string;
}

export interface SessionRef extends IdentityRef {
  readonly sessionId: string;
}

export interface LinkRef extends IdentityRef {
  readonly tokenId: string;
}

export interface LoginAttemptInput {
  readonly email: string;
  readonly ip: string | null;
  readonly succeeded: boolean;
  readonly reason: 'ok' | 'password_reset' | 'bad_credentials' | 'delayed' | 'locked';
  readonly occurredAt: Date;
}

type Lookup = Pick<DatabaseService, 'withoutTenant'>;

interface IdentityRow {
  user_id: string;
  tenant_id: string;
}

export async function findLoginUser(database: Lookup, email: string): Promise<IdentityRef | null> {
  const rows = await database.withoutTenant(
    (transaction) =>
      transaction.$queryRaw<IdentityRow[]>`SELECT * FROM iam_find_login_user(${email})`,
  );
  const row = rows[0];
  return row === undefined ? null : { userId: row.user_id, tenantId: row.tenant_id };
}

export async function findSession(
  database: Lookup,
  tokenHash: string,
  now: Date,
): Promise<SessionRef | null> {
  const rows = await database.withoutTenant(
    (transaction) =>
      transaction.$queryRaw<
        (IdentityRow & { session_id: string })[]
      >`SELECT * FROM iam_find_session(${tokenHash}, ${now})`,
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { sessionId: row.session_id, userId: row.user_id, tenantId: row.tenant_id };
}

export async function findLink(
  database: Lookup,
  tokenHash: string,
  purpose: LinkPurpose,
  now: Date,
): Promise<LinkRef | null> {
  const rows = await database.withoutTenant(
    (transaction) =>
      transaction.$queryRaw<
        (IdentityRow & { token_id: string })[]
      >`SELECT * FROM iam_find_token(${tokenHash}, ${purpose}, ${now})`,
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { tokenId: row.token_id, userId: row.user_id, tenantId: row.tenant_id };
}

export async function recordLoginAttempt(
  database: Lookup,
  attempt: LoginAttemptInput,
): Promise<void> {
  const { email, ip, succeeded, reason, occurredAt } = attempt;
  await database.withoutTenant(
    (transaction) =>
      transaction.$executeRaw`SELECT iam_record_login_attempt(${email}, ${ip}, ${succeeded}, ${reason}, ${occurredAt}, ${uuidv7()}::uuid)`,
  );
}

export async function recentLoginFailures(
  database: Lookup,
  email: string,
  since: Date,
): Promise<RecentFailures> {
  const rows = await database.withoutTenant(
    (transaction) =>
      transaction.$queryRaw<
        { failures: number; last_failure_at: Date | null }[]
      >`SELECT * FROM iam_recent_login_failures(${email}, ${since})`,
  );
  const row = rows[0];
  return { count: row?.failures ?? 0, lastFailureAt: row?.last_failure_at ?? null };
}
