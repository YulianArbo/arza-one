'use client';

import type { NotificationKind, NotificationPreferences } from '@arza/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { CheckboxField } from '../organization/record-dialog';
import { usePreferences, useSavePreferences } from './queries';

const URGENT_HINT =
  'Es urgente: llega siempre por correo y al instante, también fuera de la jornada.';
const DEFERRED_HINT = 'Fuera de la jornada, el correo espera al inicio de la siguiente.';

function EmailChoice(props: {
  readonly item: NotificationPreferences['items'][number];
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  if (props.item.urgent) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{props.item.label}</p>
        <p className="text-xs text-muted-foreground">{URGENT_HINT}</p>
      </div>
    );
  }
  return (
    <CheckboxField
      id={`correo-${props.item.kind}`}
      label={props.item.label}
      hint={DEFERRED_HINT}
      checked={props.checked}
      onChange={props.onChange}
    />
  );
}

function SaveArea({ save }: { readonly save: ReturnType<typeof useSavePreferences> }): JSX.Element {
  return (
    <>
      {save.error === null ? null : <FormError error={save.error} />}
      {save.result === undefined ? null : <FormSuccess message="Preferencias guardadas." />}
      <SubmitButton
        label="Guardar preferencias"
        pendingLabel="Guardando…"
        pending={save.pending}
        className="self-start"
      />
      {save.dialog}
    </>
  );
}

function PreferencesForm({ initial }: { readonly initial: NotificationPreferences }): JSX.Element {
  const [email, setEmail] = useState<ReadonlyMap<NotificationKind, boolean>>(
    new Map(initial.items.map((item) => [item.kind, item.email])),
  );
  const save = useSavePreferences();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute({
      items: initial.items.map((item) => ({
        kind: item.kind,
        email: email.get(item.kind) ?? true,
      })),
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Preferencias de aviso">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Recibir también por correo</legend>
        {initial.items.map((item) => (
          <EmailChoice
            key={item.kind}
            item={item}
            checked={email.get(item.kind) ?? true}
            onChange={(checked) => {
              save.reset();
              setEmail(new Map(email).set(item.kind, checked));
            }}
          />
        ))}
      </fieldset>
      <SaveArea save={save} />
    </form>
  );
}

/** Mi perfil › Avisos (B16): qué avisos llegan también por correo. */
export function NotificationPreferencesPanel(): JSX.Element {
  const preferences = usePreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos por correo</CardTitle>
        <CardDescription>
          Todos sus avisos llegan a la campanita de ARZA ONE. Aquí decide cuáles quiere recibir
          también en su correo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState query={preferences} loadingLabel="Cargando sus preferencias">
          {(data) => <PreferencesForm initial={data} />}
        </QueryState>
      </CardContent>
    </Card>
  );
}
