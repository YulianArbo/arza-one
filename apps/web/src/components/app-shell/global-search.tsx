'use client';

import {
  partyListResponseSchema,
  type DocumentSearchHit,
  type PartySummary,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type JSX, type ReactNode } from 'react';

import { documentPath } from '../../features/documents/labels';
import { useDocumentSearch } from '../../features/documents/retention-queries';
import { identification, partyPath } from '../../features/parties/labels';
import { queryString } from '../../features/parties/queries';
import { usePermissions } from '../../features/session/permissions';
import { useApiClient } from '../../lib/api/api-provider';

// Búsqueda global de la zona 2 (16.3, B21): documentos (texto completo en español, sin tildes) y
// terceros, a la vez. Solo consulta lo que la persona tiene permiso de ver, y la API además filtra
// cada resultado: nunca aparece algo que la persona no pueda abrir.

/** Espera a que la persona deje de escribir antes de buscar. */
const PAUSE_MS = 300;

/** Ctrl K (o Cmd K en Mac) abre la búsqueda desde cualquier pantalla. */
function isSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  return event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
}

function useSearchShortcut(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);
}

function usePaused(value: string): string {
  const [paused, setPaused] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPaused(value);
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value]);
  return paused;
}

function usePartySearch(q: string, enabled: boolean): UseQueryResult<readonly PartySummary[]> {
  const api = useApiClient();
  const text = q.trim();
  return useQuery({
    queryKey: ['parties', 'global-search', text],
    enabled: enabled && text.length >= 2,
    queryFn: async ({ signal }) =>
      (
        await api.get(`/v1/parties?${queryString({ q: text, limit: '5' })}`, {
          schema: partyListResponseSchema,
          signal,
        })
      ).data,
  });
}

/** El fragmento con las palabras encontradas resaltadas (la API las marca con [[ y ]]). */
function Snippet({ text }: { readonly text: string }): JSX.Element {
  const parts = text.split(/\[\[|\]\]/u);
  return (
    <span>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

/** Cómo va la consulta de un grupo de resultados. */
function stateOf(query: UseQueryResult, count: number | undefined): string | null {
  if (query.isError) return 'No se pudo buscar. Intente de nuevo.';
  if (query.isFetching) return 'Buscando…';
  return count === 0 ? 'Sin resultados.' : null;
}

function Group(props: {
  readonly title: string;
  readonly status: string | null;
  readonly children: ReactNode;
}): JSX.Element {
  const { status } = props;
  return (
    <section aria-label={props.title} className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">{props.title}</h3>
      {status === null ? (
        <ul className="flex flex-col gap-1">{props.children}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{status}</p>
      )}
    </section>
  );
}

function ResultLink(props: {
  readonly href: string;
  readonly onPick: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <li>
      <Link
        href={props.href}
        onClick={props.onPick}
        className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        {props.children}
      </Link>
    </li>
  );
}

function DocumentResults(props: {
  readonly q: string;
  readonly onPick: () => void;
}): JSX.Element | null {
  const allowed = usePermissions().can('doc.document.read');
  const search = useDocumentSearch(props.q, allowed);
  const hits: readonly DocumentSearchHit[] = search.data?.data ?? [];
  if (!allowed) return null;
  return (
    <Group title="Documentos" status={stateOf(search, search.data?.data.length)}>
      {hits.map((hit) => (
        <ResultLink key={hit.id} href={documentPath(hit.id)} onPick={props.onPick}>
          <span className="font-medium">{hit.code}</span> · {hit.title}
          {hit.snippet === null ? null : (
            <span className="block text-xs text-muted-foreground">
              <Snippet text={hit.snippet} />
            </span>
          )}
        </ResultLink>
      ))}
    </Group>
  );
}

function PartyResults(props: {
  readonly q: string;
  readonly onPick: () => void;
}): JSX.Element | null {
  const allowed = usePermissions().can('party.read');
  const parties = usePartySearch(props.q, allowed);
  if (!allowed) return null;
  return (
    <Group title="Terceros" status={stateOf(parties, parties.data?.length)}>
      {(parties.data ?? []).map((party) => (
        <ResultLink key={party.id} href={partyPath(party.id)} onPick={props.onPick}>
          <span className="font-medium">{party.name}</span>
          <span className="block text-xs text-muted-foreground">{identification(party)}</span>
        </ResultLink>
      ))}
    </Group>
  );
}

function Results(props: { readonly q: string; readonly onPick: () => void }): JSX.Element {
  const permissions = usePermissions();
  if (!permissions.can('doc.document.read') && !permissions.can('party.read')) {
    return (
      <p className="text-sm text-muted-foreground">
        Su rol no tiene documentos ni terceros para buscar.
      </p>
    );
  }
  if (props.q.trim().length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Escriba por lo menos dos letras: un código, un nombre o palabras del documento.
      </p>
    );
  }
  return (
    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto" aria-live="polite">
      <DocumentResults q={props.q} onPick={props.onPick} />
      <PartyResults q={props.q} onPick={props.onPick} />
    </div>
  );
}

function SearchTrigger(): JSX.Element {
  return (
    <DialogTrigger asChild>
      <Button variant="outline" className="justify-start text-muted-foreground sm:w-64">
        <Search aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Buscar en todo…</span>
        <kbd className="ml-auto hidden rounded-sm border px-1.5 text-xs sm:inline">Ctrl K</kbd>
      </Button>
    </DialogTrigger>
  );
}

/** Búsqueda global de la zona 2 (16.3): Ctrl K la abre desde cualquier pantalla. */
export function GlobalSearch(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const paused = usePaused(text);
  useSearchShortcut(setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SearchTrigger />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar en todo</DialogTitle>
          <DialogDescription>
            Documentos (también por las palabras de su contenido, sin importar las tildes) y
            terceros. Solo aparece lo que usted puede abrir.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="global-search">Qué busca</Label>
        <Input
          id="global-search"
          type="search"
          placeholder="Código, nombre o palabra clave"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <Results
          q={paused}
          onPick={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
