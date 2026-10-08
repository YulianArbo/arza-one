import { Inject, Injectable } from '@nestjs/common';
import type { MeResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';

/** Perfil propio. La seguridad por fila y el filtro por usuario dejan ver solo la cuenta propia. */
@Injectable()
export class ProfileQuery {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async execute(principal: Principal): Promise<MeResponse> {
    const user = await this.database.withTenant(principal, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: principal.userId } }),
    );
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      kind: user.kind === 'portal' ? 'portal' : 'internal',
      last_login_at: user.lastLoginAt?.toISOString() ?? null,
      password_changed_at: user.passwordChangedAt?.toISOString() ?? null,
    };
  }
}
