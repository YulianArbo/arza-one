'use client';

import {
  consentStatusSchema,
  type Consent,
  type ConsentListResponse,
  type ConsentStatus,
} from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { Pager, useCursorTrail } from '../administration/pager';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { useCatalog } from '../organization/queries';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { partyPath } from '../parties/labels';
import { usePermissions } from '../session/permissions';
import {
  CHANNEL_LABELS,
  CONSENT_STATUS_LABELS,
  CONSENT_STATUS_TONES,
  SOURCE_LABELS,
  purposeLabel,
} from './labels';
import { useConsents, useRevokeConsent } from './queries';

// Privacidad › Autorizaciones (B17): cada autorización con el texto y la versión que se aceptó,
// su evidencia y su revocatoria. Se toman en los formularios; aquí se consultan.

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  ...consentStatusSchema.options.map((value) => ({ value, label: CONSENT_STATUS_LABELS[value] })),
];

function Evidence({ consent }: { readonly consent: Consent }): JSX.Element {
  const rows: [string, string][] = [
    ['Texto aceptado', `${consent.notice.label}, versión ${String(consent.notice.version_number)}`],
    ['Título', consent.notice.title],
    ['Origen', SOURCE_LABELS[consent.source] ?? consent.source],
    ['Registró', consent.evidence.recorded_by ?? 'El sistema'],
    ['Registrada el', formatDateTime(consent.evidence.recorded_at)],
    ['Dirección IP', consent.evidence.ip_address ?? '—'],
    ['Navegador', consent.evidence.user_agent ?? '—'],
  ];
  if (consent.revoked_at !== null) {
    rows.push(['Revocada el', formatDateTime(consent.revoked_at)]);
    rows.push(['Motivo', consent.revocation_reason ?? '—']);
  }
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RevokeForm(props: { readonly consent: Consent; readonly onDone: () => void }) {
  const [reason, setReason] = useState('');
  const revoke = useRevokeConsent(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    revoke.execute({ id: props.consent.id, reason });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3 border-t pt-3">
      {revoke.error === null ? null : <FormError error={revoke.error} />}
      <TextInput
        id={`revocar-${props.consent.id}`}
        label="Motivo de la revocatoria"
        hint="Por ejemplo: «El titular lo pidió por correo el 16/10/2026». La autorización no se borra."
        value={reason}
        maxLength={500}
        onValue={setReason}
      />
      <SubmitButton label="Revocar" pendingLabel="Revocando…" pending={revoke.pending} />
      {revoke.dialog}
    </form>
  );
}

/** Ventana con la prueba de la autorización y, si se puede, su revocatoria. */
function EvidenceDialog(props: { readonly consent: Consent; readonly holder: string }) {
  const canRevoke = usePermissions().can('privacy.request.manage');
  const { consent, holder } = props;
  return (
    <RecordDialog
      triggerLabel="Ver evidencia"
      triggerAriaLabel={`Ver la evidencia de la autorización de ${holder}`}
      variant="outline"
      title={`Autorización de ${holder}`}
      description="Prueba de la autorización (Ley 1581 de 2012, art. 9)."
    >
      {(close) => (
        <div className="flex flex-col gap-4">
          <Evidence consent={consent} />
          {canRevoke && consent.status === 'active' ? (
            <RevokeForm consent={consent} onDone={close} />
          ) : null}
        </div>
      )}
    </RecordDialog>
  );
}

function ConsentRow({ consent }: { readonly consent: Consent }): JSX.Element {
  const catalog = useCatalog('personal_data_purposes').data?.items ?? [];
  const holder = consent.party.name ?? 'Titular retirado';
  return (
    <TableRow>
      <TableCell>
        <Link
          href={partyPath(consent.party.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {holder}
        </Link>
      </TableCell>
      <TableCell>
        {consent.notice.label}, v{consent.notice.version_number}
      </TableCell>
      <TableCell>
        {consent.purposes.map((code) => purposeLabel(catalog, code)).join(', ')}
      </TableCell>
      <TableCell>
        {CHANNEL_LABELS[consent.channel]}, {formatDate(consent.granted_on)}
      </TableCell>
      <TableCell>
        <Badge tone={CONSENT_STATUS_TONES[consent.status]}>
          {CONSENT_STATUS_LABELS[consent.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <EvidenceDialog consent={consent} holder={holder} />
      </TableCell>
    </TableRow>
  );
}

const HEADERS = ['Titular', 'Texto aceptado', 'Finalidades', 'Cómo y cuándo', 'Estado', ''];

type PagerControls = ReturnType<typeof useCursorTrail>['pager'];

function ConsentPage(props: { readonly page: ConsentListResponse; readonly pager: PagerControls }) {
  if (props.page.data.length === 0) {
    return (
      <EmptyState
        title="No hay autorizaciones"
        description="Se registran al guardar los formularios con datos personales."
      />
    );
  }
  return (
    <>
      <SimpleTable
        caption="Autorizaciones de tratamiento, las más recientes primero"
        headers={HEADERS}
      >
        {props.page.data.map((consent) => (
          <ConsentRow key={consent.id} consent={consent} />
        ))}
      </SimpleTable>
      <Pager page={props.page} {...props.pager} />
    </>
  );
}

export function ConsentsPanel(): JSX.Element {
  const [status, setStatus] = useState<ConsentStatus | ''>('');
  const trail = useCursorTrail();
  const consents = useConsents(status, trail.cursor);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <SelectField
          id="autorizaciones-estado"
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => {
            const parsed = consentStatusSchema.safeParse(event.target.value);
            setStatus(parsed.success ? parsed.data : '');
            trail.reset();
          }}
        />
      </div>
      <QueryState query={consents} loadingLabel="Cargando las autorizaciones">
        {(page) => <ConsentPage page={page} pager={trail.pager} />}
      </QueryState>
    </div>
  );
}
