import { describe, expect, it } from 'vitest';

import { createRoleRequestSchema, updateRoleRequestSchema } from './access.js';
import {
  createDelegationRequestSchema,
  inviteUserRequestSchema,
  userListQuerySchema,
} from './access-admin.js';

describe('contratos de roles', () => {
  const role = {
    name: 'Apoyo comercial',
    audience: 'internal',
    permissions: [{ code: 'crm.lead.read', scope: 'all' }],
  };

  it('acepta un rol con permisos del catálogo', () => {
    expect(createRoleRequestSchema.parse(role).description).toBeNull();
  });

  it('rechaza permisos desconocidos o repetidos', () => {
    const unknown = { ...role, permissions: [{ code: 'crm.lead.delete', scope: 'all' }] };
    expect(createRoleRequestSchema.safeParse(unknown).success).toBe(false);
    const repeated = { ...role, permissions: [...role.permissions, ...role.permissions] };
    expect(createRoleRequestSchema.safeParse(repeated).success).toBe(false);
  });

  it('un cambio debe traer algo que cambiar', () => {
    expect(updateRoleRequestSchema.safeParse({}).success).toBe(false);
    expect(updateRoleRequestSchema.safeParse({ name: 'Otro nombre' }).success).toBe(true);
  });
});

describe('contratos de la administración de usuarios', () => {
  it('normaliza el correo de la invitación y no exige roles', () => {
    const parsed = inviteUserRequestSchema.parse({ email: ' Ana@Demo.TEST ', kind: 'internal' });
    expect(parsed).toEqual({
      email: 'ana@demo.test',
      kind: 'internal',
      display_name: null,
      role_ids: [],
    });
  });

  it('limita la página a 100 registros', () => {
    expect(userListQuerySchema.parse({}).limit).toBe(25);
    expect(userListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('una delegación exige motivo y al menos un permiso', () => {
    const base = {
      to_user_id: '01999a00-0000-7000-8000-000000000001',
      starts_at: '2026-10-10T00:00:00Z',
      ends_at: '2026-10-20T00:00:00Z',
      reason: 'Vacaciones',
    };
    expect(createDelegationRequestSchema.safeParse({ ...base, permissions: [] }).success).toBe(
      false,
    );
    const valid = { ...base, permissions: ['finance.invoice.approve'] };
    expect(createDelegationRequestSchema.safeParse(valid).success).toBe(true);
  });
});
