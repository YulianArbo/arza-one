import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from './permissions.js';
import {
  INTERNAL_ROLE_CODES,
  NOMINAL_ONLY_PERMISSIONS,
  systemRoleGrants,
  type SystemRoleCode,
} from './role-matrix.js';
import { roleMatrixMarkdown } from './role-matrix-doc.js';
import { SYSTEM_ROLES } from './roles.js';

function codesOf(role: SystemRoleCode, own?: boolean): readonly string[] {
  return systemRoleGrants(role)
    .filter((grant) => own === undefined || grant.own === own)
    .map((grant) => grant.code);
}

const ALL_ROLES = SYSTEM_ROLES.map((role) => role.code);

describe('roles del sistema (numeral 15.2)', () => {
  it('son los 16 del manual, 14 internos y 2 del portal', () => {
    expect(ALL_ROLES).toHaveLength(16);
    expect(INTERNAL_ROLE_CODES).toHaveLength(14);
    const portal = SYSTEM_ROLES.filter((role) => role.audience === 'portal');
    expect(portal.map((role) => role.code)).toEqual(['CLIENTE_ADMIN', 'CLIENTE_USUARIO']);
  });

  it('todo permiso del catálogo lo tiene algún rol, salvo los nominales', () => {
    const granted = new Set(ALL_ROLES.flatMap((role) => codesOf(role)));
    const missing = PERMISSIONS.map((permission) => permission.code).filter(
      (code) => !granted.has(code),
    );
    expect(missing).toEqual(NOMINAL_ONLY_PERMISSIONS);
  });

  it('ningún rol recibe un permiso dos veces', () => {
    for (const role of ALL_ROLES) {
      const codes = codesOf(role);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('los internos no reciben permisos del portal ni los del portal permisos internos', () => {
    for (const role of SYSTEM_ROLES) {
      const portal = codesOf(role.code).filter((code) => code.startsWith('portal.'));
      expect(portal.length > 0).toBe(role.audience === 'portal');
      expect(portal.length === codesOf(role.code).length).toBe(role.audience === 'portal');
    }
  });
});

describe('matriz por módulo (numeral 15.3)', () => {
  it('ADMIN_PLATAFORMA administra identidad pero no ve contenido sensible', () => {
    const codes = codesOf('ADMIN_PLATAFORMA');
    expect(codes).toEqual(expect.arrayContaining(['iam.role.assign', 'iam.user.reset_mfa']));
    for (const sensitive of ['hr.salary.read', 'sst.medical.read', 'finance.invoice.read']) {
      expect(codes).not.toContain(sensitive);
    }
  });

  it('COLABORADOR solo delega sus propias aprobaciones en identidad', () => {
    const identity = systemRoleGrants('COLABORADOR').filter((grant) =>
      grant.code.startsWith('iam.'),
    );
    expect(identity).toEqual([{ code: 'iam.delegation.manage', own: true }]);
  });

  it('DIRECCION lee y aprueba, pero no edita la identidad (L en M01)', () => {
    const codes = codesOf('DIRECCION');
    expect(codes).toEqual(
      expect.arrayContaining(['iam.user.read', 'iam.access_review.read', 'contract.approve']),
    );
    expect(codes).not.toContain('iam.role.assign');
  });

  it('solo DIRECCION aprueba cotizaciones; COMERCIAL las elabora y las envía (ficha 17.6)', () => {
    const approvers = ALL_ROLES.filter((role) => codesOf(role).includes('crm.quote.approve'));
    expect(approvers).toEqual(['DIRECCION']);
    expect(codesOf('COMERCIAL')).toEqual(
      expect.arrayContaining(['crm.quote.create', 'crm.quote.update', 'crm.quote.send']),
    );
  });
});

describe('permisos limitados y sensibles', () => {
  it('cada rol que actúa en flujos atiende solo sus tareas; el auditor no las atiende', () => {
    for (const role of INTERNAL_ROLE_CODES) {
      const own = codesOf(role, true).includes('wf.task.work');
      expect(codesOf(role, false)).not.toContain('wf.task.work');
      expect(own).toBe(role !== 'AUDITOR');
    }
  });

  it('AUDITOR solo lee: ningún permiso de crear, operar ni aprobar', () => {
    const levels = new Map<string, string>(
      PERMISSIONS.map((permission) => [permission.code, permission.level]),
    );
    const writes = codesOf('AUDITOR').filter((code) => levels.get(code) !== 'read');
    // Los dos son lecturas de evidencia con nivel sensible: exportar la auditoría y ver el registro
    // de usos del asistente (B47, decisión 6).
    expect(writes).toEqual(['audit.event.export', 'ai.request.read']);
  });

  it('EQUIPO_PROYECTO ve solo los proyectos donde es miembro', () => {
    expect(codesOf('EQUIPO_PROYECTO', true)).toContain('project.read_member');
    expect(codesOf('EQUIPO_PROYECTO')).not.toContain('project.read_all');
    expect(codesOf('LIDER_TECNICO', false)).toContain('project.read_all');
  });

  it('los datos sensibles solo los ven los roles que nombra el numeral 15.2', () => {
    const holders = (code: string) => ALL_ROLES.filter((role) => codesOf(role).includes(code));
    // Ficha 17.13: el salario exacto solo lo ven Talento humano, la Dirección y el Contador.
    expect(holders('hr.salary.read')).toEqual(['DIRECCION', 'CONTADOR', 'TALENTO_HUMANO']);
    expect(holders('sst.medical.read')).toEqual(['SST']);
    expect(holders('finance.export')).toEqual(['ADMIN_FINANCIERO', 'CONTADOR']);
  });

  it('CLIENTE_USUARIO ve solo lo que se le asigna', () => {
    expect(systemRoleGrants('CLIENTE_USUARIO')).toEqual([
      { code: 'portal.project.read', own: true },
      { code: 'portal.ticket.create', own: true },
      { code: 'portal.ticket.read', own: true },
      { code: 'portal.personal_data.manage', own: true },
    ]);
    expect(codesOf('CLIENTE_ADMIN')).toContain('portal.user.manage');
  });
});

describe('documento de permisos por rol', () => {
  it('coincide con docs/manual/datos/permisos-por-rol.md', async () => {
    // Si cambia la matriz, regénerelo con: pnpm --filter @arza/contracts test -u
    await expect(roleMatrixMarkdown()).toMatchFileSnapshot(
      '../../../../docs/manual/datos/permisos-por-rol.md',
    );
  });
});

describe('permisos de Proyectos del B27', () => {
  it('el acta de entrega la envía quien lidera; el equipo registra sus horas (B27)', () => {
    expect(codesOf('EQUIPO_PROYECTO')).not.toContain('project.deliverable.submit');
    expect(codesOf('EQUIPO_PROYECTO', true)).toContain('project.time.log');
    expect(codesOf('EQUIPO_PROYECTO')).not.toContain('project.time.approve');
    expect(codesOf('LIDER_TECNICO', false)).toEqual(
      expect.arrayContaining([
        'project.deliverable.submit',
        'project.time.approve',
        'project.close',
      ]),
    );
  });
});

describe('permisos de Servicio del B29', () => {
  it('todo rol interno lee la base de conocimiento; solo Servicio la administra (decisión 10)', () => {
    for (const role of INTERNAL_ROLE_CODES) {
      expect(codesOf(role, false)).toContain('service.kb.read');
    }
    expect(codesOf('CLIENTE_ADMIN')).not.toContain('service.kb.read');
    expect(codesOf('SERVICIO')).toEqual(
      expect.arrayContaining([
        'service.kb.manage',
        'service.survey.manage',
        'service.pqrsf.approve',
      ]),
    );
    expect(codesOf('LIDER_TECNICO')).not.toContain('service.kb.manage');
    expect(codesOf('COLABORADOR')).not.toContain('service.pqrsf.read');
    expect(codesOf('OFICIAL_DATOS', false)).toContain('service.pqrsf.read');
    expect(codesOf('OFICIAL_DATOS')).not.toContain('service.pqrsf.respond');
  });
});
