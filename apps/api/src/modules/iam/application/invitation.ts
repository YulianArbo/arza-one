import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { IAM_ERROR_CODES, type AcceptInvitationRequest } from '@arza/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { consumeLink, loadUser } from '../infrastructure/accounts-store.js';
import { findLink, type LinkRef } from '../infrastructure/identity-lookup.js';
import { hashSecretToken } from '../infrastructure/secret-token.js';
import { AccountNotifier } from './account-notifier.js';
import { linkInvalid } from './iam-messages.js';
import { PasswordSetter } from './password-setter.js';

export interface InviteUserInput {
  readonly tenantId: string;
  readonly email: string;
  readonly kind: 'internal' | 'portal';
  readonly displayName: string | null;
}

export type InviteOutcome = 'invited' | 'resent';

interface ActivationValues {
  readonly passwordHash: string;
  readonly displayName: string;
}

/**
 * Alta de usuarios solo por invitación (numeral 15.1): enlace de un solo uso que vence en 72
 * horas. En B08 invita el responsable técnico con un comando; B10 agrega la pantalla de usuarios
 * con su permiso (iam.user.invite).
 */
@Injectable()
export class InvitationUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
    @Inject(PasswordSetter) private readonly passwords: PasswordSetter,
  ) {}

  /** Crea la cuenta invitada, o reenvía la invitación si sigue pendiente en la misma empresa. */
  async invite(input: InviteUserInput): Promise<InviteOutcome> {
    const now = this.clock.now();
    const context = { tenantId: input.tenantId, userId: null };
    const { userId, outcome } = await this.database
      .withTenant(context, (tx) => this.createOrFind(tx, input, now))
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? emailTaken() : error;
      });
    const queued = await this.notifier.request({
      tenantId: input.tenantId,
      actorId: null,
      accountUserId: userId,
      purpose: 'invitation',
      correlationId: null,
    });
    if (!queued) throw invitationNotQueued();
    return outcome;
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
      return { userId: existing.id, outcome: 'resent' };
    }
    const user = await tx.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        kind: input.kind,
        displayName: input.displayName,
        status: 'invited',
        mfaRequired: input.kind === 'internal',
      },
    });
    await recordAuditEvent(tx, {
      tenantId: input.tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.user.invite',
      entityType: 'iam_user',
      entityId: user.id,
      result: 'success',
      changes: { kind: input.kind, status: 'invited' },
      meta: null,
    });
    return { userId: user.id, outcome: 'invited' };
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

function emailTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    IAM_ERROR_CODES.emailTaken,
    'Ya existe una cuenta con ese correo.',
  );
}

function invitationNotQueued(): Error {
  return new Error(
    'La cuenta quedó invitada, pero el correo no se pudo encolar. Ejecute el comando de nuevo para reenviarlo.',
  );
}
