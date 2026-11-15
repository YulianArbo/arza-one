import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  PORTAL_ERROR_CODES,
  portalDataExportSchema,
  type InvitePortalUserRequest,
  type PortalDataExport,
  type PortalMyData,
  type PortalUserList,
  type UpdatePortalMyDataRequest,
  type UpdatePortalUserRequest,
} from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { commercialParties } from '../../party/index.js';
import {
  acceptedTermsOf,
  changePortalRole,
  companyAccounts,
  emailOutsideCompany,
  InvitationUseCase,
  portalRoleOfUser,
  recentSessionsOf,
  renamePortalAccount,
  setPortalAccountActive,
} from '../../iam/index.js';
import { clientAccessByUser, companyProjects, setClientAccess } from '../../project/index.js';
import { clientPqrsf, clientTickets } from '../../service/index.js';
import { PortalAccess, portalNotFound, type PortalContext } from './portal-access.js';
import { actorOf, serviceScope } from './portal-scopes.js';

// Las personas en el portal (B30, ficha 17.10): el administrador del cliente gestiona los usuarios
// de su empresa (invitar, cambiar entre administrador y usuario, desactivar y asignar proyectos),
// pero nunca toca otra empresa ni su propia cuenta. Cada persona consulta y corrige sus datos y
// descarga una copia de lo que la plataforma guarda de ella (Ley 1581, art. 8).

interface Request {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

function userInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PORTAL_ERROR_CODES.userInvalid, detail);
}

/** Nadie cambia su propia cuenta desde la lista de usuarios: evita quedarse sin administrador. */
function assertOther(context: PortalContext, userId: string): void {
  if (context.userId === userId) {
    throw userInvalid('No puede cambiar su propia cuenta. Pida a otro administrador que lo haga.');
  }
}

async function assertCompanyUser(tx: TenantTransaction, context: PortalContext, userId: string) {
  const accounts = await companyAccounts(tx, context.partyId, context.at);
  const account = accounts.find((row) => row.id === userId);
  if (account === undefined) throw portalNotFound('El usuario');
  return account;
}

function adminActor(context: PortalContext, meta: RequestMeta) {
  return { tenantId: context.tenantId, userId: context.userId, meta, at: context.at };
}

@Injectable()
export class PortalPeople {
  constructor(
    @Inject(PortalAccess) private readonly access: PortalAccess,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InvitationUseCase) private readonly invitations: InvitationUseCase,
  ) {}

  async users(request: Omit<Request, 'meta'>): Promise<PortalUserList> {
    return this.access.run(request, async (tx, context) => {
      const accounts = await companyAccounts(tx, context.partyId, context.at);
      const access = await clientAccessByUser(
        tx,
        accounts.map((account) => account.id),
      );
      return {
        projects: await companyProjects(tx, context.partyId),
        data: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
          status: account.status,
          last_login_at: account.lastLoginAt?.toISOString() ?? null,
          project_ids: access.get(account.id) ?? [],
          is_me: account.id === context.userId,
          version: account.version,
        })),
      };
    });
  }

  /** Invita a una persona de su empresa con la invitación de siempre (72 horas, un solo uso). */
  async invite(request: Request, input: InvitePortalUserRequest): Promise<string> {
    const context = await this.access.run(request, async (tx, scope) => {
      if (await emailOutsideCompany(tx, input.email, scope.partyId)) {
        throw userInvalid('Ese correo ya tiene una cuenta. Use otro o escríbanos por Soporte.');
      }
      return scope;
    });
    const roleId = await this.database.withTenant(request.principal, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { code: input.role, deletedAt: null } });
      return role.id;
    });
    const { userId } = await this.invitations.invite({
      tenantId: context.tenantId,
      email: input.email,
      kind: 'portal',
      displayName: input.display_name,
      requireSecondFactor: input.role === 'CLIENTE_ADMIN',
      actorId: context.userId,
      roleIds: [roleId],
      partyId: context.partyId,
      meta: request.meta,
    });
    return userId;
  }

  /** Cambia el rol o activa y desactiva a una persona de su empresa. */
  async update(
    request: Request,
    target: { readonly userId: string; readonly version: number },
    input: UpdatePortalUserRequest,
  ): Promise<void> {
    await this.access.run(request, async (tx, context) => {
      assertOther(context, target.userId);
      const account = await assertCompanyUser(tx, context, target.userId);
      if (account.version !== target.version) throw versionConflict();
      const actor = adminActor(context, request.meta);
      const change = { userId: target.userId, partyId: context.partyId };
      if (!input.active) {
        await setPortalAccountActive(tx, actor, { ...change, active: false });
        return;
      }
      await setPortalAccountActive(tx, actor, { ...change, active: true });
      await changePortalRole(tx, actor, { ...change, role: input.role });
    });
  }

  /** Los proyectos que ve un usuario del cliente (el administrador los ve todos). */
  async assignProjects(request: Request, userId: string, projectIds: string[]): Promise<void> {
    await this.access.run(request, async (tx, context) => {
      assertOther(context, userId);
      await assertCompanyUser(tx, context, userId);
      const actor = { ...actorOf(context), meta: request.meta };
      await setClientAccess(tx, actor, { userId, partyId: context.partyId, projectIds });
    });
  }

  async myData(request: Omit<Request, 'meta'>): Promise<PortalMyData> {
    return this.access.run({ ...request, skipTerms: true }, (tx, context) =>
      this.dataOf(tx, context),
    );
  }

  async updateMyData(
    request: Request,
    version: number,
    input: UpdatePortalMyDataRequest,
  ): Promise<void> {
    await this.access.run({ ...request, skipTerms: true }, async (tx, context) => {
      const actor = adminActor(context, request.meta);
      const change = { displayName: input.display_name, version };
      if (!(await renamePortalAccount(tx, actor, change))) throw versionConflict();
    });
  }

  /** Copia de lo que la plataforma guarda de la persona; la descarga queda registrada. */
  async export(request: Request): Promise<PortalDataExport> {
    return this.access.run({ ...request, skipTerms: true }, async (tx, context) => {
      const account = portalDataExportSchema.shape.account.parse(await this.dataOf(tx, context));
      const [terms, sessions, tickets, pqrsf] = await Promise.all([
        acceptedTermsOf(tx, context.userId),
        recentSessionsOf(tx, context.userId),
        clientTickets(tx, { ...serviceScope(context), allTickets: false }),
        clientPqrsf(tx, serviceScope(context)),
      ]);
      await this.auditExport(tx, context, request.meta);
      return {
        generated_at: context.at.toISOString(),
        account,
        terms: terms.map((row) => ({
          title:
            row.noticeKey === 'portal_terms'
              ? 'Términos de uso del portal'
              : 'Política de privacidad',
          version_number: row.versionNumber,
          accepted_at: row.acceptedAt.toISOString(),
        })),
        sessions: sessions.map((row) => ({
          started_at: row.startedAt.toISOString(),
          ip: row.ip,
          device: row.device,
        })),
        tickets: tickets.map((row) => ({
          code: row.code,
          subject: row.subject,
          created_at: row.created_at,
        })),
        pqrsf: pqrsf.map((row) => ({
          code: row.code,
          subject: row.subject,
          received_at: row.received_at,
        })),
      };
    });
  }

  private async dataOf(tx: TenantTransaction, context: PortalContext): Promise<PortalMyData> {
    const [company, role, terms] = await Promise.all([
      commercialParties(tx, [context.partyId]),
      portalRoleOfUser(tx, context.userId, context.at),
      acceptedTermsOf(tx, context.userId),
    ]);
    const { account } = context;
    return {
      display_name: account.displayName,
      email: account.email,
      company: company.get(context.partyId)?.name ?? null,
      role,
      second_factor: account.mfaRequired,
      created_at: account.createdAt.toISOString(),
      last_login_at: account.lastLoginAt?.toISOString() ?? null,
      terms_accepted_at: terms[0]?.acceptedAt.toISOString() ?? null,
      version: account.version,
    };
  }

  private async auditExport(tx: TenantTransaction, context: PortalContext, meta: RequestMeta) {
    await recordAuditEvent(tx, {
      tenantId: context.tenantId,
      occurredAt: context.at,
      actor: { kind: 'user', id: context.userId },
      action: 'iam.portal_user.export',
      entityType: 'iam_user',
      entityId: context.userId,
      result: 'success',
      changes: {},
      meta,
    });
  }
}
