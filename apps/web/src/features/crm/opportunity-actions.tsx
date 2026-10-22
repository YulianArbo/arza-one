'use client';

import { OPEN_STAGES, isOpenStage, type OpenStage, type OpportunityDetail } from '@arza/contracts';
import { SelectField } from '@arza/ui';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useCrmAction } from './crm-action';
import { OPPORTUNITY_STAGES, optionsOf } from './labels';
import { ReasonForm } from './reason-form';

// Acciones de la oportunidad (B22, ficha 17.6): cambiar de etapa, ganarla o perderla con su
// motivo. Ganada o perdida ya no cambia; la API y la base de datos lo vuelven a revisar.

interface Props {
  readonly opportunity: OpportunityDetail;
}

const STAGE_CHOICES = optionsOf(OPEN_STAGES, OPPORTUNITY_STAGES);

function StageSelect({ opportunity }: Props): JSX.Element {
  const api = useApiClient();
  const move = useCrmAction<OpenStage>((stage, csrfToken) =>
    api.post(`/v1/crm/opportunities/${opportunity.id}/actions/move`, {
      body: { stage, probability: null },
      version: opportunity.version,
      csrfToken,
    }),
  );
  return (
    <div className="flex flex-col gap-1">
      <SelectField
        id="oportunidad-etapa"
        label="Etapa"
        hint="Al cambiarla, la probabilidad toma la de la etapa."
        options={STAGE_CHOICES}
        value={opportunity.stage}
        disabled={move.pending}
        onChange={(event) => {
          const next = OPEN_STAGES.find((stage) => stage === event.target.value);
          if (next !== undefined && next !== opportunity.stage) move.execute(next);
        }}
      />
      {move.error === null ? null : <FormError error={move.error} />}
      {move.dialog}
    </div>
  );
}

function WinButton({ opportunity }: Props): JSX.Element {
  const api = useApiClient();
  const win = useCrmAction<undefined>((_args, csrfToken) =>
    api.post(`/v1/crm/opportunities/${opportunity.id}/actions/win`, {
      body: {},
      version: opportunity.version,
      csrfToken,
    }),
  );
  return (
    <>
      <ConfirmActionButton
        label="Marcar ganada"
        title={`¿Ganó ${opportunity.code}?`}
        description={`${opportunity.party.name} quedará como cliente activo en Terceros. Debe tener su documento registrado.`}
        confirmLabel="Sí, ganada"
        disabled={win.pending}
        onConfirm={() => {
          win.execute(undefined);
        }}
      />
      {win.error === null ? null : <FormError error={win.error} />}
      {win.dialog}
    </>
  );
}

function LoseDialog({ opportunity }: Props): JSX.Element {
  const api = useApiClient();
  return (
    <RecordDialog
      triggerLabel="Marcar perdida"
      variant="outline"
      title={`Marcar perdida ${opportunity.code}`}
      description="Una oportunidad perdida exige el motivo y ya no cambia."
    >
      {(close) => (
        <ReasonForm
          catalog="crm_lost_reasons"
          idPrefix="perdida"
          label="Motivo de pérdida"
          missing="Elija el motivo: perder una oportunidad exige el motivo."
          submitLabel="Marcar perdida"
          run={(body, csrfToken) =>
            api.post(`/v1/crm/opportunities/${opportunity.id}/actions/lose`, {
              body,
              version: opportunity.version,
              csrfToken,
            })
          }
          onDone={close}
        />
      )}
    </RecordDialog>
  );
}

export function OpportunityActions({ opportunity }: Props): JSX.Element | null {
  const { can } = usePermissions();
  if (!isOpenStage(opportunity.stage)) return null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {can('crm.opportunity.update') ? <StageSelect opportunity={opportunity} /> : null}
      {can('crm.opportunity.close') ? <WinButton opportunity={opportunity} /> : null}
      {can('crm.opportunity.close') ? <LoseDialog opportunity={opportunity} /> : null}
    </div>
  );
}
