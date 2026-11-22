import type { NonconformitySource } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { auditQms, emitQms, qualityLeaders, type QmsActor } from './qms-support.js';

// Abrir una no conformidad, a mano o enlazada a su origen (B38, decisiones 4 y 5). Va dentro de la
// transacción de quien la abre: si se revierte, el código no se gasta. Un mismo origen abre a lo
// sumo una no conformidad (índice único en la base).

const NONCONFORMITIES = { name: 'No conformidades', prefix: 'NC', padding: 4 };

export interface OpenNonconformity {
  readonly source: NonconformitySource;
  readonly origin: { readonly id: string; readonly code: string } | null;
  readonly description: string;
  readonly processId: string | null;
  readonly detectedOn: string;
}

export interface OpenedNonconformity {
  readonly id: string;
  readonly code: string;
}

/** Registra la no conformidad «detectada», su auditoría y el aviso a Calidad. */
export async function openNonconformity(
  tx: TenantTransaction,
  actor: QmsActor,
  input: OpenNonconformity,
): Promise<OpenedNonconformity> {
  const code = await nextBusinessCode(tx, 'qms.nonconformity', actor.at, NONCONFORMITIES);
  const row = await tx.qmsNonconformity.create({
    data: {
      tenantId: actor.tenantId,
      code,
      source: input.source,
      originId: input.origin?.id ?? null,
      originCode: input.origin?.code ?? null,
      processId: input.processId,
      description: input.description,
      detectedOn: fromCalendarDate(input.detectedOn),
      reportedBy: actor.userId,
    },
  });
  await auditQms(tx, actor, {
    action: 'qms.nonconformity.report',
    entityType: 'qms_nonconformity',
    entityId: row.id,
    changes: { code, source: input.source, origin_code: input.origin?.code ?? null },
  });
  await emitQms(tx, actor, 'qms.nonconformity.reported', {
    nonconformity_id: row.id,
    code,
    source: input.source,
    recipients: await qualityLeaders(tx, actor.at),
  });
  return { id: row.id, code };
}

/**
 * Una queja o un reclamo procedente abre su no conformidad al aprobarse la respuesta (decisión 4).
 * Lo llama Servicio al cliente desde su transacción; la descripción no lleva datos de quien se
 * quejó, solo el tipo y el código de la PQRSF.
 */
export async function openNonconformityFromPqrsf(
  tx: TenantTransaction,
  actor: QmsActor,
  pqrsf: { readonly id: string; readonly code: string; readonly kindLabel: string },
): Promise<OpenedNonconformity> {
  return openNonconformity(tx, actor, {
    source: 'pqrsf',
    origin: { id: pqrsf.id, code: pqrsf.code },
    description: `${pqrsf.kindLabel} ${pqrsf.code} declarada procedente. Revise el detalle en Servicio al cliente.`,
    processId: null,
    detectedOn: bogotaToday(actor.at),
  });
}

/**
 * Un hallazgo de no conformidad abre su no conformidad al emitirse el informe de la auditoría (B39,
 * decisión 3). Lleva el código de la auditoría como origen y el proceso auditado.
 */
export async function openNonconformityFromFinding(
  tx: TenantTransaction,
  actor: QmsActor,
  finding: {
    readonly id: string;
    readonly auditCode: string;
    readonly processId: string;
    readonly requirement: string;
    readonly description: string;
    readonly detectedOn: string;
  },
): Promise<OpenedNonconformity> {
  return openNonconformity(tx, actor, {
    source: 'audit',
    origin: { id: finding.id, code: finding.auditCode },
    description: `${finding.description} (requisito: ${finding.requirement})`,
    processId: finding.processId,
    detectedOn: finding.detectedOn,
  });
}
