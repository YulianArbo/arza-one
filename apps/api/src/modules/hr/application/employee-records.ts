import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  employeeDetailResponseSchema,
  employeeSchema,
  HR_ERROR_CODES,
  type DownloadLinkResponse,
  type Employee,
  type EmployeeDetail,
} from '@arza/contracts';

import type {
  HrContract,
  HrEmployee,
  HrFileChecklistItem,
  HrOnboardingTask,
} from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { employmentSignatureSnapshot } from '../../contract/index.js';
import { bogotaToday, catalogLabels, positionsById, toCalendarDate } from '../../core/index.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { peopleById } from '../../iam/index.js';
import { candidateParties } from '../../party/index.js';

interface Viewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

type SignatureSnapshot = NonNullable<Awaited<ReturnType<typeof employmentSignatureSnapshot>>>;

/** Catálogo de las bandas salariales (decisión 8 del B35). */
export const SALARY_BANDS = 'hr_salary_bands';

interface DetailSource {
  readonly row: HrEmployee;
  readonly employee: Employee | undefined;
  readonly contract: HrContract | null;
  readonly signature: SignatureSnapshot | null;
  readonly entries: readonly HrFileChecklistItem[] | null;
  readonly tasks: readonly HrOnboardingTask[];
  readonly people: Awaited<ReturnType<typeof peopleById>>;
  readonly seesFile: boolean;
  readonly bands: ReadonlyMap<string, string>;
}

function scope(viewer: Viewer) {
  return {
    tenantId: viewer.principal.tenantId,
    deletedAt: null,
    ...(hasUnconditionalPermission(viewer.ability, 'hr.employee.read')
      ? {}
      : { userId: viewer.principal.userId }),
  };
}

function notFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    HR_ERROR_CODES.recordNotFound,
    'El registro laboral no está disponible.',
  );
}

async function views(tx: TenantTransaction, rows: HrEmployee[]): Promise<Employee[]> {
  const people = await candidateParties(
    tx,
    rows.map(({ partyId }) => partyId),
  );
  const positions = await positionsById(
    tx,
    rows.map(({ positionId }) => positionId),
  );
  return rows.map((row) => {
    const person = people.get(row.partyId);
    return employeeSchema.parse({
      id: row.id,
      name:
        person === undefined
          ? 'Persona no disponible'
          : `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
      position: {
        id: row.positionId,
        name: positions.get(row.positionId)?.name ?? 'Cargo no disponible',
      },
      hire_date: toCalendarDate(row.hireDate),
      contract_type: row.contractType,
      work_mode: row.workMode,
      status: row.status,
      user_id: row.userId,
      candidate_id: row.candidateId,
      version: row.version,
    });
  });
}

/** Contrato vigente del colaborador, si lo tiene. */
async function latestContract(
  tx: TenantTransaction,
  employeeId: string,
): Promise<HrContract | null> {
  return tx.hrContract.findFirst({
    where: { employeeId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}

/** Firma visible para quien puede ver el expediente o firma el contrato como empresa. */
async function readableSignature(
  tx: TenantTransaction,
  viewer: Viewer,
  contract: HrContract | null,
  seesFile: boolean,
): Promise<SignatureSnapshot | null> {
  if (contract === null) return null;
  const envelopeId = contract.envelopeId;
  if (envelopeId === null) return null;
  const seesSalary = hasUnconditionalPermission(viewer.ability, 'hr.salary.read');
  const allowed = seesFile || (seesSalary && contract.companySignerId === viewer.principal.userId);
  if (!allowed) return null;
  return employmentSignatureSnapshot(tx, { contractId: contract.id, envelopeId });
}

/** Datos del colaborador, contrato, expediente e inducción que alimentan la ficha. */
async function detailSource(
  tx: TenantTransaction,
  viewer: Viewer,
  id: string,
): Promise<DetailSource> {
  const seesFile = hasUnconditionalPermission(viewer.ability, 'hr.file.read');
  const row = await tx.hrEmployee.findFirst({ where: { ...scope(viewer), id } });
  if (row === null) throw notFound();
  const [employee] = await views(tx, [row]);
  const contract = await latestContract(tx, id);
  const signature = await readableSignature(tx, viewer, contract, seesFile);
  const entries = seesFile
    ? await tx.hrFileChecklistItem.findMany({
        where: { employeeId: id, deletedAt: null },
        orderBy: { item: 'asc' },
      })
    : null;
  const tasks = seesFile
    ? await tx.hrOnboardingTask.findMany({
        where: { employeeId: id, deletedAt: null },
        orderBy: [{ dueOn: 'asc' }, { kind: 'asc' }],
      })
    : [];
  const people = await peopleById(
    tx,
    tasks.flatMap(({ responsibleId }) => (responsibleId === null ? [] : [responsibleId])),
  );
  const bands = await catalogLabels(tx, SALARY_BANDS);
  return { row, employee, contract, signature, entries, tasks, people, seesFile, bands };
}

function contractView(
  contract: HrContract,
  signature: SignatureSnapshot | null,
  seesSalary: boolean,
  viewer: Viewer,
) {
  const sealedAt = signature?.sealStatus === 'ready' ? signature.completedAt : null;
  return {
    id: contract.id,
    type: contract.type,
    record_code: contract.recordCode,
    envelope_code: contract.envelopeCode,
    starts_on: toCalendarDate(contract.startsOn),
    ends_on: contract.endsOn === null ? null : toCalendarDate(contract.endsOn),
    salary_band: contract.salaryBand,
    salary_band_label: contract.salaryBand,
    salary: seesSalary ? contract.salary.toFixed(2) : null,
    status: sealedAt === null ? contract.status : 'signed',
    signers: signature?.signers.map(({ name, role, status }) => ({ name, role, status })) ?? [],
    sign_by: toCalendarDate(contract.signBy),
    signed_on:
      sealedAt === null
        ? contract.signedOn === null
          ? null
          : toCalendarDate(contract.signedOn)
        : bogotaToday(sealedAt),
    closed_reason: signature?.closedReason ?? contract.closedReason,
    my_turn:
      signature?.status === 'sent' &&
      signature.signers.some(
        (signer) => signer.userId === viewer.principal.userId && signer.status === 'pending',
      ),
    document_available: signature !== null,
    version: contract.version,
  };
}

function fileView(entries: readonly HrFileChecklistItem[] | null) {
  return (
    entries?.map((entry) => ({
      item: entry.item,
      status: entry.status,
      file_id: entry.documentId,
      note: entry.note,
      version: entry.version,
    })) ?? null
  );
}

function onboardingView(source: DetailSource, id: string) {
  return source.tasks.map((task) => ({
    id: task.id,
    employee: { id, name: source.employee?.name ?? 'Colaborador' },
    kind: task.kind,
    title: task.task,
    responsible:
      task.responsibleId === null
        ? null
        : {
            id: task.responsibleId,
            name: source.people.get(task.responsibleId)?.displayName ?? 'Responsable',
          },
    due_on: toCalendarDate(task.dueOn),
    done_on: task.doneOn === null ? null : toCalendarDate(task.doneOn),
    note: task.note,
    version: task.version,
  }));
}

function detailPayload(viewer: Viewer, source: DetailSource) {
  const seesSalary = hasUnconditionalPermission(viewer.ability, 'hr.salary.read');
  return {
    employee: source.employee,
    email:
      source.seesFile || source.row.userId === viewer.principal.userId
        ? source.row.workEmail
        : null,
    contract:
      source.contract === null
        ? null
        : {
            ...contractView(source.contract, source.signature, seesSalary, viewer),
            salary_band_label:
              source.bands.get(source.contract.salaryBand) ?? source.contract.salaryBand,
          },
    file: fileView(source.entries),
    onboarding: onboardingView(source, source.row.id),
  };
}

@Injectable()
export class EmployeeRecords {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async list(viewer: Viewer): Promise<Employee[]> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const rows = await tx.hrEmployee.findMany({
        where: scope(viewer),
        orderBy: [{ hireDate: 'desc' }, { id: 'asc' }],
      });
      return views(tx, rows);
    });
  }

  async detail(viewer: Viewer, id: string): Promise<EmployeeDetail> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const source = await detailSource(tx, viewer, id);
      return employeeDetailResponseSchema.parse(detailPayload(viewer, source));
    });
  }

  async contractLink(viewer: Viewer, meta: RequestMeta, id: string): Promise<DownloadLinkResponse> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const { contract, envelopeId } = await downloadableContract(tx, viewer, id);
      const signature = await employmentSignatureSnapshot(tx, {
        contractId: contract.id,
        envelopeId,
      });
      if (signature === null) throw notFound();
      return this.links.issue(
        tx,
        viewer.principal,
        signature.signedFileId ?? signature.documentFileId,
        meta,
      );
    });
  }
}

/** Contrato descargable, con la verificación de permisos del expediente. */
async function downloadableContract(
  tx: TenantTransaction,
  viewer: Viewer,
  id: string,
): Promise<{ readonly contract: HrContract; readonly envelopeId: string }> {
  const employee = await tx.hrEmployee.findFirst({
    where: { ...scope(viewer), id },
    select: { id: true },
  });
  if (employee === null) throw notFound();
  const contract = await latestContract(tx, id);
  if (contract === null) throw notFound();
  const envelopeId = contract.envelopeId;
  if (envelopeId === null) throw notFound();
  if (
    !hasUnconditionalPermission(viewer.ability, 'hr.file.read') &&
    !(
      hasUnconditionalPermission(viewer.ability, 'hr.salary.read') &&
      contract.companySignerId === viewer.principal.userId
    )
  ) {
    throw permissionDenied();
  }
  return { contract, envelopeId };
}
