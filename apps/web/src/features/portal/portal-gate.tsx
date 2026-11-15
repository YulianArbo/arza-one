'use client';

import type { PortalTerms } from '@arza/contracts';
import { Alert, AlertDescription, Button, Card, CardContent, Checkbox } from '@arza/ui';
import { useState, type JSX, type ReactNode, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { usePortalAction, usePortalTerms } from './portal-queries';

// La puerta del portal (B30, ficha 17.10): en el primer ingreso, y cada vez que cambian, la persona
// lee y acepta los términos de uso del portal y la política de privacidad vigentes. Sin términos
// publicados, el portal no se puede usar todavía. La API exige lo mismo en cada petición.

function TermsText({ terms }: { readonly terms: PortalTerms }): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {terms.documents.map((document) => (
        <Card key={document.id}>
          <CardContent className="flex flex-col gap-2 p-4">
            <h2 className="font-heading text-lg font-semibold">
              {document.title}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                (versión {document.version_number})
              </span>
            </h2>
            <div className="text-sm whitespace-pre-wrap">{document.body}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AcceptCheck(props: {
  readonly checked: boolean;
  readonly problem: string | null;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <>
      <div className="flex items-start gap-2">
        <Checkbox
          id="aceptar-terminos"
          checked={props.checked}
          aria-invalid={props.problem !== null}
          aria-describedby={props.problem === null ? undefined : 'aceptar-terminos-error'}
          onChange={(event) => {
            props.onChange(event.target.checked);
          }}
        />
        <label htmlFor="aceptar-terminos" className="text-sm">
          Leí y acepto los términos de uso del portal y la política de tratamiento de datos
          personales.
        </label>
      </div>
      {props.problem === null ? null : (
        <p id="aceptar-terminos-error" className="text-sm text-destructive">
          {props.problem}
        </p>
      )}
    </>
  );
}

function AcceptForm({ terms }: { readonly terms: PortalTerms }): JSX.Element {
  const api = useApiClient();
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const accept = usePortalAction<string[]>(async (ids, csrfToken) => {
    await api.post('/v1/portal/terms/acceptance', { body: { notice_ids: ids }, csrfToken });
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProblem(checked ? null : 'Marque la casilla para aceptar.');
    if (checked) accept.execute(terms.documents.map((document) => document.id));
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <AcceptCheck checked={checked} problem={problem} onChange={setChecked} />
      {accept.error === null ? null : <FormError error={accept.error} />}
      <div>
        <Button type="submit" disabled={accept.pending}>
          {accept.pending ? 'Guardando…' : 'Aceptar y continuar'}
        </Button>
      </div>
      {accept.dialog}
    </form>
  );
}

function TermsScreen({ terms }: { readonly terms: PortalTerms }): JSX.Element {
  if (terms.status === 'unavailable') {
    return (
      <Alert tone="info">
        <AlertDescription>
          El portal todavía no está disponible: faltan por publicar los términos de uso. Intente más
          tarde o escríbanos a su contacto en ARZA TECH.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Antes de empezar"
        description="Lea y acepte los términos de uso del portal y la política de privacidad vigentes."
      />
      <TermsText terms={terms} />
      <AcceptForm terms={terms} />
    </div>
  );
}

/** Muestra el portal solo si la persona aceptó los términos vigentes. */
export function PortalGate({ children }: { readonly children: ReactNode }): JSX.Element {
  const terms = usePortalTerms();
  return (
    <QueryState query={terms} loadingLabel="Cargando el portal">
      {(data) => (data.status === 'accepted' ? <>{children}</> : <TermsScreen terms={data} />)}
    </QueryState>
  );
}
