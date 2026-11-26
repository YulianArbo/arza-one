import type { PermissionCode } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { parseCsv } from '../../../platform/export/csv-read.js';
import { structureSnapshot } from '../../core/index.js';
import {
  hasAccount,
  hasFullPermission,
  loadableRoles,
  type InviteUserInput,
} from '../../iam/index.js';
import { hasCompanyWithNit } from '../../party/index.js';
import type { KnownStructure } from '../domain/known.js';
import { COMPANY_COLUMNS, USER_COLUMNS } from '../domain/people-plan.js';
import { readSheet } from '../domain/sheet.js';

// Lo que la carga inicial (B45) necesita saber antes de revisar las plantillas: si quien carga
// tiene los permisos y qué tiene ya la empresa. Todo se pregunta por el index.ts de cada módulo.

/** Las plantillas de la carpeta; la que no está no se carga. */
export interface LoadFiles {
  readonly areas?: string | undefined;
  readonly positions?: string | undefined;
  readonly users?: string | undefined;
  readonly companies?: string | undefined;
}

export interface LoadRequest {
  readonly tenantId: string;
  /** Quien hace la carga: queda como autor en la auditoría de cada alta. */
  readonly userId: string;
  readonly files: LoadFiles;
  readonly apply: boolean;
}

export interface Invitations {
  invite(input: InviteUserInput): Promise<unknown>;
}

export interface LoadDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
  readonly invitations: Invitations;
}

export type Rows = readonly (readonly string[])[];

export interface ParsedFiles {
  readonly areas: Rows;
  readonly positions: Rows;
  readonly users: Rows;
  readonly companies: Rows;
}

export interface Known {
  readonly structure: KnownStructure;
  readonly roles: ReadonlyMap<string, { readonly id: string }>;
  readonly accounts: ReadonlySet<string>;
  readonly nits: ReadonlySet<string>;
}

export function parsedFiles(files: LoadFiles): ParsedFiles {
  const rows = (text: string | undefined): Rows => (text === undefined ? [] : parseCsv(text));
  return {
    areas: rows(files.areas),
    positions: rows(files.positions),
    users: rows(files.users),
    companies: rows(files.companies),
  };
}

/** Permisos completos que pide cada plantilla presente, los mismos de las pantallas. */
export function neededPermissions(files: LoadFiles): PermissionCode[] {
  const needed: PermissionCode[] = [];
  if (files.areas !== undefined || files.positions !== undefined) needed.push('core.org.manage');
  if (files.users !== undefined) needed.push('iam.user.invite', 'iam.role.assign');
  if (files.companies !== undefined) needed.push('party.create');
  return needed;
}

export async function missingPermissions(
  tx: TenantTransaction,
  request: LoadRequest,
  at: Date,
): Promise<PermissionCode[]> {
  const missing: PermissionCode[] = [];
  for (const code of neededPermissions(request.files)) {
    if (!(await hasFullPermission(tx, request.userId, code, at))) missing.push(code);
  }
  return missing;
}

async function existing(
  values: readonly string[],
  exists: (value: string) => Promise<boolean>,
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const value of new Set(values)) if (await exists(value)) found.add(value);
  return found;
}

/** Lo que ya tiene la empresa, para comparar con las plantillas. */
export async function knownOf(tx: TenantTransaction, files: ParsedFiles): Promise<Known> {
  const emails = readSheet(files.users, USER_COLUMNS).rows.flatMap((row) =>
    row.cells.email === undefined ? [] : [row.cells.email.toLowerCase()],
  );
  const nits = readSheet(files.companies, COMPANY_COLUMNS).rows.flatMap((row) =>
    row.cells.nit === undefined ? [] : [row.cells.nit],
  );
  return {
    structure: await structureSnapshot(tx),
    roles: await loadableRoles(tx),
    accounts: await existing(emails, (email) => hasAccount(tx, email)),
    nits: await existing(nits, (nit) => hasCompanyWithNit(tx, nit)),
  };
}
