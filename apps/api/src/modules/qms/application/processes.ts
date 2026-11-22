import { Inject, Injectable } from '@nestjs/common';
import type { Characterization, QmsProcess, SaveCharacterization } from '@arza/contracts';

import type { QmsProcess as QmsProcessRow } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { activeProcesses, positionsById, processOwnerPositionId } from '../../core/index.js';
import {
  assertProcess,
  auditQms,
  qmsActorOf,
  qmsConflict,
  qmsNotFound,
  type Target,
} from './qms-support.js';

// Mapa de procesos (B38, ficha 17.15). Los procesos son los del organigrama del núcleo; Calidad
// registra el tipo y la caracterización de cada uno.

function characterizationView(row: QmsProcessRow): Characterization {
  return {
    id: row.id,
    process_type: row.processType as Characterization['process_type'],
    objective: row.objective,
    scope: row.scope,
    inputs: row.inputs,
    outputs: row.outputs,
    document_id: row.documentId,
    version: row.version,
  };
}

function characterizationData(input: SaveCharacterization) {
  return {
    processType: input.process_type,
    objective: input.objective,
    scope: input.scope,
    inputs: input.inputs,
    outputs: input.outputs,
    documentId: input.document_id,
  };
}

function auditOf(row: { processType: string; objective: string; documentId: string | null }) {
  return { process_type: row.processType, objective: row.objective, document_id: row.documentId };
}

@Injectable()
export class Processes {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** El mapa: cada proceso activo del núcleo con su responsable y su caracterización. */
  async list(principal: Principal): Promise<QmsProcess[]> {
    return this.database.withTenant(principal, async (tx) => {
      const processes = await activeProcesses(tx);
      const rows = await tx.qmsProcess.findMany({ where: { deletedAt: null } });
      const byUnit = new Map(rows.map((row) => [row.orgUnitId, row]));
      const owners = await Promise.all(
        processes.map(async (process) => processOwnerPositionId(tx, process.code)),
      );
      const positions = await positionsById(
        tx,
        owners.filter((id): id is string => id !== null),
      );
      return processes.map((process, index) => {
        const ownerId = owners[index] ?? null;
        const position = ownerId === null ? undefined : positions.get(ownerId);
        const row = byUnit.get(process.id);
        return {
          id: process.id,
          code: process.code,
          name: process.name,
          owner_position: position === undefined ? null : { id: position.id, name: position.name },
          characterization: row === undefined ? null : characterizationView(row),
        };
      });
    });
  }

  async characterize(
    principal: Principal,
    meta: RequestMeta,
    processId: string,
    input: SaveCharacterization,
  ): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertProcess(tx, processId);
      const existing = await tx.qmsProcess.findFirst({ where: { orgUnitId: processId } });
      if (existing !== null) throw qmsConflict('El proceso ya tiene caracterización.');
      const row = await tx.qmsProcess.create({
        data: { tenantId: actor.tenantId, orgUnitId: processId, ...characterizationData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.process.characterize',
        entityType: 'qms_process',
        entityId: row.id,
        changes: { org_unit_id: processId, ...auditOf(row) },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveCharacterization,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsProcess.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La caracterización no existe.');
      const data = characterizationData(input);
      const updated = await tx.qmsProcess.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.process.update',
        entityType: 'qms_process',
        entityId: row.id,
        changes: changesBetween(auditOf(row), auditOf(data)),
      });
    });
  }
}
