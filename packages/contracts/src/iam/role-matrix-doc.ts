import { PERMISSION_GROUPS, permissionDefinition } from './permissions.js';
import { NOMINAL_ONLY_PERMISSIONS, systemRoleGrants, type RoleGrant } from './role-matrix.js';
import { SYSTEM_ROLES, type SystemRoleDefinition } from './roles.js';

// Documento legible de «qué puede hacer cada rol» (docs/manual/datos/permisos-por-rol.md). Se
// genera desde la matriz para que nunca se desactualice: una prueba lo compara con el archivo.

const HEADER = [
  '# Permisos por rol',
  '',
  '> Generado desde `packages/contracts/src/iam/role-matrix.ts` (B10). No lo edite a mano: si cambia',
  '> la matriz, regénerelo con `pnpm --filter @arza/contracts test -u`.',
  '',
  'Cada rol del sistema recibe los permisos del anexo G según la matriz del numeral 15.3: **L** da',
  'los permisos de leer; **C**, los de leer, crear y operar; **A**, los de aprobar; **C** y **A**',
  'juntas, además los de configurar el módulo; **P**, los mismos permisos limitados a «solo lo',
  'propio». Los permisos sensibles solo los reciben los roles que nombra el numeral 15.2. Los',
  'permisos de una persona son la suma de sus roles vigentes.',
  '',
];

function describeGrant(grant: RoleGrant): string {
  const text = permissionDefinition(grant.code).description;
  return grant.own ? `${text} (solo lo propio)` : text;
}

function moduleLines(grants: readonly RoleGrant[]): string[] {
  return PERMISSION_GROUPS.flatMap((group) => {
    const codes: readonly string[] = group.entries.map((entry) => entry[0]);
    const inGroup = grants.filter((grant) => codes.includes(grant.code));
    if (inGroup.length === 0) return [];
    return [`- **${group.label} (${group.module}):** ${inGroup.map(describeGrant).join(' · ')}`];
  });
}

function roleSection(role: SystemRoleDefinition): string[] {
  const grants = systemRoleGrants(role.code);
  return [
    `## ${role.name} (\`${role.code}\`)`,
    '',
    `${role.description} ${String(grants.length)} permisos.`,
    '',
    ...moduleLines(grants),
    '',
  ];
}

function summaryTable(): string[] {
  const rows = SYSTEM_ROLES.map((role) => {
    const grants = systemRoleGrants(role.code);
    const own = grants.filter((grant) => grant.own).length;
    const audience = role.audience === 'portal' ? 'Portal' : 'Interno';
    return `| ${role.name} | \`${role.code}\` | ${audience} | ${String(grants.length)} | ${String(own)} |`;
  });
  return [
    '## Resumen',
    '',
    '| Rol | Código | Para | Permisos | Solo lo propio |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ];
}

function nominalSection(): string[] {
  const items = NOMINAL_ONLY_PERMISSIONS.map(
    (code) => `- \`${code}\`: ${permissionDefinition(code).description}`,
  );
  return [
    '## Permisos que ningún rol trae',
    '',
    'Se conceden por persona además del rol (numeral 15.4, clasificación). Llegan con su módulo.',
    '',
    ...items,
    '',
  ];
}

/** El documento completo, en Markdown. */
export function roleMatrixMarkdown(): string {
  return [...HEADER, ...summaryTable(), ...SYSTEM_ROLES.flatMap(roleSection), ...nominalSection()]
    .join('\n')
    .replace(/\n+$/, '\n');
}
