'use client';

import {
  kbAudienceSchema,
  kbCategorySchema,
  kbStatusSchema,
  type KbArticleSummary,
} from '@arza/contracts';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Pager,
  SelectField,
  buttonVariants,
  useCursorTrail,
} from '@arza/ui';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { optionsOf } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { useKbArticles } from './care-queries';
import { KB_AUDIENCES, KB_CATEGORIES, KB_STATUSES, KB_STATUS_TONES, SERVICE_PATHS } from './labels';
import { ServiceNav } from './service-nav';

// Base de conocimiento (B29): artículos de ayuda para el equipo y para los clientes. Todos leen lo
// publicado; Servicio al cliente ve también borradores y archivados, y escribe.

interface Filters {
  readonly q: string;
  readonly category: string;
  readonly audience: string;
  readonly status: string;
}

const START: Filters = { q: '', category: '', audience: '', status: '' };

function ArticleCard({ article }: { readonly article: KbArticleSummary }): JSX.Element {
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <Link
        href={SERVICE_PATHS.article(article.id)}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {article.title}
      </Link>
      <p className="text-sm text-muted-foreground">{article.summary}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{KB_CATEGORIES[article.category]}</span>
        <span>· {KB_AUDIENCES[article.audience]}</span>
        <span>· Actualizado el {formatDate(article.updated_at.slice(0, 10))}</span>
        {article.status === 'published' ? null : (
          <Badge tone={KB_STATUS_TONES[article.status]}>{KB_STATUSES[article.status]}</Badge>
        )}
      </div>
    </li>
  );
}

type Change = (event: { target: { value: string } }) => void;

function FilterSelects(props: {
  readonly manage: boolean;
  readonly values: Filters;
  readonly select: (key: keyof Filters) => Change;
}): JSX.Element {
  const { values, select } = props;
  return (
    <>
      <SelectField
        id="kb-tema"
        label="Tema"
        options={optionsOf(kbCategorySchema.options, KB_CATEGORIES, 'Todos')}
        value={values.category}
        onChange={select('category')}
      />
      <SelectField
        id="kb-publico"
        label="Para"
        options={optionsOf(kbAudienceSchema.options, KB_AUDIENCES, 'Todos')}
        value={values.audience}
        onChange={select('audience')}
      />
      {props.manage ? (
        <SelectField
          id="kb-estado"
          label="Estado"
          options={optionsOf(kbStatusSchema.options, KB_STATUSES, 'Todos')}
          value={values.status}
          onChange={select('status')}
        />
      ) : (
        <span />
      )}
    </>
  );
}

function SearchForm(props: {
  readonly manage: boolean;
  readonly onApply: (f: Filters) => void;
}): JSX.Element {
  const [values, setValues] = useState(START);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onApply(values);
  };
  const select =
    (key: keyof Filters): Change =>
    (event) => {
      setValues({ ...values, [key]: event.target.value });
    };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(0,1fr)_12rem_10rem_10rem_auto]"
    >
      <FormField
        id="kb-buscar"
        label="Buscar en los artículos"
        value={values.q}
        onChange={select('q')}
      />
      <FilterSelects manage={props.manage} values={values} select={select} />
      <Button type="submit" variant="outline" className="justify-self-start">
        Buscar
      </Button>
    </form>
  );
}

function Results({ filters }: { readonly filters: Filters }): JSX.Element {
  const trail = useCursorTrail();
  const q = filters.q.trim().length >= 2 ? filters.q : '';
  const page = useKbArticles({ ...filters, q, cursor: trail.cursor, limit: '20' });
  return (
    <QueryState query={page} loadingLabel="Cargando los artículos">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="No hay artículos"
            description="Cambie la búsqueda o el tema."
          />
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Artículos">
              {data.data.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}

export function KnowledgeList(): JSX.Element {
  const { can } = usePermissions();
  const manage = can('service.kb.manage');
  const [filters, setFilters] = useState(START);
  return (
    <div className="flex flex-col gap-4">
      <ServiceNav current="knowledge" />
      <PageHeader
        title="Base de conocimiento"
        description="Respuestas a las preguntas frecuentes y guías de uso, para el equipo y para los clientes."
        action={
          manage ? (
            <Link href={SERVICE_PATHS.articleCreate} className={buttonVariants()}>
              Escribir un artículo
            </Link>
          ) : undefined
        }
      />
      <SearchForm manage={manage} onApply={setFilters} />
      <Results key={JSON.stringify(filters)} filters={filters} />
    </div>
  );
}
