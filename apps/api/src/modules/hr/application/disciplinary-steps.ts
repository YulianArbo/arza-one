import type { CiteDisciplinary, DecideDisciplinary, RecordHearing } from '@arza/contracts';

import type { HrDisciplinaryCase, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import {
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  laborRulesOn,
  toCalendarDate,
} from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { auditHr, hrConflict, hrInvalid, type HrActor } from './hr-support.js';
import { disciplinaryContext } from './disciplinary-views.js';

// Pasos del proceso disciplinario con debido proceso (B36, decisión 8; RIT-001): citación con al
// menos los días hábiles del parámetro antes de los descargos, descargos con su acta firmada y
// decisión motivada. Cada paso exige el anterior. El colaborador recibe el aviso de la citación sin
// el contenido del caso: lo consulta en «Mi espacio».

export interface StepContext {
  readonly tx: TenantTransaction;
  readonly principal: Principal;
  readonly actor: HrActor;
  readonly cipher: FieldCipher;
  readonly row: HrDisciplinaryCase;
}

function assertStatus(row: HrDisciplinaryCase, status: string, message: string): void {
  if (row.status !== status) throw hrConflict(message);
}

async function assertFile(ctx: StepContext, fileId: string | null): Promise<void> {
  if (fileId === null || (await isAttachableFile(ctx.tx, ctx.principal, fileId))) return;
  throw hrInvalid('El documento adjunto no está disponible.');
}

async function store(
  ctx: StepContext,
  from: string,
  data: Record<string, unknown>,
  audit: { readonly action: string; readonly changes: Prisma.InputJsonObject },
): Promise<void> {
  const updated = await ctx.tx.hrDisciplinaryCase.updateMany({
    where: { id: ctx.row.id, version: ctx.row.version, status: from },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(ctx.tx, ctx.actor, {
    action: audit.action,
    entityType: 'hr_disciplinary_case',
    entityId: ctx.row.id,
    changes: audit.changes,
  });
}

/** dd/mm/aaaa, como se muestran las fechas en Colombia. */
function shown(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** La diligencia cae al menos N días hábiles después de hoy (parámetro «Reglas laborales»). */
async function assertHearingDate(ctx: StepContext, hearingOn: string, today: string) {
  const rules = await laborRulesOn(ctx.tx, today);
  const earliest = await businessDeadline(ctx.tx, today, rules.disciplinary_notice_days);
  if (hearingOn >= earliest) return;
  throw hrInvalid(
    `Entre la citación y los descargos deben pasar al menos ${String(rules.disciplinary_notice_days)} días hábiles: la fecha más próxima es el ${shown(earliest)}.`,
  );
}

/** El aviso al colaborador, sin el contenido del caso. */
async function announceCitation(ctx: StepContext, hearingOn: string): Promise<void> {
  const employee = await ctx.tx.hrEmployee.findFirst({
    where: { id: ctx.row.employeeId },
    select: { userId: true },
  });
  const userId = employee?.userId ?? null;
  await addOutboxEvent(ctx.tx, {
    tenantId: ctx.actor.tenantId,
    actorId: ctx.actor.userId,
    occurredAt: ctx.actor.at,
    eventType: 'hr.disciplinary.cited',
    payload: {
      case_id: ctx.row.id,
      hearing_on: hearingOn,
      recipients: userId === null ? [] : [userId],
    },
  });
}

/** Cita a descargos y avisa al colaborador. */
export async function citeCase(ctx: StepContext, input: CiteDisciplinary): Promise<void> {
  assertStatus(ctx.row, 'opened', 'El caso ya fue citado.');
  const today = bogotaToday(ctx.actor.at);
  await assertHearingDate(ctx, input.hearing_on, today);
  await assertFile(ctx, input.citation_file_id);
  await store(
    ctx,
    'opened',
    {
      status: 'cited',
      citedOn: fromCalendarDate(today),
      hearingOn: fromCalendarDate(input.hearing_on),
      citationFileId: input.citation_file_id,
    },
    {
      action: 'hr.disciplinary.cite',
      changes: { status: { from: 'opened', to: 'cited' }, hearing_on: input.hearing_on },
    },
  );
  await announceCitation(ctx, input.hearing_on);
}

/** Registra los descargos con el acta firmada, desde el día de la diligencia. */
export async function recordHearing(ctx: StepContext, input: RecordHearing): Promise<void> {
  assertStatus(ctx.row, 'cited', 'Primero se cita a descargos.');
  const hearingOn = ctx.row.hearingOn === null ? null : toCalendarDate(ctx.row.hearingOn);
  if (hearingOn === null || hearingOn > bogotaToday(ctx.actor.at)) {
    throw hrInvalid('Los descargos se registran desde el día de la diligencia.');
  }
  await assertFile(ctx, input.hearing_record_file_id);
  await store(
    ctx,
    'cited',
    {
      status: 'heard',
      statementEncrypted: ctx.cipher.encrypt(
        input.statement,
        disciplinaryContext(ctx.actor.tenantId, ctx.row.id, 'statement'),
      ),
      hearingRecordFileId: input.hearing_record_file_id,
    },
    { action: 'hr.disciplinary.hearing', changes: { status: { from: 'cited', to: 'heard' } } },
  );
}

/** Decisión motivada; cierra el caso. */
export async function decideCase(ctx: StepContext, input: DecideDisciplinary): Promise<void> {
  assertStatus(ctx.row, 'heard', 'La decisión exige los descargos registrados.');
  await assertFile(ctx, input.decision_file_id);
  await store(
    ctx,
    'heard',
    {
      status: 'decided',
      decision: input.decision,
      suspensionDays: input.suspension_days,
      reasoningEncrypted: ctx.cipher.encrypt(
        input.reasoning,
        disciplinaryContext(ctx.actor.tenantId, ctx.row.id, 'reasoning'),
      ),
      decisionFileId: input.decision_file_id,
      decidedOn: fromCalendarDate(bogotaToday(ctx.actor.at)),
    },
    {
      action: 'hr.disciplinary.decide',
      changes: { status: { from: 'heard', to: 'decided' }, decision: input.decision },
    },
  );
}
