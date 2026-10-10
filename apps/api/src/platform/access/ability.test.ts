import { describe, expect, it } from 'vitest';

import { buildAbility, canOnRecord, hasPermission, hasUnconditionalPermission } from './ability.js';

const ANA = '01999a00-0000-7000-8000-00000000a001';
const LUIS = '01999a00-0000-7000-8000-00000000a002';

describe('permisos por rol (RBAC)', () => {
  const ability = buildAbility([{ code: 'iam.user.read', ownField: null }], ANA);

  it('concede solo los permisos recibidos', () => {
    expect(hasPermission(ability, 'iam.user.read')).toBe(true);
    expect(hasPermission(ability, 'iam.user.lock')).toBe(false);
    expect(hasPermission(ability, 'iam.role.read')).toBe(false);
  });

  it('sin roles no concede nada', () => {
    expect(hasPermission(buildAbility([], ANA), 'iam.user.read')).toBe(false);
  });

  it('separa recursos de dos y de tres partes', () => {
    const party = buildAbility([{ code: 'party.read', ownField: null }], ANA);
    expect(hasPermission(party, 'party.read')).toBe(true);
    expect(hasPermission(party, 'party.bank_account.read')).toBe(false);
  });
});

describe('permisos por registro (ABAC)', () => {
  const own = buildAbility([{ code: 'iam.delegation.manage', ownField: 'from_user_id' }], ANA);

  it('«solo lo propio» vale sobre los registros de la persona', () => {
    expect(hasPermission(own, 'iam.delegation.manage')).toBe(true);
    expect(hasUnconditionalPermission(own, 'iam.delegation.manage')).toBe(false);
    expect(canOnRecord(own, 'iam.delegation.manage', { from_user_id: ANA })).toBe(true);
    expect(canOnRecord(own, 'iam.delegation.manage', { from_user_id: LUIS })).toBe(false);
  });

  it('las personas relacionadas con un registro se revisan en la lista', () => {
    const member = buildAbility(
      [{ code: 'project.read_member', ownField: 'involved_user_ids' }],
      ANA,
    );
    expect(canOnRecord(member, 'project.read_member', { involved_user_ids: [LUIS, ANA] })).toBe(
      true,
    );
    expect(canOnRecord(member, 'project.read_member', { involved_user_ids: [LUIS] })).toBe(false);
    expect(canOnRecord(member, 'project.read_member', {})).toBe(false);
  });

  it('si un rol lo da completo y otro solo lo propio, vale el más amplio', () => {
    const both = buildAbility(
      [
        { code: 'iam.delegation.manage', ownField: 'from_user_id' },
        { code: 'iam.delegation.manage', ownField: null },
      ],
      ANA,
    );
    expect(hasUnconditionalPermission(both, 'iam.delegation.manage')).toBe(true);
    expect(canOnRecord(both, 'iam.delegation.manage', { from_user_id: LUIS })).toBe(true);
  });
});
