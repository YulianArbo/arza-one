'use client';

import {
  legalTextKeyOfSlug,
  publicLegalTextSchema,
  publicPageListResponseSchema,
  publicPageSchema,
  publicPrivacyPolicySchema,
  type PublicPrivacyPolicy,
} from '@arza/contracts';
import { EmptyState, ErrorState, LoadingState } from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDayOf } from '../../lib/format/date-time';
import { SiteBlocks } from './site-blocks';

// Lo publicado del sitio (B41): los textos legales vigentes, la política de tratamiento que vive en
// Privacidad y las páginas administrables. Lo que todavía no se publica lo dice, sin inventar texto.

const PRIVACY_SLUG = 'privacidad';

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function useLegalText(slug: string) {
  const api = useApiClient();
  const key = legalTextKeyOfSlug(slug);
  return useQuery({
    queryKey: ['site', 'legal', slug],
    retry: false,
    queryFn: ({ signal }): Promise<PublicPrivacyPolicy> =>
      slug === PRIVACY_SLUG || key === null
        ? api.get('/v1/public/legal/privacy-policy', { schema: publicPrivacyPolicySchema, signal })
        : api.get(`/v1/public/legal/${key}`, { schema: publicLegalTextSchema, signal }),
  });
}

function Article(props: {
  readonly title: string;
  readonly meta: string;
  readonly body: string;
}): JSX.Element {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
        <p className="text-sm text-muted-foreground">{props.meta}</p>
      </header>
      <SiteBlocks body={props.body} />
    </article>
  );
}

function Unavailable(props: { readonly title: string; readonly error: unknown }): JSX.Element {
  if (isNotFound(props.error)) {
    return (
      <EmptyState
        icon={<FileText aria-hidden="true" />}
        title={props.title}
        description="Este texto todavía no se ha publicado. Mientras tanto, puede escribirnos por los medios de contacto."
      />
    );
  }
  const apiError = props.error instanceof ApiError ? props.error : undefined;
  return (
    <ErrorState
      message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
      correlationId={apiError?.correlationId}
    />
  );
}

/** Texto legal publicado, con su versión y desde cuándo rige. */
export function LegalTextView(props: {
  readonly slug: string;
  readonly title: string;
}): JSX.Element {
  const query = useLegalText(props.slug);
  if (query.isError) return <Unavailable title={props.title} error={query.error} />;
  if (query.data === undefined) return <LoadingState label="Cargando el texto" />;
  const text = query.data;
  return (
    <Article
      title={text.title}
      meta={`Versión ${String(text.version_number)} · Vigente desde el ${formatDayOf(text.effective_from)}`}
      body={text.body}
    />
  );
}

/** Página institucional publicada. */
export function PublicPageView({ slug }: { readonly slug: string }): JSX.Element {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ['site', 'page', slug],
    retry: false,
    queryFn: ({ signal }) =>
      api.get(`/v1/public/pages/${encodeURIComponent(slug)}`, { schema: publicPageSchema, signal }),
  });
  if (query.isError) {
    if (!isNotFound(query.error)) return <Unavailable title="Página" error={query.error} />;
    return (
      <EmptyState
        icon={<FileText aria-hidden="true" />}
        title="Esta página no existe"
        description="Puede que la dirección esté mal escrita o que la página se haya retirado."
        action={<Link href="/">Ir al inicio</Link>}
      />
    );
  }
  if (query.data === undefined) return <LoadingState label="Cargando la página" />;
  return (
    <Article
      title={query.data.title}
      meta={query.data.summary ?? `Actualizada el ${formatDayOf(query.data.published_at)}`}
      body={query.data.body}
    />
  );
}

/** Enlaces del pie a las páginas publicadas. */
export function SitePageLinks(): JSX.Element | null {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ['site', 'pages'],
    retry: false,
    queryFn: ({ signal }) =>
      api.get('/v1/public/pages', { schema: publicPageListResponseSchema, signal }),
  });
  const pages = query.data?.data ?? [];
  if (pages.length === 0) return null;
  return (
    <>
      {pages.map((page) => (
        <Link
          key={page.slug}
          href={`/${page.slug}`}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <FileText aria-hidden="true" className="size-4 shrink-0" />
          {page.title}
        </Link>
      ))}
    </>
  );
}
