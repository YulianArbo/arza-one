'use client';

import type { SecondFactorSetupResponse } from '@arza/contracts';
import { Button } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { TotpCodeField } from './code-fields';
import { QrCode } from './qr-code';

/** «ABCD EFGH IJKL…»: la clave en grupos de cuatro para escribirla a mano sin perderse. */
function grouped(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

interface IntroStepProps {
  readonly pending: boolean;
  readonly error: unknown;
  readonly onStart: () => void;
}

/** Paso 1: qué se necesita y por qué. */
export function IntroStep({ pending, error, onStart }: IntroStepProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {error === null ? null : <FormError error={error} />}
      <ol className="list-decimal space-y-2 ps-5 text-sm">
        <li>
          Instale en su celular una aplicación de autenticación, por ejemplo Google Authenticator o
          Microsoft Authenticator (son gratuitas).
        </li>
        <li>Agregue su cuenta de ARZA ONE con el código QR que verá a continuación.</li>
        <li>Escriba el código de seis dígitos que le muestra la aplicación.</li>
      </ol>
      <Button type="button" className="self-start" disabled={pending} onClick={onStart}>
        {pending ? 'Preparando…' : 'Mostrar el código QR'}
      </Button>
    </div>
  );
}

interface ScanStepProps {
  readonly setup: SecondFactorSetupResponse;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: (code: string) => void;
}

/** Paso 2: escanear el QR (o escribir la clave) y confirmar con el primer código. */
export function ScanStep({ setup, pending, error, onConfirm }: ScanStepProps): JSX.Element {
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState(false);

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMissing(code.trim() === '');
    if (code.trim() !== '') onConfirm(code.replace(/\s/g, ''));
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {error === null ? null : <FormError error={error} />}
      <QrCode value={setup.otpauth_uri} label="Código QR para agregar ARZA ONE a su aplicación" />
      <div className="text-sm">
        <p className="text-muted-foreground">
          ¿No puede escanearlo? Escriba esta clave en la aplicación:
        </p>
        <p className="mt-1 font-mono font-medium tracking-wider break-all">
          {grouped(setup.secret)}
        </p>
      </div>
      <TotpCodeField
        id="codigo-configuracion"
        value={code}
        onChange={setCode}
        missingMessage={missing ? 'Escriba el código que muestra la aplicación.' : null}
      />
      <p className="text-xs text-muted-foreground">
        Tiene hasta el {formatDateTime(setup.expires_at)} para confirmar.
      </p>
      <SubmitButton label="Confirmar" pendingLabel="Confirmando…" pending={pending} />
    </form>
  );
}
