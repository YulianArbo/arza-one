'use client';

import {
  LEGAL_TEXT_KINDS,
  createLegalTextSchema,
  updateLegalTextSchema,
  type LegalText,
  type LegalTextKey,
} from '@arza/contracts';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ContentForm } from './content-form';
import { TEXT_STATUS_LABELS, TEXT_STATUS_TONES } from './labels';
import { useLegalTexts, useSaveText, useTextStep } from './queries';

// Sitio web › Textos legales (B41, numeral 20.2; decisión 2): cada texto con sus versiones. Se
// redacta en borrador, lo aprueba otra persona con permiso de publicar y al publicarlo reemplaza
// la versión vigente. Lo publicado no se cambia.

const KEYS = Object.keys(LEGAL_TEXT_KINDS) as LegalTextKey[];

function TextForm(props: {
  readonly textKey: LegalTextKey;
  readonly draft: LegalText | null;
  readonly base: LegalText | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const save = useSaveText(props.onSaved);
  const source = props.draft ?? props.base;
  const isNew = props.draft === null;
  return (
    <>
      <ContentForm
        prefix="texto-legal"
        initial={{ title: source?.title ?? '', body: source?.body ?? '', slug: '', summary: '' }}
        schema={isNew ? createLegalTextSchema : updateLegalTextSchema}
        withAddress={false}
        toBody={(values) =>
          isNew
            ? { key: props.textKey, title: values.title.trim(), body: values.body }
            : { title: values.title.trim(), body: values.body }
        }
        pending={save.pending}
        error={save.error}
        onSubmit={(body) => {
          if (props.draft === null) {
            save.execute({ id: null, body: createLegalTextSchema.parse(body) });
          } else {
            const parsed = updateLegalTextSchema.parse(body);
            save.execute({ id: props.draft.id, version: props.draft.version, body: parsed });
          }
        }}
      />
      {save.dialog}
    </>
  );
}

function StepButton(props: { readonly text: LegalText; readonly step: 'approve' | 'publish' }) {
  const action = useTextStep();
  const { text, step } = props;
  const label = LEGAL_TEXT_KINDS[text.key].label;
  const approve = step === 'approve';
  return (
    <>
      <ConfirmActionButton
        label={approve ? 'Aprobar' : 'Publicar'}
        size="sm"
        title={`¿${approve ? 'Aprobar' : 'Publicar'} la versión ${String(text.version_number)} de ${label}?`}
        description={
          approve
            ? 'Confirma que el texto tiene el concepto del asesor jurídico. Después ya no se edita.'
            : 'Rige desde ahora y reemplaza la versión vigente. Si son los términos de la plataforma, cada persona deberá aceptarlos en su siguiente ingreso.'
        }
        confirmLabel={approve ? 'Sí, aprobar' : 'Sí, publicar'}
        disabled={action.pending}
        onConfirm={() => {
          action.execute({ id: text.id, version: text.version, step });
        }}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </>
  );
}

function OpenVersion(props: { readonly open: LegalText; readonly canPublish: boolean }) {
  const { open } = props;
  const label = LEGAL_TEXT_KINDS[open.key].label;
  return (
    <div className="flex flex-wrap gap-2">
      {open.status === 'draft' ? (
        <RecordDialog
          triggerLabel="Editar borrador"
          triggerAriaLabel={`Editar el borrador de ${label}`}
          variant="outline"
          title={`Borrador de ${label}`}
          description={`Versión ${String(open.version_number)}. Se puede cambiar hasta aprobarla.`}
        >
          {(close) => <TextForm textKey={open.key} draft={open} base={null} onSaved={close} />}
        </RecordDialog>
      ) : null}
      {props.canPublish ? (
        <StepButton text={open} step={open.status === 'draft' ? 'approve' : 'publish'} />
      ) : null}
    </div>
  );
}

function VersionLine({ text }: { readonly text: LegalText }): JSX.Element {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span>Versión {text.version_number}</span>
      <Badge tone={TEXT_STATUS_TONES[text.status]}>{TEXT_STATUS_LABELS[text.status]}</Badge>
      <span className="text-muted-foreground">
        {text.effective_from === null
          ? text.approved_by === null
            ? `Redactó: ${text.drafted_by?.name ?? 'el sistema'}`
            : `Aprobó: ${text.approved_by.name}`
          : `Desde ${formatDateTime(text.effective_from)}`}
      </span>
    </li>
  );
}

function NextStep(props: {
  readonly textKey: LegalTextKey;
  readonly published: LegalText | null;
  readonly open: LegalText | undefined;
  readonly canPublish: boolean;
}): JSX.Element {
  const label = LEGAL_TEXT_KINDS[props.textKey].label;
  if (props.open !== undefined) {
    return <OpenVersion open={props.open} canPublish={props.canPublish} />;
  }
  return (
    <RecordDialog
      triggerLabel="Nueva versión"
      triggerAriaLabel={`Nueva versión de ${label}`}
      variant="outline"
      title={`Nueva versión de ${label}`}
      description="Se guarda como borrador; parte del texto vigente."
    >
      {(close) => (
        <TextForm textKey={props.textKey} draft={null} base={props.published} onSaved={close} />
      )}
    </RecordDialog>
  );
}

function TextCard(props: {
  readonly textKey: LegalTextKey;
  readonly versions: readonly LegalText[];
  readonly canPublish: boolean;
}): JSX.Element {
  const { textKey, versions } = props;
  const label = LEGAL_TEXT_KINDS[textKey].label;
  const published = versions.find((text) => text.status === 'published') ?? null;
  const open = versions.find((text) => text.status === 'draft' || text.status === 'approved');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {published === null
            ? 'Sin versión publicada: el sitio dice que todavía no se ha publicado.'
            : `Vigente: versión ${String(published.version_number)}, «${published.title}».`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1" aria-label={`Versiones de ${label}`}>
          {versions.map((text) => (
            <VersionLine key={text.id} text={text} />
          ))}
        </ul>
        <NextStep
          textKey={textKey}
          published={published}
          open={open}
          canPublish={props.canPublish}
        />
      </CardContent>
    </Card>
  );
}

export function LegalTextsPanel(): JSX.Element {
  const query = useLegalTexts();
  const permissions = usePermissions();
  const canPublish = permissions.can('web.legal_text.publish');
  return (
    <QueryState query={query} loadingLabel="Cargando los textos legales">
      {(data) => (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Textos legales">
          {KEYS.map((key) => (
            <li key={key}>
              <TextCard
                textKey={key}
                versions={data.data.filter((text) => text.key === key)}
                canPublish={canPublish}
              />
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
