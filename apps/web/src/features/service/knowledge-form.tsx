'use client';

import {
  createdResponseSchema,
  kbAudienceSchema,
  kbCategorySchema,
  type KbArticleDetail,
} from '@arza/contracts';
import { Card, CardContent } from '@arza/ui';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { optionsOf } from '../crm/labels';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { useKbArticle } from './care-queries';
import { KB_AUDIENCES, KB_CATEGORIES, SERVICE_PATHS } from './labels';
import { useServiceAction } from './queries';

// Escribir o editar un artículo de la base de conocimiento (B29). Nace como borrador; se publica
// desde su página.

interface Values {
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: string;
}

const EMPTY: Values = {
  title: '',
  summary: '',
  body: '',
  category: 'general',
  audience: 'internal',
};

const TEXTS: readonly FieldSpec<'title' | 'summary' | 'body'>[] = [
  { key: 'title', field: 'title', id: 'kb-titulo', label: 'Título' },
  {
    key: 'summary',
    field: 'summary',
    id: 'kb-resumen',
    label: 'Resumen',
    hint: 'Una o dos líneas: aparece en la lista.',
  },
  {
    key: 'body',
    field: 'body',
    id: 'kb-cuerpo',
    label: 'Contenido',
    hint: 'Separe los párrafos con una línea en blanco. Para una lista, empiece cada línea con «- ».',
    multiline: true,
  },
];

const CHOICES: readonly ChoiceSpec<'category' | 'audience'>[] = [
  {
    key: 'category',
    field: 'category',
    id: 'kb-categoria',
    label: 'Tema',
    options: optionsOf(kbCategorySchema.options, KB_CATEGORIES),
  },
  {
    key: 'audience',
    field: 'audience',
    id: 'kb-audiencia',
    label: 'Para quién es',
    hint: 'Los de clientes se verán en el portal del cliente.',
    options: optionsOf(kbAudienceSchema.options, KB_AUDIENCES),
  },
];

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.title.trim().length < 3) found['title'] = 'Escriba un título.';
  if (values.summary.trim().length < 10)
    found['summary'] = 'Escriba un resumen de al menos 10 letras.';
  if (values.body.trim().length < 10) found['body'] = 'Escriba el contenido del artículo.';
  return found;
}

function bodyOf(values: Values): object {
  return {
    title: values.title.trim(),
    summary: values.summary.trim(),
    body: values.body.trim(),
    category: values.category,
    audience: values.audience,
  };
}

/** Guarda el artículo nuevo o el cambio, y abre su página. */
function useSaveArticle(article: KbArticleDetail | null) {
  const api = useApiClient();
  const router = useRouter();
  return useServiceAction<object, string>(
    async (body, csrfToken) => {
      if (article === null) {
        return (
          await api.post('/v1/kb-articles', { body, schema: createdResponseSchema, csrfToken })
        ).id;
      }
      await api.put(`/v1/kb-articles/${article.id}`, { body, version: article.version, csrfToken });
      return article.id;
    },
    (id) => {
      router.push(SERVICE_PATHS.article(id));
    },
  );
}

function ArticleEditor(props: { readonly article: KbArticleDetail | null }): JSX.Element {
  const { article } = props;
  const save = useSaveArticle(article);
  const start: Values = article === null ? EMPTY : { ...article };
  const form = useDialogForm(start, problemsOf, (values) => {
    save.execute(bodyOf(values));
  });
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <DialogForm
          problems={form.problems}
          fields={[...TEXTS, ...CHOICES]}
          action={save}
          submitLabel="Guardar el artículo"
          onSubmit={form.submit}
        >
          <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
          <ChoiceFields
            specs={CHOICES}
            values={form.values}
            problems={form.problems}
            onChange={change}
          />
        </DialogForm>
      </CardContent>
    </Card>
  );
}

export function KnowledgeCreate(): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Escribir un artículo"
        description="Nace como borrador: nadie más lo ve hasta que lo publique."
      />
      <ArticleEditor article={null} />
    </div>
  );
}

export function KnowledgeEdit({ id }: { readonly id: string }): JSX.Element {
  const article = useKbArticle(id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Editar el artículo"
        description="Si ya está publicado, los cambios se ven al guardar."
      />
      <QueryState query={article} loadingLabel="Cargando el artículo">
        {(data) => <ArticleEditor article={data} />}
      </QueryState>
    </div>
  );
}
