import { Inject, Injectable } from '@nestjs/common';

import type { HireCandidate } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { employmentCompanySigners } from '../../contract/index.js';
import { InvitationUseCase } from '../../iam/index.js';
import { prepareHiring } from './hiring-preparation.js';
import {
  activatePendingEmployee,
  cancelPendingHiring,
  signPendingContract,
} from './hiring-steps.js';

@Injectable()
export class Hiring {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(InvitationUseCase) private readonly invitations: InvitationUseCase,
  ) {}

  async companySigners(
    principal: Principal,
  ): Promise<{ id: string; name: string; ready: boolean }[]> {
    return this.database.withTenant(principal, (tx) =>
      employmentCompanySigners(tx, this.clock.now()),
    );
  }

  async cancel(
    principal: Principal,
    meta: RequestMeta,
    target: { readonly id: string; readonly version: number },
    reason: string,
  ): Promise<void> {
    const actor = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      at: this.clock.now(),
      meta,
    };
    await this.database.withTenant(principal, (tx) =>
      cancelPendingHiring(tx, actor, target, reason),
    );
  }

  async activate(
    principal: Principal,
    meta: RequestMeta,
    employeeId: string,
    version: number,
  ): Promise<void> {
    const actor = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      at: this.clock.now(),
      meta,
    };
    const accountId = await this.database.withTenant(principal, (tx) =>
      activatePendingEmployee(tx, principal, this.invitations, actor, employeeId, version),
    );
    await this.invitations.notifyEmployeeInvitation(principal, meta, accountId);
  }

  async sign(
    principal: Principal,
    meta: RequestMeta,
    employeeId: string,
    accepted: boolean,
  ): Promise<void> {
    const actor = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      at: this.clock.now(),
      meta,
    };
    await this.database.withTenant(principal, (tx) =>
      signPendingContract(tx, principal, actor, employeeId, accepted),
    );
  }

  async prepare(
    principal: Principal,
    meta: RequestMeta,
    target: { readonly id: string; readonly version: number; readonly key: string },
    input: HireCandidate,
  ): Promise<string> {
    const actor = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      at: this.clock.now(),
      meta,
    };
    return this.database.withTenant(principal, (tx) =>
      prepareHiring(tx, principal, actor, target, input),
    );
  }
}
