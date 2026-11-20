'use client';

import {
  closeVacancySchema,
  hrCreatedResponseSchema,
  hrPositionListResponseSchema,
  saveVacancySchema,
  VACANCY_REASONS,
  type Vacancy,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { NewRecord } from '../finance/ledger-ui';
import { HrForm } from './hr-form';
import { useHrQuery } from './hr-queries';

export function NewVacancy(): JSX.Element {
  return (
    <NewRecord
      allowed
      variant="outline"
      label="Registrar vacante"
      title="Registrar vacante"
      description="Seleccione el cargo y el motivo de apertura."
    >
      {(close) => <VacancyForm onDone={close} />}
    </NewRecord>
  );
}

/** Descripción vacía como nula. */
function optionalText(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function VacancyForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const positions = useHrQuery('/v1/hr/vacancies/positions', hrPositionListResponseSchema);
  return (
    <QueryState query={positions} loadingLabel="Cargando cargos">
      {({ data }) => (
        <HrForm
          fields={[
            {
              key: 'position_id',
              label: 'Cargo',
              options: data.map(({ id, name }) => ({ value: id, label: name })),
            },
            {
              key: 'reason',
              label: 'Motivo',
              options: Object.entries(VACANCY_REASONS).map(([value, label]) => ({ value, label })),
            },
            { key: 'opened_on', label: 'Fecha de apertura', type: 'date', value: bogotaToday() },
            { key: 'description', label: 'Descripción' },
          ]}
          schema={saveVacancySchema}
          prepare={(values) => ({ ...values, description: optionalText(values['description']) })}
          run={(body, csrfToken) =>
            api.post('/v1/hr/vacancies', {
              body,
              csrfToken,
              schema: hrCreatedResponseSchema,
              idempotencyKey: key,
            })
          }
          label="Registrar vacante"
          onDone={onDone}
        />
      )}
    </QueryState>
  );
}

export function CloseVacancy({ vacancy }: { readonly vacancy: Vacancy }): JSX.Element {
  const api = useApiClient();
  return (
    <NewRecord
      allowed={vacancy.status === 'open'}
      label={`Cerrar ${vacancy.code}`}
      title="Cerrar vacante"
      description="Elija si el proceso finalizó o se canceló."
    >
      {(close) => (
        <HrForm
          fields={[
            {
              key: 'outcome',
              label: 'Resultado',
              value: 'closed',
              options: [
                { value: 'closed', label: 'Cerrada' },
                { value: 'cancelled', label: 'Cancelada' },
              ],
            },
            { key: 'closed_on', label: 'Fecha de cierre', type: 'date', value: bogotaToday() },
            { key: 'note', label: 'Motivo del cierre' },
          ]}
          schema={closeVacancySchema}
          run={(body, csrfToken) =>
            api.post(`/v1/hr/vacancies/${vacancy.id}/actions/close`, {
              body,
              csrfToken,
              version: vacancy.version,
            })
          }
          label="Guardar cierre"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}
