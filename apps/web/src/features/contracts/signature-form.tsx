'use client';

import { registerSignatureRequestSchema } from '@arza/contracts';
import { DialogFooter, FormField, SelectField } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary, type SummaryField } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import type { AdminAction } from '../administration/admin-action';
import { useFiles } from '../files/queries';

// Registrar la firma manuscrita digitalizada (B24) de un contrato o de un otrosí: el PDF escaneado
// con las firmas de todos, que la persona subió en Archivos y pasó el antivirus, y la fecha de la
// última firma. La firma electrónica llega con el B25.

const FIELDS: readonly SummaryField[] = [
  { field: 'file_id', id: 'firma-archivo', label: 'Copia firmada' },
  { field: 'signed_on', id: 'firma-fecha', label: 'Fecha de la última firma' },
];

/** Los PDF disponibles que la persona subió en Archivos (también para el informe de pruebas, B27). */
export function usePdfOptions(): { readonly value: string; readonly label: string }[] {
  const files = useFiles();
  const pdfs = (files.data?.data ?? []).filter(
    (file) => file.status === 'available' && file.mime_type === 'application/pdf',
  );
  return [
    { value: '', label: pdfs.length === 0 ? 'No tiene PDF disponibles' : 'Elija el PDF firmado' },
    ...pdfs.map((file) => ({ value: file.id, label: file.file_name })),
  ];
}

/** Lo que falta antes de registrar la firma. */
function signatureProblems(fileId: string, signedOn: string): Record<string, string> {
  const problems: Record<string, string> = {};
  if (fileId === '') problems['file_id'] = 'Elija el PDF firmado.';
  if (signedOn === '') problems['signed_on'] = 'Elija la fecha.';
  return problems;
}

export function MissingFileHint(): JSX.Element {
  return (
    <p className="text-sm">
      ¿No está el archivo?{' '}
      <Link className="text-primary underline" href="/app/archivos">
        Súbalo en Archivos
      </Link>{' '}
      y vuelva aquí.
    </p>
  );
}

function useSignature(action: AdminAction<object, void>) {
  const [fileId, setFileId] = useState('');
  const [signedOn, setSignedOn] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = { file_id: fileId, signed_on: signedOn };
    setProblems(signatureProblems(fileId, signedOn));
    if (registerSignatureRequestSchema.safeParse(body).success) action.execute(body);
  };
  return { fileId, setFileId, signedOn, setSignedOn, problems, submit };
}

export function SignatureForm(props: { readonly action: AdminAction<object, void> }): JSX.Element {
  const options = usePdfOptions();
  const form = useSignature(props.action);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {props.action.error === null ? null : <FormError error={props.action.error} />}
      <FormSummary problems={form.problems} fields={FIELDS} />
      <SelectField
        id="firma-archivo"
        label="Copia firmada (PDF)"
        hint="El PDF aprobado, impreso, firmado por todos y escaneado."
        options={options}
        value={form.fileId}
        error={form.problems['file_id']}
        onChange={(event) => {
          form.setFileId(event.target.value);
        }}
      />
      <MissingFileHint />
      <FormField
        id="firma-fecha"
        label="Fecha de la última firma"
        type="date"
        value={form.signedOn}
        error={form.problems['signed_on'] ?? null}
        onChange={(event) => {
          form.setSignedOn(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton
          label="Registrar"
          pendingLabel="Registrando…"
          pending={props.action.pending}
        />
      </DialogFooter>
      {props.action.dialog}
    </form>
  );
}
