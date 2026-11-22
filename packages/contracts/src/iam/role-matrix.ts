import {
  PERMISSION_GROUPS,
  PERMISSIONS,
  permissionDefinition,
  type PermissionCode,
  type PermissionDefinition,
} from './permissions.js';

// Permisos de los roles del sistema (numerales 15.2 y 15.3). La matriz por módulo se transcribe
// igual que en el manual y de ella se deduce cada permiso según su nivel (permission-types.ts).
// Los permisos sensibles solo los reciben los roles que el numeral 15.2 nombra (EXTRAS).

/** Columnas de la matriz del numeral 15.3, en su orden. */
const MATRIX_COLUMNS = [
  'DIRECCION',
  'ADMIN_PLATAFORMA',
  'CALIDAD',
  'COMERCIAL',
  'LIDER_TECNICO',
  'EQUIPO_PROYECTO',
  'SERVICIO',
  'ADMIN_FINANCIERO',
  'CONTADOR',
  'TALENTO_HUMANO',
  'SST',
  'OFICIAL_DATOS',
  'COLABORADOR',
  'AUDITOR',
] as const;

export type InternalRoleCode = (typeof MATRIX_COLUMNS)[number];
export type PortalRoleCode = 'CLIENTE_ADMIN' | 'CLIENTE_USUARIO';
export type SystemRoleCode = InternalRoleCode | PortalRoleCode;

/**
 * Matriz del numeral 15.3: C crear y editar, L leer, A aprobar, P solo lo propio, - sin acceso.
 * Columnas: DIR ADM CAL COM TEC EQP SAC FIN CON GTH SST DAT COL AUD.
 */
const MATRIX: Readonly<Record<string, string>> = {
  core: '  L  CA L  L  L  L  L  L  L  L  L  L  L  L',
  iam: '   L  CA -  -  -  -  -  -  -  -  -  -  P  L',
  party: ' L  L  L  C  L  P  C  C  L  C  -  L  -  L',
  doc: '   LA L  CA C  C  P  C  C  L  C  C  C  P  L',
  wf: '    LA CA C  P  P  P  P  P  P  P  P  P  P  L',
  crm: '   LA -  L  CA L  -  L  L  -  -  -  -  -  L',
  contract: 'CA -  L  C  L  -  L  L  L  P  -  -  P  L',
  project: 'L  -  L  L  CA P  L  L  -  -  -  -  -  L',
  service: 'L  -  L  L  C  P  CA -  -  -  -  -  P  L',
  finance: 'LA -  -  L  -  -  -  CA L  -  -  -  P  L',
  purchase: 'LA -  L  P  P  P  P  CA L  P  P  -  P  L',
  hr: '    LA -  -  -  -  -  -  -  -  CA -  -  P  L',
  sst: '   L  -  L  -  -  -  -  -  -  L  CA -  P  L',
  qms: '   LA -  CA P  P  P  P  P  -  P  P  P  P  L',
  innovation: 'LA -  CA P  C  P  P  -  -  -  -  -  P  L',
  dashboard: 'L  -  L  P  P  -  P  P  P  P  P  P  -  L',
  web: '   LA C  L  C  -  -  -  -  -  -  -  CA -  L',
  privacy: 'LA -  L  -  -  -  -  -  -  -  -  CA P  L',
  audit: ' L  L  L  -  -  -  -  -  -  -  -  L  -  L',
};

/** Permisos sensibles (nivel restricted) y su porqué en el numeral 15.2. */
const EXTRAS: Readonly<Partial<Record<InternalRoleCode, readonly PermissionCode[]>>> = {
  // «Aprobaciones de alto nivel».
  // Las compras del tramo alto las aprueba solo la Dirección (decisión 2 del B33).
  // El salario exacto lo ven Talento humano, la Dirección y el Contador (ficha 17.13, decisión 7
  // del B35).
  // Los comunicados del acceso los publica también la Dirección (decisión del dueño, B36A).
  DIRECCION: [
    'party.due_diligence.approve',
    'purchase.request.approve_high',
    'hr.salary.read',
    'core.announcement.manage',
  ],
  // Las cuentas bancarias de terceros se registran y aprueban en finanzas (doble aprobación).
  ADMIN_FINANCIERO: [
    'party.bank_account.read',
    'party.bank_account.manage',
    'party.bank_account.approve',
  ],
  // «Lectura financiera, exportaciones contables, parámetros tributarios».
  // El cierre de periodo lo hace también el Contador (decisión 5 del B32).
  CONTADOR: [
    'party.bank_account.read',
    'finance.export',
    'finance.tax_parameter.manage',
    'finance.period.close',
    'hr.salary.read',
  ],
  TALENTO_HUMANO: ['hr.file.read', 'hr.salary.read'],
  // «Incluidos los conceptos de aptitud; nunca diagnósticos».
  SST: ['sst.medical.read', 'sst.medical.manage'],
  // «Solo lectura de evidencias y auditoría».
  AUDITOR: ['audit.event.export'],
  // Las PQRSF sobre datos personales se le trasladan (B29, decisión 5): debe poder abrirlas.
  OFICIAL_DATOS: ['service.pqrsf.read'],
};

/**
 * Permisos que la letra de la matriz daría, pero que el manual reserva a otro rol. Una cotización
 * con descuento sobre el tope exige aprobación de la Dirección (ficha 17.6); Comercial la elabora y
 * no la aprueba (decisión del dueño, B23). El acta de entrega la envía quien lidera (B27).
 */
const WITHHELD: Readonly<Partial<Record<InternalRoleCode, readonly PermissionCode[]>>> = {
  // Gastos, caja menor y conciliaciones los leen Finanzas, el Contador, la Dirección y el auditor;
  // Comercial solo lee facturas y presupuestos (decisión 5 del B32).
  COMERCIAL: ['crm.quote.approve', 'finance.ledger.read'],
  // El acta de entrega tiene valor ante el cliente: la envía el líder del proyecto o un Líder
  // técnico, no cualquier miembro del equipo (decisión 2 del B27).
  EQUIPO_PROYECTO: ['project.deliverable.submit'],
  // Calidad prepara el acta de revisión por la dirección; la aprueba solo la Dirección (decisión 5
  // del B39).
  CALIDAD: ['qms.review.approve'],
};

/**
 * Permisos de lectura que todo rol interno tiene, lo lea o no en la matriz: la base de conocimiento
 * es el manual de usuario de la plataforma (capítulo 22) y la ayuda del equipo (decisión 10 del B29);
 * las lecciones aprendidas son conocimiento de todo el personal (decisión 3 del B38).
 */
const EVERY_INTERNAL_ROLE: readonly PermissionCode[] = ['service.kb.read', 'qms.lesson.read'];

/** Solo por permiso nominal además del rol (numeral 15.4, clasificación): ningún rol lo trae. */
export const NOMINAL_ONLY_PERMISSIONS: readonly PermissionCode[] = ['doc.restricted.read'];

/**
 * Permisos que nadie tiene sobre todo: cada persona atiende solo sus tareas (B15). Los reciben,
 * limitados a lo propio, los roles que actúan en el módulo (C, A o P), no quien solo lee.
 */
const ALWAYS_OWN_PERMISSIONS: readonly PermissionCode[] = ['wf.task.work'];

/** Un permiso de un rol; con own, limitado a lo propio. */
export interface RoleGrant {
  readonly code: PermissionCode;
  readonly own: boolean;
}

function lettersOf(group: string, role: InternalRoleCode): string {
  const row = MATRIX[group];
  if (row === undefined) return '-';
  return row.trim().split(/\s+/)[MATRIX_COLUMNS.indexOf(role)] ?? '-';
}

function grantedByLetters(permission: PermissionDefinition, letters: string): RoleGrant | null {
  if (ALWAYS_OWN_PERMISSIONS.includes(permission.code)) {
    return /[CAP]/.test(letters) ? { code: permission.code, own: true } : null;
  }
  const canRead = letters.includes('L') || letters.includes('C');
  const byLevel: Record<PermissionDefinition['level'], boolean> = {
    read: canRead,
    write: letters.includes('C'),
    approve: letters.includes('A'),
    manage: letters.includes('C') && letters.includes('A'),
    restricted: false,
  };
  if (byLevel[permission.level]) return { code: permission.code, own: false };
  if (letters.includes('P') && permission.ownField !== null) {
    return { code: permission.code, own: true };
  }
  return null;
}

function internalGrants(role: InternalRoleCode): RoleGrant[] {
  const fromMatrix = PERMISSIONS.flatMap((permission) => {
    const grant = grantedByLetters(permission, lettersOf(permission.group, role));
    return grant === null ? [] : [grant];
  });
  const withheld = WITHHELD[role] ?? [];
  const kept = fromMatrix.filter((grant) => !withheld.includes(grant.code));
  const extraCodes = [...(EXTRAS[role] ?? []), ...EVERY_INTERNAL_ROLE];
  const missing = extraCodes.filter((code) => !kept.some((grant) => grant.code === code));
  return [...kept, ...[...new Set(missing)].map((code) => ({ code, own: false }))];
}

const PORTAL_CODES: readonly PermissionCode[] =
  PERMISSION_GROUPS.find((group) => group.key === 'portal')?.entries.map((entry) => entry[0]) ?? [];

/** Roles del portal (numeral 15.2): el administrador del cliente todo; el usuario, lo asignado. */
const PORTAL_GRANTS: Readonly<Record<PortalRoleCode, readonly RoleGrant[]>> = {
  CLIENTE_ADMIN: PORTAL_CODES.map((code) => ({ code, own: false })),
  CLIENTE_USUARIO: (
    [
      'portal.project.read',
      'portal.ticket.create',
      'portal.ticket.read',
      'portal.personal_data.manage',
    ] as const
  ).map((code) => ({ code, own: permissionDefinition(code).ownField !== null })),
};

function isPortalRole(code: SystemRoleCode): code is PortalRoleCode {
  return code === 'CLIENTE_ADMIN' || code === 'CLIENTE_USUARIO';
}

/** Permisos con que nace un rol del sistema. */
export function systemRoleGrants(code: SystemRoleCode): readonly RoleGrant[] {
  return isPortalRole(code) ? PORTAL_GRANTS[code] : internalGrants(code);
}

export const INTERNAL_ROLE_CODES: readonly InternalRoleCode[] = MATRIX_COLUMNS;
