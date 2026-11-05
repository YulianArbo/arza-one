'use client';

import {
  VERIFICATION_RESULTS,
  verifyDocumentResponseSchema,
  type VerifyDocumentResponse,
} from '@arza/contracts';
import { Alert, AlertDescription, AlertTitle, Button, FormField } from '@arza/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';

// Verificación pública (B25, numeral 19.3): quien recibe un documento firmado en ARZA ONE comprueba
// que es el original, con el código de verificación o cargando el archivo. El archivo no sale de su
// computador: aquí se calcula su huella SHA-256 y solo se envía la huella. La respuesta no revela el
// contenido ni los nombres de quienes firmaron.

const CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Huella SHA-256 del archivo, en hexadecimal, calculada en el navegador. */
export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Lo que falta o está mal antes de verificar; null si se puede. */
export function verifyProblem(code: string, file: Blob | null): string | null {
  if (code === '' && file === null) return 'Escriba el código o cargue el archivo.';
  if (code !== '' && !CODE_PATTERN.test(code)) return 'El código tiene la forma XXXX-XXXX-XXXX.';
  return null;
}

function Result({ result }: { readonly result: VerifyDocumentResponse }): JSX.Element {
  const valid = result.result === 'valid';
  return (
    <Alert tone={valid ? 'success' : 'destructive'}>
      <AlertTitle>{VERIFICATION_RESULTS[result.result]}</AlertTitle>
      {result.document === null ? (
        <AlertDescription>
          Revise que el código esté bien escrito o que el archivo sea el que recibió, sin cambios.
        </AlertDescription>
      ) : (
        <AlertDescription>
          Documento {result.document.code}, emitido por {result.document.company}, firmado por{' '}
          {result.document.signatures} personas; la última firma fue el{' '}
          {formatDateTime(result.document.completed_at)}. Código de verificación{' '}
          {result.document.verification_code}.
        </AlertDescription>
      )}
    </Alert>
  );
}

function useVerifyForm() {
  const api = useApiClient();
  const verify = useMutation({
    mutationFn: (body: { code?: string; sha256?: string }) =>
      api.post('/v1/public/verifications', { body, schema: verifyDocumentResponseSchema }),
  });
  const [code, setCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    const typed = code.trim().toUpperCase();
    const found = verifyProblem(typed, file);
    setProblem(found);
    if (found !== null) return;
    const sha256 = file === null ? undefined : await fileSha256(file);
    verify.mutate({
      ...(typed === '' ? {} : { code: typed }),
      ...(sha256 === undefined ? {} : { sha256 }),
    });
  };
  const reset = (): void => {
    setCode('');
    setFile(null);
    verify.reset();
  };
  return { verify, code, setCode, setFile, problem, submit, reset };
}

type VerifyForm = ReturnType<typeof useVerifyForm>;

/** El código y el archivo: basta uno de los dos. */
function VerifyFields({ form }: { readonly form: VerifyForm }): JSX.Element {
  return (
    <>
      <FormField
        id="verificar-codigo"
        label="Código de verificación"
        hint="Está en la página de firmas del documento, como ABCD-EFGH-JKLM."
        autoComplete="off"
        value={form.code}
        error={form.problem}
        onChange={(event) => {
          form.setCode(event.target.value);
        }}
      />
      <FormField
        id="verificar-archivo"
        label="Archivo PDF (opcional)"
        hint="Su huella se calcula en este computador: el archivo no se envía a ninguna parte."
        type="file"
        accept="application/pdf"
        onChange={(event) => {
          form.setFile(event.target.files?.[0] ?? null);
        }}
      />
    </>
  );
}

export function VerifyDocument(): JSX.Element {
  const form = useVerifyForm();
  const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void form.submit();
  };
  return (
    <div className="flex flex-col gap-6">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-xl border bg-card p-6"
      >
        {form.verify.isError ? <FormError error={form.verify.error} /> : null}
        <VerifyFields form={form} />
        <div className="flex flex-wrap gap-3">
          <SubmitButton
            label="Verificar"
            pendingLabel="Verificando…"
            pending={form.verify.isPending}
          />
          {form.verify.data === undefined ? null : (
            <Button type="reset" variant="outline" onClick={form.reset}>
              Verificar otro
            </Button>
          )}
        </div>
      </form>
      {form.verify.data === undefined ? null : <Result result={form.verify.data} />}
    </div>
  );
}
