'use client';

import { createdResponseSchema, type PartyConsent, type PartyDetail } from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { useCatalog } from '../organization/queries';
import { RecordDialog } from '../organization/record-dialog';
import { ConsentFields } from '../privacy/consent-fields';
import {
  EMPTY_CONSENT,
  consentBody,
  consentErrors,
  type ConsentErrors,
  type ConsentValues,
} from '../privacy/consent-values';
import {
  CHANNEL_LABELS,
  CONSENT_STATUS_LABELS,
  CONSENT_STATUS_TONES,
  purposeLabel,
} from '../privacy/labels';
import { usePermissions } from '../session/permissions';
import { PARTY_KEYS, useAuthorizationNotices } from './queries';

// Autorizaciones de tratamiento de una persona en su ficha (B17): cuál texto y versión aceptó,
// para qué, cómo y cuándo. Quien edita terceros registra una nueva, por ejemplo para otra finalidad.

function ConsentItem({ consent }: { readonly consent: PartyConsent }): JSX.Element {
  const catalog = useCatalog('personal_data_purposes').data?.items ?? [];
  const purposes = consent.purposes.map((code) => purposeLabel(catalog, code)).join(', ');
  return (
    <li className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {consent.notice.label}, versión {consent.notice.version_number}
        </span>
        <Badge tone={CONSENT_STATUS_TONES[consent.status]}>
          {CONSENT_STATUS_LABELS[consent.status]}
        </Badge>
      </div>
      <span className="text-muted-foreground">
        {purposes} · {CHANNEL_LABELS[consent.channel]} · {formatDate(consent.granted_on)}
      </span>
    </li>
  );
}

function useGrant(partyId: string, onDone: () => void) {
  const api = useApiClient();
  return useAdminAction<ConsentValues, string>({
    run: async (values, csrfToken) => {
      const created = await api.post(`/v1/parties/${partyId}/consents`, {
        body: consentBody(values),
        schema: createdResponseSchema,
        csrfToken,
      });
      return created.id;
    },
    invalidate: [PARTY_KEYS.all],
    onSuccess: onDone,
    reason: 'Las autorizaciones quedan en la auditoría.',
  });
}

function GrantForm(props: { readonly partyId: string; readonly onDone: () => void }) {
  const notices = useAuthorizationNotices(true);
  const [values, setValues] = useState<ConsentValues>(EMPTY_CONSENT);
  const [errors, setErrors] = useState<ConsentErrors>({});
  const grant = useGrant(props.partyId, props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = consentErrors(values);
    setErrors(found);
    if (Object.keys(found).length === 0) grant.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {grant.error === null ? null : <FormError error={grant.error} />}
      <ConsentFields
        idPrefix="nueva-autorizacion"
        notices={notices.data?.data ?? []}
        values={values}
        errors={errors}
        onChange={setValues}
      />
      <SubmitButton label="Registrar" pendingLabel="Registrando…" pending={grant.pending} />
      {grant.dialog}
    </form>
  );
}

export function AuthorizationsCard({ party }: { readonly party: PartyDetail }): JSX.Element {
  const canUpdate = usePermissions().can('party.update');
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Autorizaciones de tratamiento</CardTitle>
        {canUpdate ? (
          <RecordDialog
            triggerLabel="Registrar autorización"
            variant="outline"
            title={`Autorización de ${party.name}`}
            description="Con el texto vigente. Queda registrada con su versión y en la auditoría."
          >
            {(close) => <GrantForm partyId={party.id} onDone={close} />}
          </RecordDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {party.authorizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta persona todavía no tiene autorizaciones registradas.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {party.authorizations.map((consent) => (
              <ConsentItem key={consent.id} consent={consent} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
