'use client';

import {
  companySignerListResponseSchema,
  CONTRACT_TYPES,
  hireCandidateSchema,
  hrCreatedResponseSchema,
  hrPositionListResponseSchema,
  WORK_MODES,
  type CatalogItem,
  type Candidate,
  type CompanySignerOption,
  type FileListResponse,
  type HrRef,
} from '@arza/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { useFiles } from '../files/queries';
import { NewRecord } from '../finance/ledger-ui';
import { useCatalog } from '../organization/queries';
import { usePermissions } from '../session/permissions';
import { HrForm, type HrField } from './hr-form';
import { useHrQuery } from './hr-queries';

export function PrepareHiring({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  const { can } = usePermissions();
  if (candidate.employee_id !== null && can('hr.employee.read')) {
    return (
      <Link
        className="underline"
        href={`/app/talento-y-sst/colaboradores/${candidate.employee_id}`}
      >
        Abrir ficha laboral
      </Link>
    );
  }
  return (
    <NewRecord
      allowed={candidate.stage === 'selected' && can('hr.employee.manage')}
      label="Preparar contrato"
      title="Preparar contrato laboral"
      description={candidate.name}
    >
      {(close) => <HiringForm candidate={candidate} onDone={close} />}
    </NewRecord>
  );
}

function positionField(positions: readonly HrRef[]): HrField {
  return {
    key: 'position_id',
    label: 'Cargo',
    options: positions.map(({ id, name }) => ({ value: id, label: name })),
  };
}

/** Datos del contrato que no dependen de otras consultas. */
function hiringDetailFields(bands: readonly SalaryBand[]): readonly HrField[] {
  return [
    { key: 'hire_date', label: 'Fecha de ingreso', type: 'date', value: bogotaToday() },
    {
      key: 'contract_type',
      label: 'Tipo de contrato',
      options: Object.entries(CONTRACT_TYPES).map(([value, label]) => ({ value, label })),
    },
    { key: 'ends_on', label: 'Fecha de terminación', type: 'date' },
    {
      key: 'work_mode',
      label: 'Modalidad',
      options: Object.entries(WORK_MODES).map(([value, label]) => ({ value, label })),
    },
    {
      key: 'salary_band',
      label: 'Banda salarial',
      options: bands
        .filter(({ is_active }) => is_active)
        .map(({ code, label }) => ({ value: code, label })),
    },
    { key: 'salary', label: 'Salario mensual en pesos' },
    { key: 'work_email', label: 'Correo de la cuenta de trabajo', type: 'email' },
  ];
}

function contractFileField(files: FileListResponse['data']): HrField {
  return {
    key: 'contract_file_id',
    label: 'PDF disponible',
    options: files
      .filter((item) => item.status === 'available' && item.mime_type === 'application/pdf')
      .map(({ id, file_name }) => ({ value: id, label: file_name })),
  };
}

function companySignerField(signers: readonly CompanySignerOption[]): HrField {
  return {
    key: 'company_signer_id',
    label: 'Firma por la empresa',
    options: signers
      .filter(({ ready }) => ready)
      .map(({ id, name }) => ({ value: id, label: name })),
  };
}

function hiringFields(
  positions: readonly HrRef[],
  signers: readonly CompanySignerOption[],
  files: FileListResponse['data'],
  bands: readonly SalaryBand[],
): readonly HrField[] {
  return [
    positionField(positions),
    ...hiringDetailFields(bands),
    contractFileField(files),
    companySignerField(signers),
    { key: 'message', label: 'Mensaje a la persona que firma' },
  ];
}

/** La terminación y el mensaje vacíos viajan como nulos. */
/** Opciones del catálogo «Bandas salariales» (decisión 8 del B35). */
const SALARY_BANDS = 'hr_salary_bands';
type SalaryBand = CatalogItem;

function hiringBody(values: Record<string, string>) {
  const endsOn = values['ends_on'];
  const message = values['message'];
  return {
    ...values,
    ends_on: endsOn === '' ? null : endsOn,
    message: message === '' ? null : message,
  };
}

function MissingFileHint(): JSX.Element {
  return (
    <p className="text-sm">
      Si el PDF aún no aparece, cargue el documento desde{' '}
      <Link className="underline" href="/app/archivos" target="_blank" rel="noreferrer">
        Archivos
      </Link>{' '}
      y espere a que termine el análisis.
    </p>
  );
}

interface HiringData {
  readonly candidate: Candidate;
  readonly onDone: () => void;
  readonly positions: readonly HrRef[];
  readonly signers: readonly CompanySignerOption[];
  readonly files: FileListResponse['data'];
}

function HiringBodyForm({ candidate, onDone, positions, signers, files }: HiringData): JSX.Element {
  const api = useApiClient();
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const bands = useCatalog(SALARY_BANDS).data?.items ?? [];
  return (
    <HrForm
      fields={hiringFields(positions, signers, files, bands)}
      schema={hireCandidateSchema}
      prepare={hiringBody}
      run={async (body, csrfToken) => {
        const result = await api.post(`/v1/hr/candidates/${candidate.id}/actions/prepare-hiring`, {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          version: candidate.version,
          idempotencyKey: key,
        });
        router.push(`/app/talento-y-sst/colaboradores/${result.id}`);
      }}
      label="Enviar contrato a firma"
      onDone={onDone}
    >
      <MissingFileHint />
    </HrForm>
  );
}

function HiringForm({
  candidate,
  onDone,
}: {
  readonly candidate: Candidate;
  readonly onDone: () => void;
}): JSX.Element {
  const positions = useHrQuery('/v1/hr/vacancies/positions', hrPositionListResponseSchema);
  const signers = useHrQuery('/v1/hr/employees/company-signers', companySignerListResponseSchema);
  const files = useFiles();
  return (
    <QueryState query={positions} loadingLabel="Cargando cargos">
      {({ data: availablePositions }) => (
        <QueryState query={signers} loadingLabel="Cargando firmantes">
          {({ data: availableSigners }) => (
            <QueryState query={files} loadingLabel="Cargando archivos">
              {({ data: availableFiles }) => (
                <HiringBodyForm
                  candidate={candidate}
                  onDone={onDone}
                  positions={availablePositions}
                  signers={availableSigners}
                  files={availableFiles}
                />
              )}
            </QueryState>
          )}
        </QueryState>
      )}
    </QueryState>
  );
}
