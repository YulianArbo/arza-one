import { Inject, Injectable, Optional } from '@nestjs/common';
import { type AcceptInvitationRequest } from '@arza/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { consumeLink, loadUser } from '../infrastructure/accounts-store.js';
import { findLink, type LinkRef } from '../infrastructure/identity-lookup.js';
import { hashSecretToken } from '../infrastructure/secret-token.js';
import { userNotFound, userStateInvalid } from './access-messages.js';
import { AccountNotifier } from './account-notifier.js';
import { linkInvalid } from './iam-messages.js';
import { clientCompanyInvalid, emailTaken, invitationNotQueued } from './invitation-messages.js';
import {
  grantInitialRoles,
  linkEmployeeAccount,
  recordResent,
  type EmployeeInvitationInput,
} from './invitation-records.js';
import { PasswordSetter } from './password-setter.js';
import { CLIENT_COMPANIES, type ClientCompanies } from './profile-ports.js';

export interface InviteUserInput {
  readonly tenantId: string;
  readonly email: string;
  readonly kind: 'internal' | 'portal';
  readonly displayName: string | null;
  /**
   * Exige segundo factor a una cuenta del portal (administradores de cliente, numeral 15.1). Las
   * internas siempre lo exigen. Desde B10, asignar el rol CLIENTE_ADMIN también lo exige.
   */
  readonly requireSecondFactor?: boolean;
  /** Quien invita; null si es el comando del responsable técnico. */
  readonly actorId?: string | null;
  /** Roles además de COLABORADOR, que reciben siempre las personas internas (B10). */
  readonly roleIds?: readonly string[];
  /** Empresa cliente de la persona del portal (B22A): un tercero organización con papel de cliente. */
  readonly partyId?: string | null;
  readonly meta?: RequestMeta | null;
}

export interface InviteResult {
  readonly userId: string;
  readonly outcome: InviteOutcome;
}

export type InviteOutcome = 'invited' | 'resent';

interface ActivationValues {
  readonly passwordHash: string;
  readonly displayName: string;
}

/**
 * Alta de usuarios solo por invitación (numeral 15.1): enlace de un solo uso que vence en 72
 * horas. Invita el responsable técnico con un comando (B08) o un administrador desde la pantalla
 * de usuarios con el permiso iam.user.invite (B10).
 */
@Injectable()
export class InvitationUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
    @Inject(PasswordSetter) private readonly passwords: PasswordSetter,
    // El comando del responsable técnico no liga empresas; la pantalla de usuarios sí (B22A).
    @Optional() @Inject(CLIENT_COMPANIES) private readonly companies?: ClientCompanies,
  ) {}

  /** Crea la cuenta invitada, o reenvía la invitación si sigue pendiente en la misma empresa. */
  async invite(input: InviteUserInput): Promise<InviteResult> {
    const now = this.clock.now();
    const context = { tenantId: input.tenantId, userId: input.actorId ?? null };
    const { userId, outcome } = await this.database
      .withTenant(context, (tx) => this.createOrFind(tx, input, now))
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? emailTaken() : error;
      });
    const queued = await this.notifier.request({
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      accountUserId: userId,
      purpose: 'invitation',
      correlationId: input.meta?.correlationId ?? null,
    });
    if (!queued) throw invitationNotQueued();
    return { userId, outcome };
  }

  /** Crea una cuenta interna en la misma transacción que vincula al colaborador. */
  async createEmployeeInvitation(
    tx: TenantTransaction,
    principal: Principal,
    meta: RequestMeta,
    input: EmployeeInvitationInput,
  ): Promise<string> {
    const now = this.clock.now();
    const id = await this.createInvited(
      tx,
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        kind: 'internal',
        email: input.email,
        displayName: input.displayName,
        meta,
      },
      now,
    ).catch((error: unknown) => {
      throw isUniqueViolation(error) ? emailTaken() : error;
    });
    await linkEmployeeAccount(tx, { principal, meta, id, input, now });
    return id;
  }

  async notifyEmployeeInvitation(
    principal: Principal,
    meta: RequestMeta,
    userId: string,
  ): Promise<void> {
    if (
      !(await this.notifier.request({
        tenantId: principal.tenantId,
        actorId: principal.userId,
        accountUserId: userId,
        purpose: 'invitation',
        correlationId: meta.correlationId,
      }))
    ) {
      throw invitationNotQueued();
    }
  }

  /** Reenvía la invitación de una cuenta que sigue invitada (pantalla de usuarios). */
  async resend(principal: Principal, userId: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    // Se encola dentro de la transacción: si el correo no se encola, tampoco queda el evento.
    await this.database.withTenant(principal, async (tx) => {
      const user = await loadUser(tx, userId);
      if (user === null || user.kind === 'service') throw userNotFound();
      if (user.status !== 'invited') throw userStateInvalid('La cuenta ya se activó.');
      const actor = { tenantId: principal.tenantId, actorId: principal.userId };
      await recordResent(tx, { ...actor, userId: user.id, meta, now });
      const queued = await this.notifier.request({
        ...actor,
        accountUserId: user.id,
        purpose: 'invitation',
        correlationId: meta.correlationId,
      });
      if (!queued) throw invitationNotQueued();
    });
  }

  /** Activa la cuenta con el enlace de la invitación y la contraseña elegida. */
  async accept(input: AcceptInvitationRequest, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    const link = await findLink(this.database, hashSecretToken(input.token), 'invitation', now);
    if (link === null) throw linkInvalid();
    const passwordHash = await this.passwords.hashNew(input.password);
    const values = { passwordHash, displayName: input.display_name };
    await this.database.withTenant({ tenantId: link.tenantId, userId: link.userId }, (tx) =>
      this.activate(tx, link, values, meta, now),
    );
  }

  private async createOrFind(
    tx: TenantTransaction,
    input: InviteUserInput,
    now: Date,
  ): Promise<{ userId: string; outcome: InviteOutcome }> {
    const existing = await tx.user.findFirst({ where: { email: input.email, deletedAt: null } });
    if (existing !== null) {
      if (existing.status !== 'invited') throw emailTaken();
      const actor = { tenantId: input.tenantId, actorId: input.actorId ?? null };
      await recordResent(tx, { ...actor, userId: existing.id, meta: input.meta ?? null, now });
      return { userId: existing.id, outcome: 'resent' };
    }
    return { userId: await this.createInvited(tx, input, now), outcome: 'invited' };
  }

  private async createInvited(
    tx: TenantTransaction,
    input: InviteUserInput,
    now: Date,
  ): Promise<string> {
    const partyId = await this.clientCompany(tx, input.partyId ?? null);
    const user = await tx.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        kind: input.kind,
        partyId,
        displayName: input.displayName,
        status: 'invited',
        mfaRequired: input.kind === 'internal' || input.requireSecondFactor === true,
      },
    });
    const actorId = input.actorId ?? null;
    await recordAuditEvent(tx, {
      tenantId: input.tenantId,
      occurredAt: now,
      actor: actorId === null ? { kind: 'system' } : { kind: 'user', id: actorId },
      action: 'iam.user.invite',
      entityType: 'iam_user',
      entityId: user.id,
      result: 'success',
      changes: {
        kind: input.kind,
        status: 'invited',
        mfa_required: user.mfaRequired,
        party_id: partyId,
      },
      meta: input.meta ?? null,
    });
    await grantInitialRoles(tx, { input, user, now });
    return user.id;
  }

  /** La empresa elegida existe en esta empresa y es una organización cliente vigente. */
  private async clientCompany(
    tx: TenantTransaction,
    partyId: string | null,
  ): Promise<string | null> {
    if (partyId === null) return null;
    const company = await this.companies?.describe(tx, partyId);
    if (company?.isClient !== true) throw clientCompanyInvalid();
    return company.id;
  }

  private async activate(
    tx: TenantTransaction,
    link: LinkRef,
    values: ActivationValues,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const user = await loadUser(tx, link.userId);
    if (user?.status !== 'invited' || !(await consumeLink(tx, link.tokenId, now))) {
      throw linkInvalid();
    }
    await tx.user.update({
      where: { id: user.id },
      data: { ...values, status: 'active', passwordChangedAt: now },
    });
    await recordAuditEvent(tx, {
      tenantId: link.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: user.id },
      action: 'iam.invitation.accept',
      entityType: 'iam_user',
      entityId: user.id,
      result: 'success',
      changes: { status: { from: 'invited', to: 'active' } },
      meta,
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
