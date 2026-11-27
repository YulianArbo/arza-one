import { describe, expect, it } from 'vitest';

import {
  APPROVAL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  isApprovalPermission,
  isPermissionCode,
  permissionDefinition,
  splitPermission,
} from './permissions.js';

describe('catálogo de permisos (anexo G)', () => {
  it('tiene las 22 filas del anexo G sin códigos repetidos', () => {
    expect(PERMISSION_GROUPS).toHaveLength(22);
    const codes = PERMISSIONS.map((permission) => permission.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('nombra cada permiso módulo.recurso.acción en minúsculas', () => {
    for (const { code } of PERMISSIONS) {
      expect(code).toMatch(/^[a-z]+(\.[a-z_]+){1,2}$/);
    }
  });

  it('conserva permisos del anexo G que usan las pantallas', () => {
    for (const code of ['iam.user.read', 'iam.role.assign', 'core.parameter.read', 'party.read']) {
      expect(isPermissionCode(code)).toBe(true);
    }
    expect(isPermissionCode('iam.user.delete')).toBe(false);
  });

  it('solo los permisos de leer o de operar se pueden limitar a lo propio', () => {
    const ownable = PERMISSIONS.filter((permission) => permission.ownField !== null);
    expect(ownable.length).toBeGreaterThan(20);
    for (const permission of ownable) {
      expect(['read', 'write']).toContain(permission.level);
    }
    expect(permissionDefinition('iam.delegation.manage').ownField).toBe('from_user_id');
  });
});

describe('nombres y aprobaciones', () => {
  it('separa el recurso de la acción por el último punto', () => {
    expect(splitPermission('iam.user.reset_mfa')).toEqual({
      subject: 'iam.user',
      action: 'reset_mfa',
    });
    expect(splitPermission('party.read')).toEqual({ subject: 'party', action: 'read' });
  });

  it('solo se delegan aprobaciones', () => {
    expect(APPROVAL_PERMISSIONS).toContain('finance.invoice.approve');
    expect(isApprovalPermission('crm.quote.approve')).toBe(true);
    expect(isApprovalPermission('iam.role.assign')).toBe(false);
  });

  it('rechaza un permiso desconocido', () => {
    expect(() => permissionDefinition('x.y.z')).toThrow('Permiso desconocido');
  });
});
