import { Inject, Injectable } from '@nestjs/common';

import type { Session, User } from '../../../generated/prisma/client.js';
import { recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { describeDevice } from '../domain/device.js';
import { sessionExpiresAt } from '../domain/session-policy.js';
import { sightDevice } from '../infrastructure/second-factor-store.js';
import { hashSecretToken, newSecretToken } from '../infrastructure/secret-token.js';
import { AccountNotifier } from './account-notifier.js';

export interface CompletionInput {
  readonly session: Session;
  readonly user: User;
  /** Marca del navegador que trae la petición; null si no tiene o no es válida. */
  readonly deviceToken: string | null;
  /** La sesión venía a medias (solo contraseña): su llave cambia al completarse. */
  readonly rotate: boolean;
  readonly meta: RequestMeta;
  readonly now: Date;
}

export interface Completion {
  readonly session: Session;
  /** Llave nueva para la cookie de sesión si la sesión cambió de llave. */
  readonly sessionToken: string | null;
  /** Valor de la cookie del dispositivo: el mismo que trajo o uno nuevo. */
  readonly deviceToken: string;
  readonly newDevice: boolean;
}

/**
 * Completa un inicio de sesión: después de la contraseña, o del segundo factor cuando corresponde.
 * - La sesión que venía a medias recibe una llave nueva (numeral 15.5: rotación del identificador
 *   al autenticarse), y empieza a contar su vencimiento de 12 horas.
 * - Se reconoce el equipo y, si es nuevo para la cuenta, queda el evento de seguridad y el aviso.
 */
@Injectable()
export class SignInCompletion {
  constructor(@Inject(AccountNotifier) private readonly notifier: AccountNotifier) {}

  async complete(tx: TenantTransaction, input: CompletionInput): Promise<Completion> {
    const { session, user, meta, now } = input;
    const device =
      input.deviceToken === null
        ? newSecretToken()
        : { token: input.deviceToken, hash: hashSecretToken(input.deviceToken) };
    const owner = { tenantId: user.tenantId, userId: user.id };
    const sighting = await sightDevice(tx, owner, device.hash, meta.userAgent, now);
    const rotated = input.rotate ? newSecretToken() : null;
    const completed = await tx.session.update({
      where: { id: session.id },
      data: {
        authenticatedAt: now,
        reauthenticatedAt: now,
        deviceId: sighting.device.id,
        expiresAt: sessionExpiresAt(now),
        ...(rotated === null ? {} : { tokenHash: rotated.hash }),
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    if (sighting.isNew) {
      await recordSecurityEvent(tx, {
        tenantId: user.tenantId,
        occurredAt: now,
        type: 'iam.login.new_device',
        userId: user.id,
        severity: 'low',
        detail: { device_id: sighting.device.id, ...describeDevice(meta.userAgent) },
        meta,
      });
    }
    return {
      session: completed,
      sessionToken: rotated?.token ?? null,
      deviceToken: device.token,
      newDevice: sighting.isNew,
    };
  }

  /** Avisa por correo del equipo nuevo, después de confirmar la transacción. */
  async notify(completion: Completion, meta: RequestMeta, now: Date): Promise<void> {
    if (!completion.newDevice) return;
    await this.notifier.request({
      tenantId: completion.session.tenantId,
      actorId: completion.session.userId,
      accountUserId: completion.session.userId,
      purpose: 'new_device',
      correlationId: meta.correlationId,
      occurredAt: now,
    });
  }
}
