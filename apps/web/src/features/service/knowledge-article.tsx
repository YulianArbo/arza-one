'use client';

import type { KbArticleDetail } from '@arza/contracts';
import { Badge, Button, Card, CardContent, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { useKbArticle } from './care-queries';
import { KB_AUDIENCES, KB_CATEGORIES, KB_STATUSES, KB_STATUS_TONES, SERVICE_PATHS } from './labels';
import { useServiceAction } from './queries';

// Lectura de un artículo de la base de conocimiento (B29). El cuerpo es texto sencillo: párrafos
// separados por una línea en blanco y listas con «- » al inicio de la línea (decisión 10).

type Block =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: string[] };

/** Párrafos y listas del texto del artículo. */
export function blocksOf(body: string): Block[] {
  return body
    .split(/\n\s*\n/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '')
    .map((chunk) => {
      const lines = chunk.split('\n').map((line) => line.trim());
      return lines.every((line) => line.startsWith('- '))
        ? { kind: 'list', items: lines.map((line) => line.slice(2)) }
        : { kind: 'paragraph', text: chunk };
    });
}

function ArticleBody({ body }: { readonly body: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {blocksOf(body).map((block, index) =>
        block.kind === 'list' ? (
          <ul key={index} className="list-disc pl-5">
            {block.items.map((item, position) => (
              <li key={position}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

function StepButton(props: {
  readonly article: KbArticleDetail;
  readonly action: 'publish' | 'archive';
}): JSX.Element {
  const api = useApiClient();
  const step = useServiceAction<object>(async (_body, csrfToken) => {
    await api.post(`/v1/kb-articles/${props.article.id}/actions/${props.action}`, {
      body: {},
      version: props.article.version,
      csrfToken,
    });
  });
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={step.pending}
        onClick={() => {
          step.execute({});
        }}
      >
        {props.action === 'publish' ? 'Publicar' : 'Archivar'}
      </Button>
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </div>
  );
}

function Actions({ article }: { readonly article: KbArticleDetail }): JSX.Element | null {
  const { can } = article;
  if (!can.edit && !can.publish && !can.archive) return null;
  return (
    <div
      className="flex flex-wrap items-start gap-2"
      role="group"
      aria-label="Acciones del artículo"
    >
      {can.edit ? (
        <Link
          href={SERVICE_PATHS.articleEdit(article.id)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Editar
        </Link>
      ) : null}
      {can.publish ? <StepButton article={article} action="publish" /> : null}
      {can.archive ? <StepButton article={article} action="archive" /> : null}
    </div>
  );
}

function Article({ article }: { readonly article: KbArticleDetail }): JSX.Element {
  return (
    <>
      <PageHeader title={article.title} description={article.summary} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge tone={KB_STATUS_TONES[article.status]}>{KB_STATUSES[article.status]}</Badge>
        <span>{KB_CATEGORIES[article.category]}</span>
        <span>· {KB_AUDIENCES[article.audience]}</span>
        <span>· Actualizado el {formatDateTime(article.updated_at)}</span>
        {article.author === null ? null : <span>· Escribió {article.author.name}</span>}
      </div>
      <Actions article={article} />
      <Card>
        <CardContent className="pt-6">
          <ArticleBody body={article.body} />
        </CardContent>
      </Card>
    </>
  );
}

export function KnowledgeArticle({ id }: { readonly id: string }): JSX.Element {
  const article = useKbArticle(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={SERVICE_PATHS.knowledge}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a la base de conocimiento
      </Link>
      <QueryState query={article} loadingLabel="Cargando el artículo">
        {(data) => <Article article={data} />}
      </QueryState>
    </div>
  );
}
