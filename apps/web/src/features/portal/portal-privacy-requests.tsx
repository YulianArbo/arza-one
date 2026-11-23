'use client';

import {
  portalPrivacyRequestSchema,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_RIGHTS,
  privacyRightSchema,
  type PrivacyRequestReceipt,
} from '@arza/contracts';
import { Alert, AlertDescription, HighlightCard, SelectField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { useFileMyPrivacyRequest, useMyPrivacyRequests } from '../privacy/request-queries';
import { DialogForm, Fields, useDialogForm, type FieldSpec } from '../projects/form-bits';

// «Mis datos y privacidad» del portal (B42, decisión 1): la persona pide conocer, corregir o
// suprimir sus datos o revocar su autorización, y sigue sus solicitudes con su fecha límite.

const RIGHT_OPTIONS = privacyRightSchema.options.map((value) => ({
  value,
  label: PRIVACY_RIGHTS[value],
}));

type Key = 'document' | 'description';

const SPECS: readonly FieldSpec<Key>[] = [
  {
    key: 'document',
    field: 'document_number',
    id: 'portal-titular-documento',
    label: 'Su número de documento',
  },
  {
    key: 'description',
    field: 'description',
    id: 'portal-titular-detalle',
    label: 'Cuéntenos qué necesita',
    multiline: true,
  },
];

type Values = Record<Key, string> & { right: string };

const START: Values = { right: 'know', document: '', description: '' };

function bodyOf(values: Values): object {
  return { right: values.right, document_number: values.document, description: values.description };
}

function problemsOf(values: Values): Record<string, string> {
  const parsed = portalPrivacyRequestSchema.safeParse(bodyOf(values));
  if (parsed.success) return {};
  const found: Record<string, string> = {};
  for (const issue of parsed.error.issues) found[String(issue.path[0] ?? '')] ??= issue.message;
  return found;
}

function RequestForm({ onFiled }: { readonly onFiled: (receipt: PrivacyRequestReceipt) => void }) {
  const file = useFileMyPrivacyRequest(onFiled);
  const form = useDialogForm(START, problemsOf, (values) => {
    file.execute(portalPrivacyRequestSchema.parse(bodyOf(values)));
  });
  return (
    <DialogForm
      problems={form.problems}
      fields={SPECS}
      action={file}
      submitLabel="Enviar la solicitud"
      onSubmit={form.submit}
    >
      <SelectField
        id="portal-titular-derecho"
        label="Qué quiere hacer"
        options={RIGHT_OPTIONS}
        value={form.values.right}
        onChange={(event) => {
          form.set({ right: event.target.value });
        }}
      />
      <Fields
        specs={SPECS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}

function MyRequests(): JSX.Element {
  const mine = useMyPrivacyRequests();
  return (
    <QueryState query={mine} loadingLabel="Cargando sus solicitudes">
      {(page) =>
        page.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no ha presentado solicitudes.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" aria-label="Sus solicitudes">
            {page.data.map((item) => (
              <li key={item.id}>
                <strong>{item.code}</strong> · {PRIVACY_RIGHTS[item.right]} ·{' '}
                {PRIVACY_REQUEST_STATUSES[item.status]}
                {item.due_on === null
                  ? ''
                  : ` · responderemos a más tardar el ${formatDate(item.due_on)}`}
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

export function PortalPrivacyRequests(): JSX.Element {
  const [receipt, setReceipt] = useState<PrivacyRequestReceipt | null>(null);
  return (
    <HighlightCard title="Sus derechos sobre sus datos">
      <p className="text-sm text-muted-foreground">
        Pida conocer, corregir o suprimir sus datos personales, o revoque su autorización. Las
        consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15.
      </p>
      {receipt === null ? null : (
        <Alert tone="success">
          <AlertDescription>
            Recibimos su solicitud {receipt.code}. Le responderemos a más tardar el{' '}
            {formatDate(receipt.due_on)}.
          </AlertDescription>
        </Alert>
      )}
      <RequestForm onFiled={setReceipt} />
      <MyRequests />
    </HighlightCard>
  );
}
