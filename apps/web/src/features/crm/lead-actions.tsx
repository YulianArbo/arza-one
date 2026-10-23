'use client';

import type { LeadDetail } from '@arza/contracts';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ConvertForm } from './convert-form';
import { useCrmAction } from './crm-action';
import { ReasonForm } from './reason-form';

// Acciones del prospecto (B22, ficha 17.6): nuevo → calificado → convertido o descartado. Solo se
// ofrecen las que el estado y los permisos permiten; la API lo vuelve a revisar.

function DiscardDialog({ lead }: { readonly lead: LeadDetail }): JSX.Element {
  const api = useApiClient();
  return (
    <RecordDialog
      triggerLabel="Descartar"
      variant="outline"
      title={`Descartar a ${lead.person.name}`}
      description="Un prospecto descartado ya no cambia. El motivo queda en el informe y en la auditoría."
    >
      {(close) => (
        <ReasonForm
          catalog="crm_discard_reasons"
          idPrefix="descarte"
          label="Motivo del descarte"
          missing="Elija el motivo del descarte."
          submitLabel="Descartar"
          run={(body, csrfToken) =>
            api.post(`/v1/crm/leads/${lead.id}/actions/discard`, {
              body,
              version: lead.version,
              csrfToken,
            })
          }
          onDone={close}
        />
      )}
    </RecordDialog>
  );
}

function QualifyButton({ lead }: { readonly lead: LeadDetail }): JSX.Element {
  const api = useApiClient();
  const qualify = useCrmAction<undefined>((_args, csrfToken) =>
    api.post(`/v1/crm/leads/${lead.id}/actions/qualify`, {
      body: {},
      version: lead.version,
      csrfToken,
    }),
  );
  return (
    <>
      <ConfirmActionButton
        label="Calificar"
        title={`¿Calificar a ${lead.person.name}?`}
        description="Confirma que es un cliente potencial. Se cierra la tarea «Contactar al prospecto»."
        confirmLabel="Sí, calificar"
        disabled={qualify.pending}
        onConfirm={() => {
          qualify.execute(undefined);
        }}
      />
      {qualify.error === null ? null : <FormError error={qualify.error} />}
      {qualify.dialog}
    </>
  );
}

export function LeadActions({ lead }: { readonly lead: LeadDetail }): JSX.Element | null {
  const { can } = usePermissions();
  if (lead.status !== 'new' && lead.status !== 'qualified') return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lead.status === 'qualified' && can('crm.lead.convert') ? (
        <RecordDialog
          triggerLabel="Convertir en oportunidad"
          title={`Convertir ${lead.code} en oportunidad`}
          description="Nace la oportunidad en Prospección y el prospecto queda cerrado como convertido."
        >
          {() => <ConvertForm lead={lead} />}
        </RecordDialog>
      ) : null}
      {lead.status === 'new' && can('crm.lead.update') ? <QualifyButton lead={lead} /> : null}
      {can('crm.lead.update') ? <DiscardDialog lead={lead} /> : null}
    </div>
  );
}
