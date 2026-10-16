'use client';

import { consentChannelSchema, type Notice } from '@arza/contracts';
import { Alert, AlertDescription, AlertTitle } from '@arza/ui';
import { CircleAlert } from 'lucide-react';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { SelectField } from '../administration/select-field';
import { useFiles } from '../files/queries';
import { useCatalog } from '../organization/queries';
import { CheckboxField, TextInput } from '../organization/record-dialog';
import { CHANNEL_LABELS, purposeLabel } from './labels';
import type { ConsentErrors, ConsentValues } from './consent-values';

// Componente de autorización reutilizable (B17; Ley 1581 de 2012, art. 9): todo formulario con
// datos personales lo incluye. Muestra el texto vigente y su versión, las finalidades que ofrece
// (sin marcar), cómo y cuándo se obtuvo, y la casilla de autorización, que nunca viene marcada.

interface ConsentFieldsProps {
  /** Textos de autorización publicados que puede usar este formulario. */
  readonly notices: readonly Notice[];
  readonly values: ConsentValues;
  readonly errors: ConsentErrors;
  readonly onChange: (values: ConsentValues) => void;
  /** Prefijo de los identificadores, por si hay dos formularios en la misma página. */
  readonly idPrefix: string;
}

const CHANNEL_OPTIONS = [
  { value: '', label: 'Elija cómo se obtuvo' },
  ...consentChannelSchema.options.map((value) => ({ value, label: CHANNEL_LABELS[value] })),
];

function NoNotice(): JSX.Element {
  return (
    <Alert tone="warning" role="status">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>No hay un texto de autorización publicado</AlertTitle>
      <AlertDescription>
        Pida al Oficial de Protección de Datos que lo publique en Privacidad › Avisos y versiones.
        Mientras tanto no se pueden registrar datos personales.
      </AlertDescription>
    </Alert>
  );
}

function NoticeText({ notice, id }: { readonly notice: Notice; readonly id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {notice.label} · versión {notice.version_number} · rige desde el{' '}
        {formatDate(notice.effective_from)}
      </p>
      <div
        id={id}
        role="region"
        aria-label={`Texto de la autorización: ${notice.title}`}
        className="whitespace-pre-line rounded-md border bg-muted/40 p-3 text-sm"
      >
        <p className="mb-2 font-medium">{notice.title}</p>
        {notice.body}
      </div>
    </div>
  );
}

function PurposeChoices(props: ConsentFieldsProps & { readonly notice: Notice }): JSX.Element {
  const catalog = useCatalog('personal_data_purposes').data?.items ?? [];
  const { values, onChange, notice, idPrefix } = props;
  const error = props.errors['purposes'];
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error === undefined ? undefined : `${idPrefix}-finalidades-error`}
    >
      <legend className="mb-1 text-sm font-medium">Finalidades que autoriza</legend>
      {notice.purposes.map((code) => (
        <CheckboxField
          key={code}
          id={`${idPrefix}-finalidad-${code}`}
          label={purposeLabel(catalog, code)}
          checked={values.purposes.includes(code)}
          onChange={(checked) => {
            const purposes = checked
              ? [...values.purposes, code]
              : values.purposes.filter((item) => item !== code);
            onChange({ ...values, purposes });
          }}
        />
      ))}
      {error === undefined ? null : (
        <p id={`${idPrefix}-finalidades-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function HowAndWhen(props: ConsentFieldsProps): JSX.Element {
  const { values, errors, onChange, idPrefix } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        id={`${idPrefix}-canal`}
        label="Cómo se obtuvo"
        options={CHANNEL_OPTIONS}
        value={values.channel}
        error={errors['channel']}
        onChange={(event) => {
          const channel = consentChannelSchema.safeParse(event.target.value);
          onChange({ ...values, channel: channel.success ? channel.data : '' });
        }}
      />
      <TextInput
        id={`${idPrefix}-fecha`}
        label="Fecha de la autorización"
        type="date"
        value={values.grantedOn}
        error={errors['granted_on'] ?? null}
        onValue={(grantedOn) => {
          onChange({ ...values, grantedOn });
        }}
      />
    </div>
  );
}

/** Soporte opcional, como el documento firmado escaneado: un archivo propio ya revisado. */
function EvidenceField(props: ConsentFieldsProps): JSX.Element {
  const files = (useFiles().data?.data ?? []).filter((file) => file.status === 'available');
  const { values, onChange, idPrefix } = props;
  return (
    <SelectField
      id={`${idPrefix}-soporte`}
      label="Soporte (opcional)"
      hint="Por ejemplo, el documento firmado escaneado. Súbalo antes en Archivos."
      options={[
        { value: '', label: 'Sin soporte' },
        ...files.map((file) => ({ value: file.id, label: file.file_name })),
      ]}
      value={values.evidenceFileId}
      error={props.errors['evidence_file_id']}
      onChange={(event) => {
        onChange({ ...values, evidenceFileId: event.target.value });
      }}
    />
  );
}

function AcceptBox(props: ConsentFieldsProps): JSX.Element {
  const { values, errors, onChange, idPrefix } = props;
  const error = errors['accepted'];
  return (
    <div className="flex flex-col gap-1">
      <CheckboxField
        id={`${idPrefix}-acepta`}
        label="La persona autorizó el tratamiento de sus datos personales según este texto"
        hint="Marque la casilla solo si tiene la autorización. Queda registrada con la versión del texto, la fecha, quién la registró y desde dónde."
        checked={values.accepted}
        onChange={(accepted) => {
          onChange({ ...values, accepted });
        }}
      />
      {error === undefined ? null : (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Qué texto conoció la persona; al cambiarlo se quitan las finalidades que el nuevo no ofrece. */
function NoticeChooser(props: ConsentFieldsProps): JSX.Element {
  const { notices, values, errors, onChange, idPrefix } = props;
  const options = [
    { value: '', label: 'Elija el texto de autorización' },
    ...notices.map((item) => ({
      value: item.id,
      label: `${item.label} (versión ${String(item.version_number)})`,
    })),
  ];
  return (
    <SelectField
      id={`${idPrefix}-texto`}
      label="Texto de autorización"
      options={options}
      value={values.noticeId}
      error={errors['notice_id']}
      onChange={(event) => {
        const next = notices.find((item) => item.id === event.target.value);
        const purposes = values.purposes.filter((code) => next?.purposes.includes(code));
        onChange({ ...values, noticeId: event.target.value, purposes });
      }}
    />
  );
}

export function ConsentFields(props: ConsentFieldsProps): JSX.Element {
  const { notices, values, idPrefix } = props;
  const notice = notices.find((candidate) => candidate.id === values.noticeId);
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Autorización de tratamiento de datos</legend>
      {notices.length === 0 ? (
        <NoNotice />
      ) : (
        <>
          <NoticeChooser {...props} />
          {notice === undefined ? null : (
            <>
              <NoticeText notice={notice} id={`${idPrefix}-texto-completo`} />
              <PurposeChoices {...props} notice={notice} />
            </>
          )}
          <HowAndWhen {...props} />
          <EvidenceField {...props} />
          <AcceptBox {...props} />
        </>
      )}
    </fieldset>
  );
}
