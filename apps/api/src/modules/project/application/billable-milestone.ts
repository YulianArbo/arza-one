import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

/** Datos mínimos de un hito que Proyectos habilitó para facturación (B27). */
export interface BillableMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly partyId: string;
  readonly contractId: string | null;
  readonly name: string;
  readonly amount: string;
}

/** El hito es visible para Finanzas solo después de la aceptación requerida por Proyectos. */
export async function billableMilestone(
  tx: TenantTransaction,
  id: string,
): Promise<BillableMilestone | null> {
  const row = await tx.prjMilestone.findFirst({
    where: { id, status: 'billable', deletedAt: null, billableAmount: { not: null } },
    include: {
      project: { select: { id: true, code: true, name: true, partyId: true, contractId: true } },
    },
  });
  if (row?.billableAmount === null || row?.billableAmount === undefined) return null;
  return {
    id: row.id,
    projectId: row.project.id,
    projectCode: row.project.code,
    projectName: row.project.name,
    partyId: row.project.partyId,
    contractId: row.project.contractId,
    name: row.name,
    amount: row.billableAmount.toFixed(2),
  };
}

/** Hitos facturables del tenant; los que ya tienen factura los filtra Finanzas. */
export async function billableMilestones(tx: TenantTransaction): Promise<BillableMilestone[]> {
  const rows = await tx.prjMilestone.findMany({
    where: { status: 'billable', deletedAt: null, billableAmount: { not: null } },
    include: {
      project: { select: { id: true, code: true, name: true, partyId: true, contractId: true } },
    },
    orderBy: [{ billableAt: 'asc' }, { id: 'asc' }],
  });
  return rows.flatMap((row) =>
    row.billableAmount === null
      ? []
      : [
          {
            id: row.id,
            projectId: row.project.id,
            projectCode: row.project.code,
            projectName: row.project.name,
            partyId: row.project.partyId,
            contractId: row.project.contractId,
            name: row.name,
            amount: row.billableAmount.toFixed(2),
          },
        ],
  );
}
