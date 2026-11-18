'use client';

import { extendCandidateRetentionSchema, type Candidate } from '@arza/contracts';
import { Checkbox } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { NewRecord } from '../finance/ledger-ui';
import { HrForm } from './hr-form';

// Banco de hojas de vida (B35, decisión C): quien autorizó conservar su hoja de vida puede quedar
// doce meses más. La eliminación se aplaza, nunca se cancela.

/** Solo una candidatura descartada, con sus datos aún guardados y en el banco de hojas de vida. */
function canExtend(candidate: Candidate): boolean {
  return (
    candidate.stage === 'discarded' &&
    candidate.talent_bank &&
    candidate.erased_at === null &&
    candidate.retention_until !== null
  );
}

/** Casilla del registro: el candidato autorizó conservar su hoja de vida para futuros procesos. */
export function TalentBankField(props: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label htmlFor="hr-talent-bank" className="flex items-start gap-2 text-sm">
      <Checkbox
        id="hr-talent-bank"
        className="mt-0.5"
        checked={props.checked}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      El candidato autorizó conservar su hoja de vida para futuros procesos.
    </label>
  );
}

export function ExtendRetention({ candidate }: { readonly candidate: Candidate }): JSX.Element {
  const api = useApiClient();
  const until = candidate.retention_until;
  return (
    <NewRecord
      allowed={canExtend(candidate)}
      label="Aplazar eliminación"
      title="Aplazar la eliminación de los datos"
      description={`${candidate.name} autorizó conservar su hoja de vida. Hoy sus datos se eliminan el ${until === null ? '' : formatDate(until)}; al confirmar, se eliminarán doce meses después.`}
    >
      {(close) => (
        <HrForm
          fields={[]}
          schema={extendCandidateRetentionSchema}
          run={(body, csrfToken) =>
            api.post(`/v1/hr/candidates/${candidate.id}/actions/extend-retention`, {
              body,
              csrfToken,
              version: candidate.version,
            })
          }
          label="Aplazar doce meses"
          onDone={close}
        />
      )}
    </NewRecord>
  );
}
