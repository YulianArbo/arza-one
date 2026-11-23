import { Inject, Injectable } from '@nestjs/common';
import type {
  ErasureResult,
  ErasureSection,
  PersonalDataReport,
  PersonalDataSection,
} from '@arza/contracts';
import { personalDataReportSchema } from '@arza/contracts';

import type { PrivacyRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { companyIdentity } from '../../core/index.js';
import { FileStorage, openAvailableFile, type OpenedFile } from '../../doc/index.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import {
  PersonalDataRegistry,
  type ErasureActor,
  type PersonalDataHolder,
  type PersonalDataSource,
} from './personal-data-sources.js';
import { assertNoActivePortalAccount, PRIVACY_OWN_SOURCES } from './privacy-own-sources.js';
import { actorOf, auditPrivacy, type PrivacyActor } from './privacy-support.js';
import {
  exportNotReady,
  requestNotFound,
  requestNotVerified,
  requestStepInvalid,
} from './request-messages.js';
import { addRequestEvent, lockRequest } from './request-records.js';
import { assertRequestStep } from './request-steps.js';

// Entrega y supresión de los datos de un titular (B42, ficha 17.19; decisiones 6, 7 y 8). Solo
// desde una solicitud en trámite con la identidad verificada y para el titular de esa solicitud.
// La entrega reúne lo de todos los módulos y el worker arma el PDF; la supresión vuelve anónimo lo
// que se puede y bloquea, con su motivo legal, lo que se debe conservar.

const PARTY_SECTION = { key: '0-party', title: 'Ficha en Terceros' } as const;

function holderEmails(row: PrivacyRequest, partyEmail: string | null): string[] {
  const emails = [row.requesterEmail, partyEmail].flatMap((email) =>
    email === null ? [] : [email.trim().toLowerCase()],
  );
  return [...new Set(emails)];
}

function assertTarget(row: PrivacyRequest, partyId: string): void {
  if (row.verifiedAt === null || row.partyId === null) throw requestNotVerified();
  if (row.partyId !== partyId) {
    throw requestStepInvalid('La solicitud es de otro titular. Revise la persona elegida.');
  }
}

@Injectable()
export class PersonalDataUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
    @Inject(PersonalDataRegistry) private readonly registry: PersonalDataRegistry,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  private sources(): PersonalDataSource[] {
    return [...PRIVACY_OWN_SOURCES, ...this.registry.list()];
  }

  /** Reúne los datos y deja la entrega en preparación; devuelve su identificador. */
  async export(
    principal: Principal,
    partyId: string,
    requestId: string,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const row = await lockRequest(tx, requestId);
      assertRequestStep(row, 'export');
      assertTarget(row, partyId);
      const report = await this.report(tx, row, partyId, actor.at);
      const created = await tx.privacyDataExport.create({
        data: {
          tenantId: actor.tenantId,
          requestId: row.id,
          partyId,
          content: report,
          requestedAt: actor.at,
          requestedBy: actor.userId,
        },
      });
      await addRequestEvent(tx, actor, row, { kind: 'exported', note: null, mail: false });
      await auditPrivacy(tx, actor, {
        action: 'privacy.data.export',
        entityType: 'prv_data_export',
        entityId: created.id,
        changes: { request_code: row.code, party_id: partyId, sections: report.sections.length },
      });
      return created.id;
    });
  }

  private async report(
    tx: TenantTransaction,
    row: PrivacyRequest,
    partyId: string,
    at: Date,
  ): Promise<PersonalDataReport> {
    const party = await this.parties.holder(tx, partyId);
    if (party === null) throw requestNotFound();
    const holder: PersonalDataHolder = { partyId, emails: holderEmails(row, party.email) };
    const sections: PersonalDataSection[] = [{ ...PARTY_SECTION, records: [party.record] }];
    for (const source of this.sources()) {
      const records = await source.collect(tx, holder);
      if (records.length > 0) sections.push({ key: source.key, title: source.title, records });
    }
    return {
      company: (await companyIdentity(tx)).legalName,
      holder: party.name,
      request_code: row.code,
      generated_at: at.toISOString(),
      sections,
    };
  }

  /** Suprime o bloquea en cada módulo y cierra con la ficha del titular (decisión 8). */
  async erase(
    principal: Principal,
    partyId: string,
    requestId: string,
    meta: RequestMeta,
  ): Promise<ErasureResult> {
    const actor = actorOf(principal, meta, this.clock.now());
    const outcome = await this.database.withTenant(principal, async (tx) => {
      const row = await lockRequest(tx, requestId);
      assertRequestStep(row, 'erase');
      assertTarget(row, partyId);
      if (row.right !== 'erase') {
        throw requestStepInvalid('Solo se suprimen datos cuando el titular pidió la supresión.');
      }
      if (row.erasedAt !== null)
        throw requestStepInvalid('Los datos de esta solicitud ya se suprimieron.');
      await assertNoActivePortalAccount(tx, partyId);
      const erasure = await this.runErasure(tx, row, partyId, actor);
      await this.recordErasure(tx, actor, row, erasure.result);
      return erasure;
    });
    // Ya confirmada la supresión, se borran del almacenamiento los archivos retirados.
    for (const key of outcome.storageKeys) await this.storage.delete(key);
    return outcome.result;
  }

  private async runErasure(
    tx: TenantTransaction,
    row: PrivacyRequest,
    partyId: string,
    actor: PrivacyActor,
  ): Promise<{ readonly result: ErasureResult; readonly storageKeys: string[] }> {
    const party = await this.parties.holder(tx, partyId);
    const holder: PersonalDataHolder = { partyId, emails: holderEmails(row, party?.email ?? null) };
    const erasureActor: ErasureActor = { ...actor, requestCode: row.code };
    const sections: ErasureSection[] = [];
    const storageKeys: string[] = [];
    for (const source of this.sources()) {
      const { storageKeys: keys, ...outcome } = await source.erase(tx, holder, erasureActor);
      storageKeys.push(...(keys ?? []));
      sections.push({ key: source.key, title: source.title, ...outcome });
    }
    const blocked = sections.filter((section) => section.outcome === 'blocked');
    const reason = blocked.length === 0 ? null : blocked.map((section) => section.reason).join(' ');
    const settled = await this.parties.settleErasure(tx, partyId, reason, erasureActor);
    const partySection: ErasureSection = {
      ...PARTY_SECTION,
      outcome: settled.outcome,
      count: settled.count,
      reason: settled.reason,
    };
    return {
      result: { erased_at: actor.at.toISOString(), sections: [partySection, ...sections] },
      storageKeys,
    };
  }

  private async recordErasure(
    tx: TenantTransaction,
    actor: PrivacyActor,
    row: PrivacyRequest,
    result: ErasureResult,
  ): Promise<void> {
    await tx.privacyRequest.update({
      where: { id: row.id },
      data: { erasure: result, erasedAt: actor.at },
    });
    await addRequestEvent(tx, actor, row, { kind: 'erased', note: null, mail: false });
    await auditPrivacy(tx, actor, {
      action: 'privacy.data.erase',
      entityType: 'prv_request',
      entityId: row.id,
      changes: {
        code: row.code,
        party_id: row.partyId,
        outcomes: result.sections.map((section) => `${section.key}:${section.outcome}`),
      },
    });
  }

  /** El archivo para el titular, en formato de datos (decisión 6). */
  async exportData(
    principal: Principal,
    requestId: string,
    exportId: string,
  ): Promise<PersonalDataReport> {
    return this.database.withTenant(principal, async (tx) => {
      const found = await tx.privacyDataExport.findFirst({
        where: { id: exportId, requestId, deletedAt: null },
      });
      if (found === null) throw requestNotFound();
      return personalDataReportSchema.parse(found.content);
    });
  }

  /** El PDF legible, cuando el worker lo terminó. */
  async exportPdf(principal: Principal, requestId: string, exportId: string): Promise<OpenedFile> {
    return this.database.withTenant(principal, async (tx) => {
      const found = await tx.privacyDataExport.findFirst({
        where: { id: exportId, requestId, deletedAt: null },
      });
      if (found === null) throw requestNotFound();
      const file =
        found.pdfFileId === null
          ? null
          : await openAvailableFile(tx, this.storage, found.pdfFileId);
      if (file === null) throw exportNotReady();
      return file;
    });
  }
}
