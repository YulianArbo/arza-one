'use client';

import {
  NOVELTY_SOURCES,
  NOVELTY_UNITS,
  PAYROLL_PERIOD_STATUS,
  closePayrollPeriodSchema,
  hrCreatedResponseSchema,
  noveltyConceptListResponseSchema,
  payrollPeriodDetailResponseSchema,
  payrollPeriodListResponseSchema,
  registerNoveltySchema,
  type PayrollNovelty,
  type PayrollPeriod,
} from '@arza/contracts';
import { Button, PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { formatPesos } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { useActiveEmployees } from './hr-admin-absences';
import { HrActionButton, HrDialogForm, HrList, HrSection, optionsOf, orNull } from './hr-dialog';
import type { HrField } from './hr-form';
import { useHrAction, useHrQuery } from './hr-queries';

// Novedades de nómina por mes (B36, decisión 6). Talento humano registra las manuales; al cerrar el
// mes ya nada cambia y se descarga el archivo para el software de nómina.

interface Option {
  readonly value: string;
  readonly label: string;
}

function noveltyFields(
  employees: readonly Option[],
  concepts: readonly { readonly code: string; readonly label: string }[],
): HrField[] {
  return [
    { key: 'employee_id', label: 'Colaborador', options: employees },
    {
      key: 'concept',
      label: 'Concepto',
      options: concepts.map(({ code, label }) => ({ value: code, label })),
    },
    { key: 'quantity', label: 'Cantidad', value: '1' },
    { key: 'unit', label: 'Unidad', value: 'units', options: optionsOf(NOVELTY_UNITS) },
    { key: 'amount', label: 'Valor en pesos (opcional)' },
    { key: 'note', label: 'Observación (opcional)' },
  ];
}

function RegisterNovelty({ period }: { readonly period: string }): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useActiveEmployees();
  const concepts = useHrQuery(
    '/v1/hr/payroll-novelties/concepts',
    noveltyConceptListResponseSchema,
  );
  const manual = (concepts.data?.data ?? []).filter((concept) => !concept.automatic);
  return (
    <HrDialogForm
      allowed
      label="Registrar novedad"
      title={`Registrar una novedad del mes ${period}`}
      description="Bonificaciones, auxilios, descuentos, ingresos y otras. Las ausencias y horas extras llegan solas."
      fields={noveltyFields(employees, manual)}
      schema={registerNoveltySchema}
      prepare={(values) => ({
        ...values,
        period,
        amount: orNull(values['amount']?.replace(',', '.')),
        note: orNull(values['note']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/payroll-novelties', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Registrar"
    />
  );
}

function ExportButton({ period }: { readonly period: string }): JSX.Element {
  const api = useApiClient();
  const action = useHrAction<undefined, DownloadedFile>(
    (_input, csrfToken) =>
      api.download(`/v1/hr/payroll-novelties/periods/${period}/export`, { body: {}, csrfToken }),
    save,
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? 'Descargando…' : `Descargar archivo de ${period}`}
      </Button>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function PeriodActions({ summary }: { readonly summary: PayrollPeriod }): JSX.Element {
  const api = useApiClient();
  const { can } = usePermissions();
  if (summary.status === 'closed') return <ExportButton period={summary.period} />;
  return (
    <div className="flex flex-wrap gap-2">
      {can('hr.payroll_novelty.manage') ? <RegisterNovelty period={summary.period} /> : null}
      <HrDialogForm
        allowed
        label="Cerrar el mes"
        title={`Cerrar el mes ${summary.period}`}
        description="Después de cerrarlo ninguna novedad cambia; lo que llegue tarde irá al mes siguiente."
        fields={[]}
        schema={closePayrollPeriodSchema}
        prepare={() => ({ period: summary.period, confirm: true })}
        run={(body, csrfToken) =>
          api.post('/v1/hr/payroll-novelties/close-period', { body, csrfToken })
        }
        submitLabel="Cerrar definitivamente"
      />
    </div>
  );
}

function NoveltyRow(props: { readonly item: PayrollNovelty; readonly open: boolean }): JSX.Element {
  const api = useApiClient();
  const { item } = props;
  return (
    <>
      <span>
        <strong>{item.employee.name}</strong> · {item.concept_label} ·{' '}
        {item.quantity.replace('.', ',')} {NOVELTY_UNITS[item.unit].toLowerCase()}
        {item.amount === null ? null : ` · ${formatPesos(item.amount)}`}
      </span>
      <span>{NOVELTY_SOURCES[item.source]}</span>
      {item.source === 'manual' && props.open ? (
        <HrActionButton
          label="Retirar"
          pendingLabel="Retirando…"
          ariaLabel={`Retirar ${item.concept_label} de ${item.employee.name}`}
          run={(csrfToken) =>
            api.post(`/v1/hr/payroll-novelties/${item.id}/actions/withdraw`, {
              body: {},
              csrfToken,
              version: item.version,
            })
          }
        />
      ) : null}
    </>
  );
}

function PeriodDetail({ period }: { readonly period: string }): JSX.Element {
  const query = useHrQuery(
    `/v1/hr/payroll-novelties/periods/${period}`,
    payrollPeriodDetailResponseSchema,
  );
  return (
    <QueryState query={query} loadingLabel="Cargando novedades">
      {({ period: summary, data }) => (
        <div className="space-y-3">
          <p>
            Mes {summary.period} · {PAYROLL_PERIOD_STATUS[summary.status]}
            {summary.closed_on === null ? null : ` el ${formatDate(summary.closed_on)}`}
          </p>
          <PeriodActions summary={summary} />
          <HrList
            items={data}
            empty="Este mes no tiene novedades."
            keyOf={(item) => item.id}
            render={(item) => <NoveltyRow item={item} open={summary.status === 'open'} />}
          />
        </div>
      )}
    </QueryState>
  );
}

export function PayrollAdmin(): JSX.Element {
  const query = useHrQuery('/v1/hr/payroll-novelties/periods', payrollPeriodListResponseSchema);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Novedades de nómina"
        description="La liquidación se hace en el software de nómina."
      />
      <HrSection id="meses" title="Meses">
        <QueryState query={query} loadingLabel="Cargando meses">
          {({ data }) => (
            <div className="flex flex-wrap gap-2">
              {data.map((summary) => (
                <Button
                  key={summary.period}
                  type="button"
                  variant={summary.period === (selected ?? data[0]?.period) ? 'primary' : 'outline'}
                  onClick={() => {
                    setSelected(summary.period);
                  }}
                >
                  {summary.period} · {PAYROLL_PERIOD_STATUS[summary.status]} (
                  {String(summary.novelties)})
                </Button>
              ))}
            </div>
          )}
        </QueryState>
      </HrSection>
      {(selected ?? query.data?.data[0]?.period) === undefined ? null : (
        <PeriodDetail period={selected ?? query.data?.data[0]?.period ?? ''} />
      )}
    </div>
  );
}
