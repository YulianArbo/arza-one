'use client';

import { Alert, AlertDescription, Button } from '@arza/ui';
import { Copy, Download, Printer, TriangleAlert } from 'lucide-react';
import { useId, useState, type JSX } from 'react';

const FILE_NAME = 'codigos-de-recuperacion-arza-one.txt';

function codesText(codes: readonly string[], email: string): string {
  return [
    'ARZA ONE · Códigos de recuperación del segundo factor',
    `Cuenta: ${email}`,
    'Cada código sirve una sola vez. Guárdelos en un lugar seguro.',
    '',
    ...codes.map((code, index) => `${String(index + 1).padStart(2, ' ')}. ${code}`),
    '',
  ].join('\n');
}

function download(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

function CodeActions({ text }: { readonly text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        <Copy aria-hidden="true" />
        {copied ? 'Copiados' : 'Copiar'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          download(text);
        }}
      >
        <Download aria-hidden="true" />
        Descargar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          window.print();
        }}
      >
        <Printer aria-hidden="true" />
        Imprimir
      </Button>
    </div>
  );
}

interface RecoveryCodesPanelProps {
  readonly codes: readonly string[];
  readonly email: string;
  readonly continueLabel: string;
  readonly onContinue: () => void;
}

/**
 * Los diez códigos de recuperación (B09). Se muestran una sola vez: la persona confirma que los
 * guardó antes de seguir.
 */
export function RecoveryCodesPanel({
  codes,
  email,
  continueLabel,
  onContinue,
}: RecoveryCodesPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>
          Guárdelos ahora: no los volveremos a mostrar. Sirven para entrar si pierde el celular, y
          cada uno funciona una sola vez.
        </AlertDescription>
      </Alert>
      <ol
        aria-label="Códigos de recuperación"
        className="grid grid-cols-1 gap-2 rounded-md border bg-muted p-4 font-mono text-sm sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code} className="tracking-wider">
            {code}
          </li>
        ))}
      </ol>
      <CodeActions text={codesText(codes, email)} />
      <SavedConfirmation continueLabel={continueLabel} onContinue={onContinue} />
    </div>
  );
}

/** «Guardé mis códigos»: el botón para seguir se habilita solo al marcarla. */
function SavedConfirmation({
  continueLabel,
  onContinue,
}: Pick<RecoveryCodesPanelProps, 'continueLabel' | 'onContinue'>): JSX.Element {
  const [saved, setSaved] = useState(false);
  const checkboxId = useId();
  return (
    <>
      <div className="flex items-start gap-2 print:hidden">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked);
          }}
        />
        <label htmlFor={checkboxId} className="text-sm">
          Guardé mis códigos de recuperación en un lugar seguro.
        </label>
      </div>
      <Button
        type="button"
        className="self-start print:hidden"
        disabled={!saved}
        onClick={onContinue}
      >
        {continueLabel}
      </Button>
    </>
  );
}
