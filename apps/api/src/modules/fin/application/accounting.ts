import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNTING_EXPORT_MAX_ROWS,
  exportTotalsSchema,
  type ExportBatch,
  type FinancePeriod,
} from '@arza/contracts';

import type { FinExportBatch } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import {
  accountingFileName,
  accountingTotals,
  checksumOf,
  toAccountingCsv,
} from '../domain/accounting-csv.js';
import { isPastPeriod, periodRange, recentPeriods } from '../domain/ledger-rules.js';
import { accountingRows } from './accounting-rows.js';
import {
  exportTooLarge,
  periodNotClosable,
  recordNotFound,
  statusInvalid,
} from './ledger-messages.js';
import {
  dateColumn,
  isPeriodClosed,
  lockPeriodForClose,
  recordFinEvent,
  type FinActor,
} from './ledger-support.js';

// Cierre de periodo y exportación contable (B32). Al cerrar un mes se genera su lote definitivo;
// desde ahí nada con fecha en ese mes cambia, así que el archivo se puede volver a generar idéntico
// (lo prueba la huella). Un mes abierto se exporta como preliminar. Decisión 8: el archivo se arma
// en el acto con tope de filas. shortcut: pasarlo a segundo plano y guardarlo en el almacenamiento
// de archivos (file_id) cuando el volumen lo exija.

export interface AccountingFile {
  readonly batchId: string;
  readonly fileName: string;
  readonly content: string;
}

interface Built {
  readonly content: string;
  readonly rowCount: number;
  readonly totals: ReturnType<typeof accountingTotals>;
  readonly checksum: string;
}

async function build(tx: TenantTransaction, period: string): Promise<Built> {
  const rows = await accountingRows(tx, period);
  if (rows.length > ACCOUNTING_EXPORT_MAX_ROWS) throw exportTooLarge(ACCOUNTING_EXPORT_MAX_ROWS);
  const content = toAccountingCsv(rows);
  return {
    content,
    rowCount: rows.length,
    totals: accountingTotals(rows),
    checksum: checksumOf(content),
  };
}

function batchView(batch: FinExportBatch): ExportBatch {
  return {
    id: batch.id,
    period: batch.period,
    kind: batch.kind === 'definitive' ? 'definitive' : 'preliminary',
    row_count: batch.rowCount,
    totals: exportTotalsSchema.parse(batch.totals),
    checksum: batch.checksum,
    file_name: batch.fileName,
    exported_at: batch.exportedAt.toISOString(),
  };
}

@Injectable()
export class AccountingUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async periods(principal: Principal): Promise<FinancePeriod[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const [closed, batches] = await Promise.all([
        tx.finPeriod.findMany({ where: { deletedAt: null } }),
        tx.finExportBatch.findMany({ where: { kind: 'definitive', deletedAt: null } }),
      ]);
      const closedBy = new Map(closed.map((row) => [row.period, row]));
      const batchBy = new Map(batches.map((row) => [row.period, row.id]));
      const periods = [...new Set([...recentPeriods(today, 12), ...closedBy.keys()])].sort((a, b) =>
        b.localeCompare(a),
      );
      return Promise.all(
        periods.map(async (period) => {
          const row = closedBy.get(period);
          const pending = row === undefined ? await pendingExpenses(tx, period) : 0;
          return {
            period,
            status: row === undefined ? 'open' : 'closed',
            closable: row === undefined && isPastPeriod(period, today) && pending === 0,
            pending_expenses: pending,
            closed_at: row?.closedAt.toISOString() ?? null,
            batch_id: batchBy.get(period) ?? null,
          } satisfies FinancePeriod;
        }),
      );
    });
  }

  async batches(principal: Principal): Promise<ExportBatch[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.finExportBatch.findMany({
        where: { deletedAt: null },
        orderBy: [{ period: 'desc' }, { exportedAt: 'desc' }],
        take: 200,
      });
      return rows.map(batchView);
    });
  }

  /** Cierra el mes y genera su lote definitivo. */
  async close(actor: FinActor, period: string): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      await lockPeriodForClose(tx, period);
      await assertClosable(tx, period, bogotaToday(at));
      const built = await build(tx, period);
      await tx.finPeriod.create({
        data: {
          tenantId: actor.principal.tenantId,
          period,
          closedBy: actor.principal.userId,
          closedAt: at,
        },
      });
      const batch = await saveBatch(tx, actor, at, period, 'definitive', built);
      await recordFinEvent(tx, actor, at, {
        action: 'finance.period.close',
        event: 'fin.period.closed',
        entityType: 'fin_period',
        entityId: batch.id,
        payload: { period },
        changes: { period, row_count: built.rowCount, totals: built.totals },
      });
      return batch.id;
    });
  }

  /** Archivo del mes: el definitivo si ya cerró; si no, un lote preliminar nuevo. */
  async export(actor: FinActor, period: string): Promise<AccountingFile> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const definitive = await tx.finExportBatch.findFirst({
        where: { period, kind: 'definitive', deletedAt: null },
      });
      if (definitive !== null) return this.redownload(tx, actor, at, definitive);
      const built = await build(tx, period);
      const batch = await saveBatch(tx, actor, at, period, 'preliminary', built);
      await auditExport(tx, actor, at, batch, 'finance.export.create');
      return { batchId: batch.id, fileName: batch.fileName, content: built.content };
    });
  }

  /** Vuelve a descargar un lote definitivo: se genera de nuevo y debe tener la misma huella. */
  async download(actor: FinActor, id: string): Promise<AccountingFile> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const batch = await tx.finExportBatch.findFirst({ where: { id, deletedAt: null } });
      if (batch === null) throw recordNotFound('ese archivo');
      if (batch.kind !== 'definitive') {
        throw statusInvalid(
          'Un archivo preliminar se descarga al generarlo. Genere uno nuevo para el mes abierto.',
        );
      }
      return this.redownload(tx, actor, at, batch);
    });
  }

  private async redownload(
    tx: TenantTransaction,
    actor: FinActor,
    at: Date,
    batch: FinExportBatch,
  ): Promise<AccountingFile> {
    const built = await build(tx, batch.period);
    if (built.checksum !== batch.checksum) {
      throw statusInvalid('El archivo del mes cerrado no coincide con el lote guardado.');
    }
    await auditExport(tx, actor, at, batch, 'finance.export.download');
    return { batchId: batch.id, fileName: batch.fileName, content: built.content };
  }
}

async function pendingExpenses(tx: TenantTransaction, period: string): Promise<number> {
  const { from, to } = periodRange(period);
  return tx.finExpense.count({
    where: {
      status: 'pending',
      deletedAt: null,
      expenseDate: { gte: dateColumn(from), lte: dateColumn(to) },
    },
  });
}

async function assertClosable(tx: TenantTransaction, period: string, today: string): Promise<void> {
  if (!isPastPeriod(period, today)) {
    throw periodNotClosable('Solo se cierra un mes que ya terminó.');
  }
  if (await isPeriodClosed(tx, period)) throw periodNotClosable('Ese mes ya está cerrado.');
  const pending = await pendingExpenses(tx, period);
  if (pending > 0) {
    throw periodNotClosable(
      `Hay ${String(pending)} gasto(s) del mes sin decidir. Apruébelos o rechácelos antes de cerrar.`,
    );
  }
}

async function saveBatch(
  tx: TenantTransaction,
  actor: FinActor,
  at: Date,
  period: string,
  kind: 'preliminary' | 'definitive',
  built: Built,
): Promise<FinExportBatch> {
  return tx.finExportBatch.create({
    data: {
      tenantId: actor.principal.tenantId,
      period,
      kind,
      rowCount: built.rowCount,
      totals: built.totals,
      checksum: built.checksum,
      fileName: accountingFileName(period, kind),
      exportedBy: actor.principal.userId,
      exportedAt: at,
    },
  });
}

async function auditExport(
  tx: TenantTransaction,
  actor: FinActor,
  at: Date,
  batch: FinExportBatch,
  action: string,
): Promise<void> {
  await recordFinEvent(tx, actor, at, {
    action,
    event: action === 'finance.export.create' ? 'fin.export.created' : 'fin.export.downloaded',
    entityType: 'fin_export_batch',
    entityId: batch.id,
    payload: { period: batch.period, kind: batch.kind },
    changes: { period: batch.period, kind: batch.kind, row_count: batch.rowCount },
  });
}
