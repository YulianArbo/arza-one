'use client';

import {
  campaignChannelSchema,
  campaignRequestSchema,
  createdResponseSchema,
  type Campaign,
} from '@arza/contracts';
import { DialogFooter, EmptyState, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Megaphone } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useCrmAction } from './crm-action';
import { CAMPAIGN_CHANNELS, formatPesos, optionsOf } from './labels';
import { useCampaigns } from './queries';
import { TextFields, type TextFieldSpec } from './text-fields';

// Campañas (B22): de dónde llegan los prospectos. Las administra quien edita prospectos.

const CHANNEL_OPTIONS = optionsOf(campaignChannelSchema.options, CAMPAIGN_CHANNELS);

interface CampaignValues {
  readonly name: string;
  readonly channel: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly budget: string;
}

function valuesOf(campaign: Campaign | null): CampaignValues {
  return {
    name: campaign?.name ?? '',
    channel: campaign?.channel ?? 'email',
    startsOn: campaign?.starts_on ?? '',
    endsOn: campaign?.ends_on ?? '',
    budget: campaign?.budget ?? '',
  };
}

function bodyOf(values: CampaignValues) {
  return {
    name: values.name.trim(),
    channel: values.channel,
    starts_on: values.startsOn,
    ends_on: values.endsOn === '' ? null : values.endsOn,
    budget: values.budget.trim() === '' ? null : values.budget.trim(),
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  name: 'Escriba al menos tres letras.',
  starts_on: 'Elija el primer día.',
  budget: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
};

function problemsOf(values: CampaignValues): Record<string, string> {
  const result = campaignRequestSchema.safeParse(bodyOf(values));
  if (result.success) return {};
  const problems: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??=
      issue.code === 'custom' ? issue.message : (MESSAGES[field] ?? 'Revise este dato.');
  }
  return problems;
}

const NAME_FIELD: readonly TextFieldSpec<keyof CampaignValues>[] = [
  { key: 'name', field: 'name', id: 'campana-nombre', label: 'Nombre' },
];

const DETAIL_FIELDS: readonly TextFieldSpec<keyof CampaignValues>[] = [
  { key: 'startsOn', field: 'starts_on', id: 'campana-inicio', label: 'Primer día', type: 'date' },
  {
    key: 'endsOn',
    field: 'ends_on',
    id: 'campana-fin',
    label: 'Último día (opcional)',
    type: 'date',
  },
  {
    key: 'budget',
    field: 'budget',
    id: 'campana-presupuesto',
    label: 'Presupuesto en pesos (opcional)',
    decimal: true,
  },
];

function useCampaignForm(campaign: Campaign | null, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState(valuesOf(campaign));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useCrmAction<CampaignValues>(async (current, csrfToken) => {
    const body = bodyOf(current);
    if (campaign === null) {
      await api.post('/v1/crm/campaigns', { body, schema: createdResponseSchema, csrfToken });
      return;
    }
    const path = `/v1/crm/campaigns/${campaign.id}`;
    await api.put(path, { body, version: campaign.version, csrfToken });
  }, onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(values);
  };
  const set = (key: keyof CampaignValues, text: string): void => {
    setValues({ ...values, [key]: text });
  };
  return { values, problems, save, submit, set };
}

function CampaignForm(props: {
  readonly campaign: Campaign | null;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useCampaignForm(props.campaign, props.onDone);
  const fields = { values: form.values, problems: form.problems, onChange: form.set };
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <FormSummary problems={form.problems} fields={[...NAME_FIELD, ...DETAIL_FIELDS]} />
      <TextFields specs={NAME_FIELD} {...fields} />
      <SelectField
        id="campana-canal"
        label="Canal"
        options={CHANNEL_OPTIONS}
        value={form.values.channel}
        onChange={(event) => {
          form.set('channel', event.target.value);
        }}
      />
      <TextFields specs={DETAIL_FIELDS} {...fields} />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={form.save.pending} />
      </DialogFooter>
      {form.save.dialog}
    </form>
  );
}

function CampaignRow(props: { readonly campaign: Campaign; readonly canManage: boolean }) {
  const { campaign } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">{campaign.name}</TableCell>
      <TableCell>{CAMPAIGN_CHANNELS[campaign.channel]}</TableCell>
      <TableCell>
        {formatDate(campaign.starts_on)}
        {campaign.ends_on === null ? ' · sigue' : ` a ${formatDate(campaign.ends_on)}`}
      </TableCell>
      <TableCell className="tabular-nums">{formatPesos(campaign.budget)}</TableCell>
      <TableCell className="tabular-nums">{campaign.leads_count}</TableCell>
      <TableCell>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Editar"
            triggerAriaLabel={`Editar ${campaign.name}`}
            variant="outline"
            title={`Editar ${campaign.name}`}
            description="Los cambios quedan en la auditoría."
          >
            {(close) => <CampaignForm campaign={campaign} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function CampaignsPanel(): JSX.Element {
  const query = useCampaigns();
  const canManage = usePermissions().can('crm.lead.update');
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Crear campaña"
            title="Crear campaña"
            description="Un canal y unas fechas para saber de dónde llegan los prospectos."
          >
            {(close) => <CampaignForm campaign={null} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={query} loadingLabel="Cargando las campañas">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title="Todavía no hay campañas"
              description="Cree una campaña para medir cuántos prospectos trae cada canal."
            />
          ) : (
            <SimpleTable headers={['Campaña', 'Canal', 'Fechas', 'Presupuesto', 'Prospectos', '']}>
              {data.data.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} canManage={canManage} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
