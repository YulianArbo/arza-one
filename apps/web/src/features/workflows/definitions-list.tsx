'use client';

import { createdResponseSchema, type DefinitionSummary } from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { DEFINITION_STATUS_LABELS, DEFINITION_STATUS_TONES, WF_PATHS } from './labels';
import { useDefinitions, WF_KEYS } from './queries';

// Flujos de la empresa (B15): cada versión con su estado. Desde una versión publicada se puede
// iniciar un trámite de prueba para ensayar el flujo antes de que lo usen los módulos.

interface TestValues {
  readonly title: string;
  readonly amount: string;
}

function useStartTest(definitionId: string) {
  const api = useApiClient();
  const router = useRouter();
  return useAdminAction<TestValues, string>({
    run: async ({ title, amount }, csrfToken) => {
      const facts = amount.trim() === '' ? undefined : { amount: Number(amount) };
      const body = { title: title.trim(), ...(facts === undefined ? {} : { facts }) };
      const path = `/v1/workflows/${definitionId}/actions/start-test`;
      return (await api.post(path, { body, schema: createdResponseSchema, csrfToken })).id;
    },
    invalidate: [WF_KEYS.all],
    onSuccess: (id) => {
      router.push(WF_PATHS.instance(id));
    },
    reason: 'Esta acción inicia un trámite.',
  });
}

function TestFields(props: {
  readonly id: string;
  readonly values: TestValues;
  readonly onChange: (values: TestValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <FormField
        id={`prueba-asunto-${props.id}`}
        label="Asunto"
        value={values.title}
        onChange={(event) => {
          onChange({ ...values, title: event.target.value });
        }}
      />
      <FormField
        id={`prueba-monto-${props.id}`}
        label="Monto (dato «amount»)"
        type="number"
        min={0}
        hint="Sirve para ensayar las condiciones por monto."
        value={values.amount}
        onChange={(event) => {
          onChange({ ...values, amount: event.target.value });
        }}
      />
    </>
  );
}

function StartTestForm({ definition }: { readonly definition: DefinitionSummary }): JSX.Element {
  const [values, setValues] = useState<TestValues>({ title: '', amount: '' });
  const start = useStartTest(definition.id);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    start.execute(values);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar un trámite de prueba con «{definition.name}»</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid items-end gap-3 md:grid-cols-3">
          <TestFields id={definition.id} values={values} onChange={setValues} />
          <Button type="submit" disabled={start.pending || values.title.trim().length < 3}>
            Iniciar el trámite
          </Button>
        </form>
        {start.error === null ? null : <FormError error={start.error} />}
        {start.dialog}
      </CardContent>
    </Card>
  );
}

function DefinitionRow({ definition }: { readonly definition: DefinitionSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          className="font-medium text-primary underline"
          href={WF_PATHS.definition(definition.id)}
        >
          {definition.name}
        </Link>
        <p className="text-xs text-muted-foreground">{definition.key}</p>
      </TableCell>
      <TableCell>{definition.version}</TableCell>
      <TableCell>
        <Badge tone={DEFINITION_STATUS_TONES[definition.status]}>
          {DEFINITION_STATUS_LABELS[definition.status]}
        </Badge>
      </TableCell>
      <TableCell>{formatDateTime(definition.published_at)}</TableCell>
    </TableRow>
  );
}

function DefinitionTable({ definitions }: { readonly definitions: readonly DefinitionSummary[] }) {
  if (definitions.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay flujos"
        description="Cree el primero con el botón «Crear un flujo»."
        icon={<Workflow />}
      />
    );
  }
  const published = definitions.filter((definition) => definition.status === 'published');
  return (
    <div className="flex flex-col gap-6">
      <SimpleTable headers={['Flujo', 'Versión', 'Estado', 'Publicada']}>
        {definitions.map((definition) => (
          <DefinitionRow key={definition.id} definition={definition} />
        ))}
      </SimpleTable>
      {published.map((definition) => (
        <StartTestForm key={definition.id} definition={definition} />
      ))}
    </div>
  );
}

/** Lista de flujos con sus versiones y el botón para crear uno nuevo. */
export function DefinitionsList(): JSX.Element {
  const definitions = useDefinitions();
  return (
    <div className="flex flex-col gap-4">
      <Button asChild className="self-start">
        <Link href={WF_PATHS.newDefinition}>Crear un flujo</Link>
      </Button>
      <QueryState query={definitions} loadingLabel="Cargando los flujos">
        {(data) => <DefinitionTable definitions={data.data} />}
      </QueryState>
    </div>
  );
}
