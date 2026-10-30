'use client';

import { MAX_CLAUSES } from '@arza/contracts';
import { Badge, Button, Card, CardContent, FormField, TextareaField } from '@arza/ui';
import type { JSX } from 'react';

import { isChanged, type ClauseDraft } from './contract-form-values';

// Editor de las cláusulas del borrador (B24, ficha 17.7). Cambiar el texto de una cláusula de la
// biblioteca la marca «Modificada»; una agregada es «Nueva». Las dos exigen que la Dirección las
// revise una por una. Las obligatorias de la plantilla no se pueden quitar.

interface CardProps {
  readonly draft: ClauseDraft;
  readonly index: number;
  readonly update: (patch: Partial<ClauseDraft>) => void;
  readonly remove: () => void;
}

function ClauseBadges({ draft, index }: Pick<CardProps, 'draft' | 'index'>): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Cláusula {index + 1}</span>
      {isChanged(draft) ? (
        <Badge tone="warning">{draft.clauseKey === null ? 'Nueva' : 'Modificada'}</Badge>
      ) : (
        <Badge tone="neutral">De la biblioteca</Badge>
      )}
      {draft.required ? <Badge tone="info">Obligatoria</Badge> : null}
    </div>
  );
}

function ClauseButtons({ draft, update, remove }: Omit<CardProps, 'index'>): JSX.Element {
  const library = draft.libraryBody;
  return (
    <div className="flex flex-wrap gap-2">
      {isChanged(draft) && library !== null ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            update({ body: library });
          }}
        >
          Restaurar el texto de la biblioteca
        </Button>
      ) : null}
      {draft.required ? null : (
        <Button type="button" size="sm" variant="ghost" onClick={remove}>
          Quitar esta cláusula
        </Button>
      )}
    </div>
  );
}

function ClauseCard(props: CardProps): JSX.Element {
  const { draft, index } = props;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <ClauseBadges draft={draft} index={index} />
        <FormField
          id={`clausula-${String(index)}-titulo`}
          label="Título"
          value={draft.title}
          onChange={(event) => {
            props.update({ title: event.target.value });
          }}
        />
        <TextareaField
          id={`clausula-${String(index)}-texto`}
          label="Texto"
          rows={6}
          value={draft.body}
          onChange={(event) => {
            props.update({ body: event.target.value });
          }}
        />
        <ClauseButtons draft={draft} update={props.update} remove={props.remove} />
      </CardContent>
    </Card>
  );
}

/** Cláusula nueva, en blanco, al final del contrato. */
export function newClause(sequence: number): ClauseDraft {
  return {
    key: `nueva-${String(sequence)}`,
    clauseKey: null,
    title: '',
    body: '',
    libraryBody: null,
    required: false,
  };
}

export function ClauseEditor(props: {
  readonly drafts: readonly ClauseDraft[];
  readonly onChange: (drafts: ClauseDraft[]) => void;
}): JSX.Element {
  const { drafts, onChange } = props;
  const update = (index: number, patch: Partial<ClauseDraft>): void => {
    onChange(drafts.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)));
  };
  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft, index) => (
        <ClauseCard
          key={draft.key}
          draft={draft}
          index={index}
          update={(patch) => {
            update(index, patch);
          }}
          remove={() => {
            onChange(drafts.filter((_, at) => at !== index));
          }}
        />
      ))}
      {drafts.length < MAX_CLAUSES ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange([...drafts, newClause(Date.now())]);
            }}
          >
            Agregar una cláusula nueva
          </Button>
        </div>
      ) : null}
    </div>
  );
}
