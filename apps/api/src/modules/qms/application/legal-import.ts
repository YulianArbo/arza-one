import { Inject, Injectable } from '@nestjs/common';
import type {
  ImportLegalRequirements,
  LegalImportResponse,
  LegalImportRow,
  SaveLegalRequirement,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { parseCsv } from '../../../platform/export/csv-read.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { activeProcesses } from '../../core/index.js';
import { readLegalFile, requirementKey, type LegalFileRow } from '../domain/legal-file.js';
import { insertRequirement, requirementData } from './legal-requirements.js';
import { auditQms, qmsActorOf, qmsInvalid, type QmsActor } from './qms-support.js';

// Carga del normograma desde el archivo RE-DG-001 (B46, decisión 6). Primero se revisa: con un
// solo error no se guarda nada. Un requisito con la misma norma y artículos se actualiza; los
// demás se crean. La carga se puede repetir sin duplicar.

interface PlannedRow {
  readonly row: LegalFileRow;
  readonly input: SaveLegalRequirement | null;
  readonly existingId: string | null;
  readonly errors: readonly string[];
}

async function plan(tx: TenantTransaction, rows: readonly LegalFileRow[]): Promise<PlannedRow[]> {
  const [processes, existing] = await Promise.all([
    activeProcesses(tx),
    tx.qmsLegalRequirement.findMany({
      where: { deletedAt: null },
      select: { id: true, norm: true, article: true },
    }),
  ]);
  const processByCode = new Map(processes.map((unit) => [unit.code.toUpperCase(), unit.id]));
  const byKey = new Map(existing.map((item) => [requirementKey(item.norm, item.article), item.id]));
  return rows.map((row) => {
    const processId =
      row.processCode === null ? null : (processByCode.get(row.processCode.toUpperCase()) ?? null);
    const errors = [...row.errors];
    if (row.processCode !== null && processId === null) {
      errors.push(`El proceso «${row.processCode}» no existe o no está activo.`);
    }
    const input =
      row.input === null || errors.length > 0
        ? null
        : { ...row.input, process_id: processId, responsible_id: null };
    const existingId = byKey.get(requirementKey(row.norm, row.article)) ?? null;
    return { row, input, existingId, errors };
  });
}

function reportOf(planned: readonly PlannedRow[]): LegalImportRow[] {
  return planned.map((item) => ({
    line: item.row.line,
    norm: item.row.norm,
    article: item.row.article,
    outcome: item.errors.length > 0 ? 'error' : item.existingId === null ? 'create' : 'update',
    errors: [...item.errors],
  }));
}

async function save(tx: TenantTransaction, actor: QmsActor, item: PlannedRow): Promise<void> {
  if (item.input === null) return;
  if (item.existingId === null) {
    await insertRequirement(tx, actor, item.input);
    return;
  }
  // Al cargar se conserva el responsable que ya tenía el requisito.
  const data = requirementData(item.input);
  await tx.qmsLegalRequirement.update({
    where: { id: item.existingId },
    data: {
      normType: data.normType,
      norm: data.norm,
      issuer: data.issuer,
      article: data.article,
      requirement: data.requirement,
      complianceMeans: data.complianceMeans,
      processId: data.processId,
      applies: data.applies,
    },
  });
  await auditQms(tx, actor, {
    action: 'qms.legal_requirement.update',
    entityType: 'qms_legal_requirement',
    entityId: item.existingId,
    changes: { norm: item.input.norm, article: item.input.article, source: 'import' },
  });
}

@Injectable()
export class LegalImport {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async run(
    principal: Principal,
    meta: RequestMeta,
    input: ImportLegalRequirements,
  ): Promise<LegalImportResponse> {
    const reading = readLegalFile(parseCsv(input.content));
    if (!reading.ok) throw qmsInvalid(reading.error);
    const planned = await this.database.withTenant(principal, (tx) => plan(tx, reading.rows));
    const rows = reportOf(planned);
    const created = rows.filter((row) => row.outcome === 'create').length;
    const updated = rows.filter((row) => row.outcome === 'update').length;
    const clean = rows.every((row) => row.outcome !== 'error');
    if (!input.apply || !clean) return { applied: false, created, updated, rows };
    const report = await this.apply(principal, meta, reading.rows);
    return { applied: true, ...report };
  }

  /** Guarda todo en una transacción; se vuelve a planear dentro de ella para no usar datos viejos. */
  private async apply(
    principal: Principal,
    meta: RequestMeta,
    fileRows: readonly LegalFileRow[],
  ): Promise<Omit<LegalImportResponse, 'applied'>> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const planned = await plan(tx, fileRows);
      const rows = reportOf(planned);
      if (rows.some((row) => row.outcome === 'error')) {
        throw qmsInvalid(
          'El normograma cambió mientras se revisaba el archivo; revíselo de nuevo.',
        );
      }
      for (const item of planned) await save(tx, actor, item);
      const created = rows.filter((row) => row.outcome === 'create').length;
      const updated = rows.length - created;
      await auditQms(tx, actor, {
        action: 'qms.legal_requirement.import',
        entityType: 'qms_legal_requirement',
        entityId: actor.tenantId,
        changes: { created, updated },
      });
      return { created, updated, rows };
    });
  }
}
