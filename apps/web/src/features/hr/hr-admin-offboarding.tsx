'use client';

import {
  OFFBOARDING_REASONS,
  OFFBOARDING_STATUS,
  cancelOffboardingSchema,
  hrCreatedResponseSchema,
  offboardingListResponseSchema,
  startOffboardingSchema,
  type Offboarding,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { useActiveEmployees } from './hr-admin-absences';
import { HrActionButton, HrDialogForm, HrList, HrSection, optionsOf, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';

// Retiro y paz y salvo (B36, decisiones 9 y 10). La cuenta se desactiva sola al terminar el último
// día laborado; los activos por devolver vienen de Activos. Cada responsable marca su ítem desde
// «Mi espacio»; Talento humano emite el paz y salvo con todo completo.

function StartOffboarding(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useActiveEmployees();
  return (
    <HrDialogForm
      allowed
      label="Registrar retiro"
      title="Registrar el retiro de un colaborador"
      description="Si el último día ya pasó, la cuenta se desactiva de inmediato."
      fields={[
        { key: 'employee_id', label: 'Colaborador', options: employees },
        { key: 'reason', label: 'Motivo', options: optionsOf(OFFBOARDING_REASONS) },
        { key: 'last_day', label: 'Último día laborado', type: 'date', value: bogotaToday() },
        { key: 'note', label: 'Observación (opcional)' },
      ]}
      schema={startOffboardingSchema}
      prepare={(values) => ({ ...values, note: orNull(values['note']) })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/offboardings', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Registrar retiro"
    />
  );
}

function Checklist({ item }: { readonly item: Offboarding }): JSX.Element {
  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="list-disc pl-6">
        {item.checklist.map((entry) => (
          <li key={entry.item}>
            {entry.label} · {entry.responsible?.name ?? 'Sin responsable'} ·{' '}
            {entry.done_on === null ? 'Pendiente' : `Hecho el ${formatDate(entry.done_on)}`}
          </li>
        ))}
      </ul>
      {item.assets.length === 0 ? (
        <p>No tiene activos por devolver.</p>
      ) : (
        <p>
          Activos por devolver:{' '}
          {item.assets.map((asset) => `${asset.code} ${asset.name}`).join(' · ')}. Regístrelos como
          devueltos en Compras › Activos.
        </p>
      )}
      <p>
        {item.account_deactivated_at === null
          ? `La cuenta se desactivará al terminar el ${formatDate(item.last_day)}.`
          : `Cuenta desactivada el ${formatDateTime(item.account_deactivated_at)}.`}
      </p>
    </div>
  );
}

function OffboardingActions({ item }: { readonly item: Offboarding }): JSX.Element | null {
  const api = useApiClient();
  if (item.status !== 'in_progress') return null;
  const path = `/v1/hr/offboardings/${item.id}/actions`;
  return (
    <div className="flex flex-wrap gap-2">
      {item.can_clear ? (
        <HrActionButton
          label="Emitir paz y salvo"
          pendingLabel="Emitiendo…"
          ariaLabel={`Emitir el paz y salvo de ${item.employee.name}`}
          run={(csrfToken) =>
            api.post(`${path}/clear`, { body: {}, csrfToken, version: item.version })
          }
        />
      ) : null}
      <HrDialogForm
        allowed={item.account_deactivated_at === null}
        label="Anular retiro"
        title={`Anular el retiro de ${item.employee.name}`}
        description="Solo mientras la cuenta sigue activa."
        fields={[{ key: 'reason', label: 'Motivo' }]}
        schema={cancelOffboardingSchema}
        run={(body, csrfToken) =>
          api.post(`${path}/cancel`, { body, csrfToken, version: item.version })
        }
        submitLabel="Anular"
      />
    </div>
  );
}

export function OffboardingAdmin(): JSX.Element {
  const query = useHrQuery('/v1/hr/offboardings', offboardingListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Retiros y paz y salvo" />
      <HrSection id="retiros" title="Retiros">
        <StartOffboarding />
        <QueryState query={query} loadingLabel="Cargando retiros">
          {({ data }) => (
            <HrList
              items={data}
              empty="No hay retiros registrados."
              keyOf={(item) => item.id}
              render={(item) => (
                <>
                  <span>
                    <strong>{item.employee.name}</strong> · {OFFBOARDING_REASONS[item.reason]} ·
                    último día {formatDate(item.last_day)}
                  </span>
                  <span>
                    {OFFBOARDING_STATUS[item.status]}
                    {item.cleared_on === null ? null : ` el ${formatDate(item.cleared_on)}`}
                  </span>
                  <Checklist item={item} />
                  <OffboardingActions item={item} />
                </>
              )}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
