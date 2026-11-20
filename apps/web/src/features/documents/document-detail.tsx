'use client';

import { CLASSIFICATIONS, type Document, type Version } from '@arza/contracts';
import { Badge, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { QueryState } from '../administration/query-state';
import { SectionTabs, type SectionTab } from '../parties/section-tabs';
import { usePermissions } from '../session/permissions';
import { DocumentLinks } from './document-links';
import { ReadingPanel } from './reading-panel';
import { RetentionPanel } from './retention-panel';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  newRequestFor,
  versionFormPath,
} from './labels';
import { useDocument, useVersions } from './queries';
import { formatDateTime } from '../../lib/format/date-time';
import { VersionList } from './version-list';
import { VersionViewer } from './version-viewer';

// Ficha y visor del documento (B18, numerales 16.3 y 16.4): encabezado con código, estado y
// acciones; pestañas del documento, sus versiones, sus vínculos, (B19) la constancia de lectura y
// (B21) su retención. Un documento eliminado por disposición final conserva su ficha sin contenido.

/** La versión que se muestra: la vigente, o la más nueva que la persona puede ver. */
function shownVersion(document: Document, versions: readonly Version[]): Version | undefined {
  const current = versions.find((version) => version.id === document.current_version?.id);
  return current ?? versions[0];
}

function Summary({ document }: { readonly document: Document }): JSX.Element {
  const facts: readonly (readonly [string, string])[] = [
    ['Tipo', document.doc_type_label],
    ['Proceso', document.process?.name ?? 'Sin proceso'],
    ['Clasificación', CLASSIFICATIONS[document.classification]],
    ['Cargo responsable', document.owner_position?.name ?? 'Sin cargo responsable'],
    ['Versión vigente', document.current_version?.label ?? 'Ninguna todavía'],
    ['Versión en trámite', document.open_version?.label ?? 'Ninguna'],
  ];
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pedir un cambio (B19): un documento vigente del SGC solo cambia con una solicitud aprobada. */
function RequestChangeLinks({ document }: { readonly document: Document }): JSX.Element | null {
  const canRequest = usePermissions().can('doc.change_request.create');
  if (!canRequest || !document.is_controlled || document.status !== 'current') return null;
  const outline = buttonVariants({ variant: 'outline' });
  return (
    <>
      <Link href={newRequestFor(document.id, 'update')} className={outline}>
        Solicitar modificación
      </Link>
      <Link href={newRequestFor(document.id, 'obsolete')} className={outline}>
        Solicitar eliminación
      </Link>
    </>
  );
}

function NewVersionLink({ document }: { readonly document: Document }): JSX.Element | null {
  const canEdit = usePermissions().can('doc.document.update');
  if (!canEdit || document.open_version !== null || document.status === 'disposed') return null;
  return (
    <Link href={versionFormPath(document.id)} className={buttonVariants()}>
      Nueva versión
    </Link>
  );
}

function HeaderActions({ document }: { readonly document: Document }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <RequestChangeLinks document={document} />
      <NewVersionLink document={document} />
    </div>
  );
}

/** El contenido se borró por disposición final: queda la ficha como evidencia del acta. */
function DisposedNotice({ document }: { readonly document: Document }): JSX.Element {
  return (
    <p role="status" className="rounded-md border p-4 text-sm">
      Este documento se eliminó por disposición final el {formatDateTime(document.disposed_at)}. Su
      contenido ya no existe; se conservan su código y su nombre como evidencia en el acta de
      disposición.
    </p>
  );
}

function DocumentPane(props: {
  readonly document: Document;
  readonly shown: Version | undefined;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <Summary document={props.document} />
      {props.document.status === 'disposed' ? (
        <DisposedNotice document={props.document} />
      ) : props.shown === undefined ? null : (
        <VersionViewer version={props.shown} />
      )}
    </div>
  );
}

function DocumentTabs(props: {
  readonly document: Document;
  readonly versions: readonly Version[];
}): JSX.Element {
  const shown = shownVersion(props.document, props.versions);
  const tabs: SectionTab[] = [
    {
      id: 'documento',
      label: 'Documento',
      content: () => <DocumentPane document={props.document} shown={shown} />,
    },
    {
      id: 'versiones',
      label: 'Versiones',
      content: () => <VersionList document={props.document} versions={props.versions} />,
    },
    {
      id: 'vinculos',
      label: 'Vínculos',
      content: () => <DocumentLinks documentId={props.document.id} />,
    },
    {
      id: 'lectura',
      label: 'Lectura',
      content: () => <ReadingPanel documentId={props.document.id} />,
    },
    {
      id: 'retencion',
      label: 'Retención',
      content: () => <RetentionPanel document={props.document} />,
    },
  ];
  return <SectionTabs tabs={tabs} label="Secciones del documento" />;
}

function DocumentView({ document }: { readonly document: Document }): JSX.Element {
  const versions = useVersions(document.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${document.code} · ${document.title}`}
        description="Solo hay una versión vigente. Una versión vigente no se modifica: los cambios van en una versión nueva."
        action={<HeaderActions document={document} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={DOCUMENT_STATUS_TONES[document.status]}>
            {DOCUMENT_STATUS_LABELS[document.status]}
          </Badge>
        </div>
      </PageHeader>
      <QueryState query={versions} loadingLabel="Cargando las versiones">
        {(data) => <DocumentTabs document={document} versions={data.data} />}
      </QueryState>
    </div>
  );
}

export function DocumentDetail({ id }: { readonly id: string }): JSX.Element {
  const document = useDocument(id);
  return (
    <QueryState query={document} loadingLabel="Cargando el documento">
      {(data) => <DocumentView document={data} />}
    </QueryState>
  );
}
