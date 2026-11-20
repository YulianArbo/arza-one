'use client';

import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LIMITS,
  announcementAudienceSchema,
  announcementRequestSchema,
  type Announcement,
  type AnnouncementAudience,
} from '@arza/contracts';
import { DialogFooter, FormField, SelectField, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { bogotaToday } from '../crm/labels';
import { problemsOf } from '../finance/ledger-ui';
import { AnnouncementImagePicker } from './announcement-image-picker';
import { useSaveAnnouncement } from './announcement-save';

// Formulario de un comunicado del acceso (B36A): título, texto, para quién, vigencia, enlace e
// imagen opcionales. Lo que se publica es público: nunca información confidencial.

interface AnnouncementValues {
  readonly title: string;
  readonly body: string;
  readonly audience: AnnouncementAudience;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly link_url: string;
  readonly image_file_id: string | null;
}

const FIELDS = [
  { field: 'title', id: 'comunicado-titulo', label: 'Título' },
  { field: 'body', id: 'comunicado-texto', label: 'Texto' },
  { field: 'audience', id: 'comunicado-publico', label: 'Para quién' },
  { field: 'starts_on', id: 'comunicado-inicio', label: 'Desde' },
  { field: 'ends_on', id: 'comunicado-fin', label: 'Hasta' },
  { field: 'link_url', id: 'comunicado-enlace', label: 'Enlace (opcional)' },
];

const AUDIENCE_OPTIONS = Object.entries(ANNOUNCEMENT_AUDIENCES).map(([value, label]) => ({
  value,
  label,
}));

function initialValues(announcement: Announcement | null): AnnouncementValues {
  const today = bogotaToday();
  return {
    title: announcement?.title ?? '',
    body: announcement?.body ?? '',
    audience: announcement?.audience ?? 'both',
    starts_on: announcement?.starts_on ?? today,
    ends_on: announcement?.ends_on ?? today,
    link_url: announcement?.link_url ?? '',
    image_file_id: announcement?.image_file_id ?? null,
  };
}

function requestOf(values: AnnouncementValues) {
  const link = values.link_url.trim();
  return announcementRequestSchema.safeParse({ ...values, link_url: link === '' ? null : link });
}

type Change = (patch: Partial<AnnouncementValues>) => void;
type TextKey = 'title' | 'link_url' | 'starts_on' | 'ends_on';

interface FieldProps {
  readonly values: AnnouncementValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly change: Change;
}

/** Un campo de una línea del comunicado, con su mensaje de error. */
function LineField(
  props: FieldProps & {
    readonly name: TextKey;
    readonly id: string;
    readonly label: string;
    readonly type?: 'text' | 'date';
    readonly hint?: string;
  },
): JSX.Element {
  return (
    <FormField
      id={props.id}
      label={props.label}
      type={props.type ?? 'text'}
      {...(props.hint === undefined ? {} : { hint: props.hint })}
      {...(props.name === 'title' ? { maxLength: ANNOUNCEMENT_LIMITS.title } : {})}
      value={props.values[props.name]}
      error={props.problems[props.name] ?? null}
      onChange={(event) => {
        props.change({ [props.name]: event.target.value });
      }}
    />
  );
}

function BodyField({ values, problems, change }: FieldProps): JSX.Element {
  const left = Math.max(ANNOUNCEMENT_LIMITS.body - values.body.trim().length, 0);
  return (
    <TextareaField
      id="comunicado-texto"
      label="Texto"
      hint={`Quedan ${String(left)} caracteres. Es público: nada confidencial.`}
      rows={4}
      value={values.body}
      error={problems['body'] ?? null}
      onChange={(event) => {
        change({ body: event.target.value });
      }}
    />
  );
}

function AudienceField({ values, problems, change }: FieldProps): JSX.Element {
  return (
    <SelectField
      id="comunicado-publico"
      label="Para quién"
      hint="Personal: «Ingreso plataforma». Clientes: «Portal de clientes»."
      options={AUDIENCE_OPTIONS}
      value={values.audience}
      error={problems['audience']}
      onChange={(event) => {
        change({ audience: announcementAudienceSchema.parse(event.target.value) });
      }}
    />
  );
}

function AnnouncementFields(props: FieldProps): JSX.Element {
  return (
    <>
      <LineField {...props} name="title" id="comunicado-titulo" label="Título" />
      <BodyField {...props} />
      <AudienceField {...props} />
      <div className="grid gap-4 sm:grid-cols-2">
        <LineField {...props} name="starts_on" id="comunicado-inicio" label="Desde" type="date" />
        <LineField {...props} name="ends_on" id="comunicado-fin" label="Hasta" type="date" />
      </div>
      <LineField
        {...props}
        name="link_url"
        id="comunicado-enlace"
        label="Enlace (opcional)"
        hint="Completo, que empiece por https://"
      />
    </>
  );
}

/** Crear o editar un comunicado; se ve en el acceso del primer al último día, hora de Colombia. */
export function AnnouncementForm(props: {
  readonly announcement: Announcement | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState(() => initialValues(props.announcement));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useSaveAnnouncement(props.announcement, props.onSaved);
  const change: Change = (patch) => {
    setValues((current) => ({ ...current, ...patch }));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsed = requestOf(values);
    setProblems(parsed.success ? {} : problemsOf(parsed.error));
    if (parsed.success) save.execute(parsed.data);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormSummary problems={problems} fields={FIELDS} />
      {save.error === null ? null : <FormError error={save.error} />}
      <AnnouncementFields values={values} problems={problems} change={change} />
      <AnnouncementImagePicker
        announcementId={props.announcement?.id ?? null}
        fileId={values.image_file_id}
        onChange={(image_file_id) => {
          change({ image_file_id });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}
