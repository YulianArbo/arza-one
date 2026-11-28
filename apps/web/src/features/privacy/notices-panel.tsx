'use client';

import {
  EDITABLE_NOTICE_KEYS,
  NOTICE_KINDS,
  type EditableNoticeKey,
  type Notice,
} from '@arza/contracts';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { NOTICE_STATUS_LABELS, NOTICE_STATUS_TONES } from './labels';
import { NoticeForm } from './notice-form';
import { useNotices, usePublishNotice } from './queries';

// Privacidad › Avisos y versiones (B17): cada texto con su versión vigente, su borrador y su
// historial. Publicar reemplaza la versión vigente; lo publicado no se cambia.

function VersionLine({ notice }: { readonly notice: Notice }): JSX.Element {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span>Versión {notice.version_number}</span>
      <Badge tone={NOTICE_STATUS_TONES[notice.status]}>{NOTICE_STATUS_LABELS[notice.status]}</Badge>
      <span className="text-muted-foreground">
        {notice.effective_from === null
          ? 'Sin publicar'
          : `Desde ${formatDateTime(notice.effective_from)}`}
      </span>
    </li>
  );
}

function DraftActions(props: { readonly draft: Notice; readonly noticeKey: EditableNoticeKey }) {
  const publish = usePublishNotice();
  const { draft } = props;
  return (
    <div className="flex flex-wrap gap-2">
      <RecordDialog
        triggerLabel="Editar borrador"
        variant="outline"
        title={`Borrador de ${draft.label}`}
        description={`Versión ${String(draft.version_number)}. Se puede cambiar hasta publicarlo.`}
      >
        {(close) => (
          <NoticeForm noticeKey={props.noticeKey} draft={draft} base={null} onSaved={close} />
        )}
      </RecordDialog>
      <ConfirmActionButton
        size="sm"
        label="Publicar"
        title={`¿Publicar la versión ${String(draft.version_number)} de ${draft.label}?`}
        description="Rige desde ahora y reemplaza la versión vigente. Después no se puede cambiar: para corregirla habrá que crear otra versión. Publíquela solo con el concepto del asesor jurídico."
        confirmLabel="Sí, publicar"
        disabled={publish.pending}
        onConfirm={() => {
          publish.execute({ id: draft.id, version: draft.version });
        }}
      />
      {publish.error === null ? null : <FormError error={publish.error} />}
      {publish.dialog}
    </div>
  );
}

function NewVersion(props: {
  readonly noticeKey: EditableNoticeKey;
  readonly published: Notice | null;
}): JSX.Element {
  const label = NOTICE_KINDS[props.noticeKey].label;
  return (
    <RecordDialog
      triggerLabel="Nueva versión"
      triggerAriaLabel={`Nueva versión de ${label}`}
      variant="outline"
      title={`Nueva versión de ${label}`}
      description="Se guarda como borrador; parte del texto vigente."
    >
      {(close) => (
        <NoticeForm
          noticeKey={props.noticeKey}
          draft={null}
          base={props.published}
          onSaved={close}
        />
      )}
    </RecordDialog>
  );
}

function NoticeCard(props: {
  readonly noticeKey: EditableNoticeKey;
  readonly versions: readonly Notice[];
}): JSX.Element {
  const { noticeKey, versions } = props;
  const published = versions.find((notice) => notice.status === 'published') ?? null;
  const draft = versions.find((notice) => notice.status === 'draft') ?? null;
  const label = NOTICE_KINDS[noticeKey].label;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {published === null
            ? 'Sin versión publicada: los formularios que lo usan no se pueden enviar.'
            : `Vigente: versión ${String(published.version_number)}, «${published.title}».`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1" aria-label={`Versiones de ${label}`}>
          {versions.map((notice) => (
            <VersionLine key={notice.id} notice={notice} />
          ))}
        </ul>
        {draft === null ? (
          <NewVersion noticeKey={noticeKey} published={published} />
        ) : (
          <DraftActions draft={draft} noticeKey={noticeKey} />
        )}
      </CardContent>
    </Card>
  );
}

export function NoticesPanel(): JSX.Element {
  const notices = useNotices();
  return (
    <QueryState query={notices} loadingLabel="Cargando los textos de privacidad">
      {(data) => (
        <div className="grid gap-4 xl:grid-cols-2">
          {EDITABLE_NOTICE_KEYS.map((key) => (
            <NoticeCard
              key={key}
              noticeKey={key}
              versions={data.data.filter((notice) => notice.key === key)}
            />
          ))}
        </div>
      )}
    </QueryState>
  );
}
