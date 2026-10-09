import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { LoginRequest } from '@arza/contracts';

import type { Session, User } from '../../../generated/prisma/client.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import {
  FAILURE_WINDOW_MS,
  FAILURES_TO_LOCK,
  LOCK_DURATION_MS,
  loginGate,
} from '../domain/login-throttle.js';
import {
  needsSecondFactor,
  pendingSignInExpiresAt,
  signInStage,
  type SignInStage,
} from '../domain/second-factor-policy.js';
import { sessionExpiresAt } from '../domain/session-policy.js';
import { canSignIn } from '../domain/user.js';
import { loadUser } from '../infrastructure/accounts-store.js';
import {
  findLoginUser,
  recentLoginFailures,
  recordLoginAttempt,
  type IdentityRef,
} from '../infrastructure/identity-lookup.js';
import { hashPassword, verifyPassword } from '../infrastructure/password-hasher.js';
import { hasConfirmedFactor } from '../infrastructure/second-factor-store.js';
import { newSecretToken } from '../infrastructure/secret-token.js';
import { accountLocked, invalidCredentials, loginDelayed } from './iam-messages.js';
import { SessionService, type SessionView } from './session-service.js';
import { SignInCompletion, type Completion } from './sign-in-completion.js';

export interface StartedSession {
  /** Llave para la cookie. Nunca se guarda ni se registra. */
  readonly token: string;
  /** Marca del equipo para su cookie; null mientras falte el segundo factor. */
  readonly deviceToken: string | null;
  readonly view: SessionView;
}

interface CreatedSession {
  readonly session: Session;
  readonly stage: SignInStage;
  readonly completion: Completion | null;
}

interface Account {
  readonly ref: IdentityRef;
  readonly user: User;
}

/**
 * Inicio de sesión (numeral 15.1). El mensaje y el comportamiento son iguales exista o no el
 * correo: la espera progresiva y el bloqueo se aplican al correo, y cuando no hay cuenta se
 * calcula igual un hash para que el tiempo de respuesta no lo delate. Si la persona tiene o debe
 * tener segundo factor (B09), la contraseña correcta solo abre una sesión a medias de 10 minutos
 * que sirve para escribir el código o configurarlo.
 */
@Injectable()
export class LoginUseCase {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SignInCompletion) private readonly completion: SignInCompletion,
  ) {}

  async execute(
    input: LoginRequest,
    meta: RequestMeta,
    deviceToken: string | null,
  ): Promise<StartedSession> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - FAILURE_WINDOW_MS);
    const failures = await recentLoginFailures(this.database, input.email, since);
    const account = await this.findAccount(input.email);
    const gate = loginGate(failures, account?.user.lockedUntil ?? null, now);
    if (gate.kind !== 'open') {
      await this.recordAttempt(input.email, meta, now, gate.kind);
      throw gate.kind === 'locked'
        ? accountLocked(gate.retryAfterSeconds)
        : loginDelayed(gate.retryAfterSeconds);
    }
    if (account === null || !(await this.passwordMatches(account.user, input.password))) {
      return this.fail(input.email, account, failures.count + 1, meta, now);
    }
    const started = await this.start(account, meta, now, deviceToken);
    await recordLoginAttempt(this.database, {
      email: input.email,
      ip: meta.ip,
      succeeded: true,
      reason: 'ok',
      occurredAt: now,
    });
    return started;
  }

  private async findAccount(email: string): Promise<Account | null> {
    const ref = await findLoginUser(this.database, email);
    if (ref === null) return null;
    const user = await this.database.withTenant({ tenantId: ref.tenantId, userId: null }, (tx) =>
      loadUser(tx, ref.userId),
    );
    return user === null ? null : { ref, user };
  }

  /** Solo una cuenta activa con contraseña puede coincidir; las demás gastan el mismo tiempo. */
  private async passwordMatches(user: User, password: string): Promise<boolean> {
    if (!canSignIn(user) || user.passwordHash === null) {
      await this.spendHashTime(password);
      return false;
    }
    return verifyPassword(password, user.passwordHash);
  }

  private async spendHashTime(password: string): Promise<void> {
    this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    await verifyPassword(password, await this.dummyHash);
  }

  private async recordAttempt(
    email: string,
    meta: RequestMeta,
    now: Date,
    reason: 'bad_credentials' | 'delayed' | 'locked',
  ): Promise<void> {
    await recordLoginAttempt(this.database, {
      email,
      ip: meta.ip,
      succeeded: false,
      reason,
      occurredAt: now,
    });
  }

  private async fail(
    email: string,
    account: Account | null,
    failureCount: number,
    meta: RequestMeta,
    now: Date,
  ): Promise<never> {
    await this.recordAttempt(email, meta, now, 'bad_credentials');
    const locks = failureCount >= FAILURES_TO_LOCK;
    if (account !== null) {
      await this.database.withTenant({ tenantId: account.ref.tenantId, userId: null }, (tx) =>
        this.recordFailure(tx, account, locks, meta, now),
      );
    }
    throw locks ? accountLocked(LOCK_DURATION_MS / 1000) : invalidCredentials();
  }

  /** Deja constancia del intento fallido y, al quinto, bloquea la cuenta. */
  private async recordFailure(
    tx: TenantTransaction,
    account: Account,
    locks: boolean,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const { userId, tenantId } = account.ref;
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'anonymous' },
      action: 'iam.session.create',
      entityType: 'iam_user',
      entityId: userId,
      result: 'failure',
      meta,
    });
    if (locks) await this.lock(tx, account.ref, meta, now);
  }

  /** Bloqueo de 15 minutos con evento de seguridad y alerta (ficha 17.2). */
  private async lock(
    tx: TenantTransaction,
    ref: IdentityRef,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const { userId, tenantId } = ref;
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
    await tx.user.update({ where: { id: userId }, data: { lockedUntil } });
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: now,
      type: 'iam.account.locked',
      userId,
      severity: 'medium',
      detail: { reason: 'failed_logins', failures: FAILURES_TO_LOCK, locked_until: lockedUntil },
      meta,
    });
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.user.lock',
      entityType: 'iam_user',
      entityId: userId,
      result: 'success',
      changes: { locked_until: lockedUntil },
      meta,
    });
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId: null,
      occurredAt: now,
      payload: { type: 'iam.account.locked', user_id: userId },
    });
  }

  /** Crea una sesión nueva: cada inicio de sesión recibe una llave distinta (numeral 15.5). */
  private async start(
    account: Account,
    meta: RequestMeta,
    now: Date,
    deviceToken: string | null,
  ): Promise<StartedSession> {
    const { userId, tenantId } = account.ref;
    const secret = newSecretToken();
    const created = await this.database.withTenant({ tenantId, userId }, (tx) =>
      this.createSession(tx, { account, tokenHash: secret.hash, meta, now, deviceToken }),
    );
    if (created.completion !== null) await this.completion.notify(created.completion, meta, now);
    return {
      token: secret.token,
      deviceToken: created.completion?.deviceToken ?? null,
      view: this.sessions.viewOf(created.session, account.user, created.stage),
    };
  }

  private async createSession(
    tx: TenantTransaction,
    input: {
      readonly account: Account;
      readonly tokenHash: string;
      readonly meta: RequestMeta;
      readonly now: Date;
      readonly deviceToken: string | null;
    },
  ): Promise<CreatedSession> {
    const { account, meta, now } = input;
    const { userId, tenantId } = account.ref;
    const hasFactor = await hasConfirmedFactor(tx, userId);
    const pending = needsSecondFactor(account.user, hasFactor);
    const session = await tx.session.create({
      data: {
        tenantId,
        userId,
        tokenHash: input.tokenHash,
        ip: meta.ip,
        userAgent: meta.userAgent,
        lastSeenAt: now,
        expiresAt: pending ? pendingSignInExpiresAt(now) : sessionExpiresAt(now),
      },
    });
    await tx.user.update({ where: { id: userId }, data: { lockedUntil: null } });
    const stage = pending ? signInStage(null, hasFactor) : 'complete';
    await this.recordCreated(tx, session, stage, meta, now);
    if (pending) return { session, stage, completion: null };
    const completion = await this.completion.complete(tx, {
      session,
      user: account.user,
      deviceToken: input.deviceToken,
      rotate: false,
      meta,
      now,
    });
    return { session: completion.session, stage, completion };
  }

  private async recordCreated(
    tx: TenantTransaction,
    session: Session,
    stage: SignInStage,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    await recordAuditEvent(tx, {
      tenantId: session.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: session.userId },
      action: 'iam.session.create',
      entityType: 'iam_session',
      entityId: session.id,
      result: 'success',
      changes: { stage },
      meta,
    });
  }
}
