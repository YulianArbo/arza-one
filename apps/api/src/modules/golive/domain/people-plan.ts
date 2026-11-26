import {
  createPartyRequestSchema,
  emailSchema,
  isValidNit,
  type CreatePartyRequest,
  type PartyRole,
} from '@arza/contracts';

import { nameKey, type KnownStructure, type Ref } from './known.js';
import {
  listOf,
  normalizedHeader,
  readSheet,
  repeatedKeys,
  type SheetColumns,
  type SheetProblem,
} from './sheet.js';

// Plantillas «usuarios.csv» y «terceros.csv» de la carga inicial (B45, decisiones 1 y 3). Una
// persona interna recibe la invitación de siempre, con segundo factor obligatorio, el rol
// COLABORADOR y los roles de la plantilla; los de administrador se asignan a mano. Los terceros
// son organizaciones con NIT, clientes o proveedores. Lo que ya existe se informa y no se toca.

type UserColumn = 'email' | 'name' | 'position' | 'roles';
type CompanyColumn =
  'nit' | 'digit' | 'legal' | 'trade' | 'roles' | 'email' | 'phone' | 'city' | 'address';

export const USER_COLUMNS: SheetColumns<UserColumn> = {
  headers: {
    email: ['correo', 'correoelectronico'],
    name: ['nombre', 'nombrecompleto'],
    position: ['cargo'],
    roles: ['roles', 'rol'],
  },
  required: ['email', 'name'],
  labels: { email: 'Correo', name: 'Nombre', position: 'Cargo', roles: 'Roles' },
};

export const COMPANY_COLUMNS: SheetColumns<CompanyColumn> = {
  headers: {
    nit: ['nit'],
    digit: ['dv', 'digitoverificacion'],
    legal: ['razonsocial'],
    trade: ['nombrecomercial'],
    roles: ['papel', 'papeles'],
    email: ['correo', 'correoelectronico'],
    phone: ['telefono'],
    city: ['ciudad'],
    address: ['direccion'],
  },
  required: ['nit', 'digit', 'legal', 'roles'],
  labels: {
    nit: 'NIT',
    digit: 'DV',
    legal: 'Razón social',
    trade: 'Nombre comercial',
    roles: 'Papel',
    email: 'Correo',
    phone: 'Teléfono',
    city: 'Ciudad',
    address: 'Dirección',
  },
};

const PARTY_ROLES: Readonly<Record<string, PartyRole>> = {
  cliente: 'customer',
  proveedor: 'supplier',
};

export interface PlannedUser {
  readonly row: number;
  readonly email: string;
  readonly displayName: string;
  readonly position: Ref | null;
  readonly roleCodes: readonly string[];
}

export interface PlannedCompany {
  readonly row: number;
  readonly nit: string;
  readonly input: CreatePartyRequest;
}

export interface Plan<T> {
  readonly items: readonly T[];
  readonly existing: number;
  readonly problems: readonly SheetProblem[];
}

export interface UserContext {
  readonly known: KnownStructure;
  /** Cargos nuevos de cargos.csv que se crean en la misma carga, por nombre en minúsculas. */
  readonly newPositions: ReadonlySet<string>;
  /** Códigos de los roles que se pueden asignar por lote. */
  readonly roles: ReadonlySet<string>;
  /** Correos que ya tienen cuenta en la empresa. */
  readonly accounts: ReadonlySet<string>;
}

function userPosition(name: string, context: UserContext): Ref | string {
  const key = nameKey(name);
  const matches = context.known.positions.filter((position) => nameKey(position.name) === key);
  const [match, other] = matches;
  if (other !== undefined) return `hay más de un cargo llamado «${name}»`;
  if (match !== undefined) {
    return match.isActive ? { kind: 'existing', id: match.id } : `el cargo «${name}» está inactivo`;
  }
  if (context.newPositions.has(key)) return { kind: 'new', key };
  return `el cargo «${name}» no existe ni está en cargos.csv`;
}

function rolesProblem(codes: readonly string[], context: UserContext): string | null {
  const refused = codes.filter((code) => !context.roles.has(code));
  if (refused.length === 0) return null;
  return `estos roles no se asignan por carga: ${refused.join(', ')} (asígnelos en Administración)`;
}

/** Revisa usuarios.csv; las filas de correos con cuenta se cuentan como existentes. */
export function planUsers(
  parsed: readonly (readonly string[])[],
  context: UserContext,
): Plan<PlannedUser> {
  const sheet = readSheet(parsed, USER_COLUMNS);
  const problems: SheetProblem[] = [...sheet.problems];
  const rows = sheet.rows.map((item) => ({
    ...item,
    email: (item.cells.email ?? '').toLowerCase(),
  }));
  const repeated = repeatedKeys(rows, (item) => item.email);
  const items: PlannedUser[] = [];
  let existing = 0;
  for (const item of rows) {
    const { row, email, cells } = item;
    const own: string[] = [];
    if (repeated.has(item)) own.push('el correo está repetido en el archivo');
    if (!emailSchema.safeParse(email).success) own.push('el correo no es válido');
    const name = (cells.name ?? '').trim();
    if (name.length < 2 || name.length > 120) own.push('el nombre debe tener entre 2 y 120 letras');
    const position = cells.position === undefined ? null : userPosition(cells.position, context);
    if (typeof position === 'string') own.push(position);
    const roleCodes = [...new Set(listOf(cells.roles).map((code) => code.toUpperCase()))];
    const refused = rolesProblem(roleCodes, context);
    if (refused !== null) own.push(refused);
    problems.push(...own.map((problem) => ({ row, key: email, problem })));
    if (own.length > 0 || typeof position === 'string') continue;
    if (context.accounts.has(email)) existing += 1;
    else items.push({ row, email, displayName: name, position, roleCodes });
  }
  return { items, existing, problems };
}

function companyRoles(value: string | undefined): PartyRole[] | null {
  const roles = listOf(value).map((item) => PARTY_ROLES[normalizedHeader(item)]);
  if (roles.length === 0 || roles.some((role) => role === undefined)) return null;
  return [...new Set(roles.filter((role) => role !== undefined))];
}

function companyInput(cells: Readonly<Partial<Record<CompanyColumn, string>>>, roles: PartyRole[]) {
  return createPartyRequestSchema.safeParse({
    kind: 'organization',
    id_type: 'NIT',
    id_number: cells.nit ?? null,
    check_digit: cells.digit === undefined ? null : Number(cells.digit),
    legal_name: cells.legal ?? null,
    trade_name: cells.trade ?? null,
    email: cells.email?.toLowerCase() ?? null,
    phone: cells.phone ?? null,
    city: cells.city ?? null,
    address: cells.address ?? null,
    status: 'active',
    roles,
  });
}

function companyProblems(cells: Readonly<Partial<Record<CompanyColumn, string>>>): string[] {
  const nit = cells.nit ?? '';
  const digit = Number(cells.digit);
  if (!/^\d{5,15}$/u.test(nit))
    return ['el NIT lleva solo números, sin puntos ni dígito de verificación'];
  if (!/^\d$/u.test(cells.digit ?? '') || !isValidNit(nit, digit))
    return ['el dígito de verificación no corresponde al NIT'];
  return [];
}

/** Revisa terceros.csv; los NIT que ya están registrados se cuentan como existentes. */
export function planCompanies(
  parsed: readonly (readonly string[])[],
  registered: ReadonlySet<string>,
): Plan<PlannedCompany> {
  const sheet = readSheet(parsed, COMPANY_COLUMNS);
  const problems: SheetProblem[] = [...sheet.problems];
  const repeated = repeatedKeys(sheet.rows, (item) => item.cells.nit ?? '');
  const items: PlannedCompany[] = [];
  let existing = 0;
  for (const item of sheet.rows) {
    const { row, cells } = item;
    const nit = cells.nit ?? '';
    const roles = companyRoles(cells.roles);
    const own = companyProblems(cells);
    if (repeated.has(item)) own.push('el NIT está repetido en el archivo');
    if (roles === null) own.push('el papel debe ser «Cliente», «Proveedor» o ambos');
    const parsedInput = companyInput(cells, roles ?? []);
    if (own.length === 0 && !parsedInput.success) {
      own.push(
        ...parsedInput.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    problems.push(...own.map((problem) => ({ row, key: nit, problem })));
    if (own.length > 0 || !parsedInput.success) continue;
    if (registered.has(nit)) existing += 1;
    else items.push({ row, nit, input: parsedInput.data });
  }
  return { items, existing, problems };
}
