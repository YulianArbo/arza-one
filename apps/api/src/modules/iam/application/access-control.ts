import { Inject, Injectable } from '@nestjs/common';
import {
  permissionDefinition,
  type GrantedPermission,
  type MyPermissionsResponse,
} from '@arza/contracts';

import {
  buildAbility,
  type AppAbility,
  type PermissionGrant,
} from '../../../platform/access/ability.js';
import type { Authorizer } from '../../../platform/access/authorizer.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeGrants, activeRoles, type StoredGrant } from '../infrastructure/access-store.js';

/** Un permiso guardado como «solo lo propio» que no se puede limitar no se concede. */
function toGrant(stored: StoredGrant): PermissionGrant | null {
  if (!stored.own) return { code: stored.code, ownField: null };
  const ownField = permissionDefinition(stored.code).ownField;
  return ownField === null ? null : { code: stored.code, ownField };
}

function grantsOf(stored: readonly StoredGrant[]): PermissionGrant[] {
  return stored.flatMap((item) => {
    const grant = toGrant(item);
    return grant === null ? [] : [grant];
  });
}

/** Lista para la web: un permiso que llega para todo y para lo propio vale para todo. */
function grantedList(grants: readonly PermissionGrant[]): GrantedPermission[] {
  const scopes = new Map<string, GrantedPermission>();
  for (const grant of grants) {
    const scope = grant.ownField === null ? 'all' : 'own';
    if (scopes.get(grant.code)?.scope !== 'all')
      scopes.set(grant.code, { code: grant.code, scope });
  }
  return [...scopes.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Permisos vigentes de cada persona (B10): la suma de sus roles vigentes. Se calculan en cada
 * petición, así retirar un rol surte efecto en la petición siguiente. La guarda de autorización
 * de la plataforma los pide con esta interfaz.
 */
@Injectable()
export class AccessControlService implements Authorizer {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async abilityFor(principal: Principal): Promise<AppAbility> {
    const grants = await this.database.withTenant(principal, (tx) => this.grantsIn(tx, principal));
    return buildAbility(grants, principal.userId);
  }

  async grantsIn(tx: TenantTransaction, principal: Principal): Promise<PermissionGrant[]> {
    return grantsOf(await activeGrants(tx, principal.userId, this.clock.now()));
  }

  /** GET /v1/me/permissions: lo que la web puede mostrar. La API decide igual en cada petición. */
  async mine(principal: Principal): Promise<MyPermissionsResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => ({
      roles: await activeRoles(tx, principal.userId, now),
      permissions: grantedList(grantsOf(await activeGrants(tx, principal.userId, now))),
    }));
  }
}
