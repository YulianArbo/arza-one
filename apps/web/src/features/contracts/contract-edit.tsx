'use client';

import type { ContractDetail } from '@arza/contracts';
import { Alert, AlertDescription, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { ClauseEditor } from './clause-editor';
import { DATA_FIELDS, ContractDataFields } from './contract-fields';
import {
  clauseDrafts,
  clauseRequests,
  isChanged,
  updateBody,
  updateProblems,
  valuesFromDetail,
  type ContractValues,
} from './contract-form-values';
import { CONTRACT_PATHS } from './labels';
import { useContract, useContractAction, useContractOptions } from './queries';

// Edición del borrador (B24): los datos y el texto, cláusula por cláusula. Al guardar, la API vuelve
// a llenar las variables y marca las cláusulas que se apartan de la biblioteca.

function useEditForm(contract: ContractDetail) {
  const api = useApiClient();
  const router = useRouter();
  const [values, setValues] = useState(() => valuesFromDetail(contract));
  const [drafts, setDrafts] = useState(() => clauseDrafts(contract));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useContractAction<object>(
    async (body, csrfToken) =>
      api.put(`/v1/contracts/${contract.id}`, { body, version: contract.version, csrfToken }),
    () => {
      router.push(CONTRACT_PATHS.contract(contract.id));
    },
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const clauses = clauseRequests(drafts);
    const found = updateProblems(values, clauses);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(updateBody(values, clauses));
  };
  const set = (patch: Partial<ContractValues>): void => {
    setValues({ ...values, ...patch });
  };
  return { values, set, drafts, setDrafts, problems, save, submit };
}

function ChangedWarning({ changed }: { readonly changed: number }): JSX.Element | null {
  if (changed === 0) return null;
  return (
    <Alert tone="warning">
      <AlertDescription>
        {changed === 1 ? 'Una cláusula se aparta' : `${String(changed)} cláusulas se apartan`} de la
        biblioteca: la Dirección deberá revisarlas una por una antes de aprobar.
      </AlertDescription>
    </Alert>
  );
}

function EditForm({ contract }: { readonly contract: ContractDetail }): JSX.Element {
  const form = useEditForm(contract);
  const signers = useContractOptions({ party_id: contract.party.id }).data?.signers ?? [];
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      <FormSummary problems={form.problems} fields={DATA_FIELDS} />
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <Card>
        <CardHeader>
          <CardTitle>Datos del contrato</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractDataFields
            values={form.values}
            problems={form.problems}
            signers={signers}
            set={form.set}
          />
        </CardContent>
      </Card>
      <h2 className="font-heading text-lg font-semibold">Texto del contrato</h2>
      <ChangedWarning changed={form.drafts.filter(isChanged).length} />
      <ClauseEditor drafts={form.drafts} onChange={form.setDrafts} />
      <div>
        <SubmitButton
          label="Guardar el borrador"
          pendingLabel="Guardando…"
          pending={form.save.pending}
        />
      </div>
      {form.save.dialog}
    </form>
  );
}

export function EditContract({ id }: { readonly id: string }): JSX.Element {
  const contract = useContract(id);
  return (
    <QueryState query={contract} loadingLabel="Cargando el contrato">
      {(data) => (
        <div className="flex flex-col gap-4">
          <PageHeader
            title={`Editar ${data.code}`}
            description={`${data.template.code} · ${data.template.name} para ${data.party.name}`}
          />
          {data.status === 'draft' ? (
            <EditForm contract={data} />
          ) : (
            <p>
              Este contrato ya no es un borrador: no se edita.{' '}
              <Link className="text-primary underline" href={CONTRACT_PATHS.contract(data.id)}>
                Vuelva a su ficha
              </Link>{' '}
              y, si está vigente, proponga un otrosí.
            </p>
          )}
        </div>
      )}
    </QueryState>
  );
}
