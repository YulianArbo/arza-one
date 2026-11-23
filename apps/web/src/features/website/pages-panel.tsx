'use client';

import { savePageSchema, type Page } from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@arza/ui';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { ContentForm, type ContentValues } from './content-form';
import { PAGE_STATUS_LABELS, PAGE_STATUS_TONES } from './labels';
import { usePages, usePageStep, useSavePage } from './queries';

// Sitio web › Páginas (B41, ficha 17.18; decisión 10): páginas institucionales como «Nosotros».
// Una página publicada se ve en el sitio en su dirección; editarla cambia lo publicado.

const EMPTY: ContentValues = { title: '', body: '', slug: '', summary: '' };

function toBody(values: ContentValues): object {
  return {
    slug: values.slug.trim(),
    title: values.title.trim(),
    summary: values.summary.trim() === '' ? null : values.summary.trim(),
    body: values.body,
  };
}

function PageForm(props: { readonly page: Page | null; readonly onSaved: () => void }) {
  const save = useSavePage(props.onSaved);
  const { page } = props;
  return (
    <>
      <ContentForm
        prefix="pagina"
        initial={
          page === null
            ? EMPTY
            : { title: page.title, body: page.body, slug: page.slug, summary: page.summary ?? '' }
        }
        schema={savePageSchema}
        withAddress
        toBody={toBody}
        pending={save.pending}
        error={save.error}
        onSubmit={(body) => {
          const parsed = savePageSchema.parse(body);
          save.execute(
            page === null
              ? { id: null, body: parsed }
              : { id: page.id, version: page.version, body: parsed },
          );
        }}
      />
      {save.dialog}
    </>
  );
}

function EditPage({ page }: { readonly page: Page }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Editar"
      triggerAriaLabel={`Editar la página ${page.title}`}
      variant="outline"
      title={`Editar «${page.title}»`}
      description={
        page.status === 'published'
          ? 'Está publicada: el cambio se verá en el sitio al guardar.'
          : 'Se guarda sin publicarse.'
      }
    >
      {(close) => <PageForm page={page} onSaved={close} />}
    </RecordDialog>
  );
}

function PageActions({ page }: { readonly page: Page }): JSX.Element {
  const step = usePageStep();
  const publish = page.status !== 'published';
  return (
    <div className="flex flex-wrap gap-2">
      <EditPage page={page} />
      <ConfirmActionButton
        label={publish ? 'Publicar' : 'Retirar'}
        title={publish ? `¿Publicar «${page.title}»?` : `¿Retirar «${page.title}» del sitio?`}
        description={
          publish
            ? `Cualquier visitante la verá en /${page.slug}.`
            : 'Deja de verse en el sitio; puede publicarla de nuevo cuando quiera.'
        }
        confirmLabel={publish ? 'Sí, publicar' : 'Sí, retirar'}
        disabled={step.pending}
        onConfirm={() => {
          step.execute({
            id: page.id,
            version: page.version,
            action: publish ? 'publish' : 'withdraw',
          });
        }}
      />
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </div>
  );
}

function PageCard({ page }: { readonly page: Page }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {page.title}
          <Badge tone={PAGE_STATUS_TONES[page.status]}>{PAGE_STATUS_LABELS[page.status]}</Badge>
        </CardTitle>
        <CardDescription>
          {page.status === 'published' ? (
            <Link href={`/${page.slug}`} className="text-primary underline underline-offset-4">
              /{page.slug}
            </Link>
          ) : (
            `/${page.slug}`
          )}
          {page.published_at === null
            ? null
            : ` · Publicada el ${formatDateTime(page.published_at)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PageActions page={page} />
      </CardContent>
    </Card>
  );
}

export function PagesPanel(): JSX.Element {
  const query = usePages();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <RecordDialog
          triggerLabel="Nueva página"
          title="Nueva página"
          description="Se guarda en borrador; publíquela cuando esté lista."
        >
          {(close) => <PageForm page={null} onSaved={close} />}
        </RecordDialog>
      </div>
      <QueryState query={query} loadingLabel="Cargando las páginas">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<FileText aria-hidden="true" />}
              title="Todavía no hay páginas"
              description="Cree la primera, por ejemplo «Nosotros»."
            />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2" aria-label="Páginas del sitio">
              {data.data.map((page) => (
                <li key={page.id}>
                  <PageCard page={page} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}
