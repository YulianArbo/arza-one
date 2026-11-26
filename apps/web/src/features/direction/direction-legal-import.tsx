'use client';

import {
  LEGAL_IMPORT_COLUMNS,
  LEGAL_IMPORT_OUTCOMES,
  legalImportResponseSchema,
  type LegalImportResponse,
} from '@arza/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { useHrAction } from '../hr/hr-queries';
import { usePermissions } from '../session/permissions';
import { DIRECTION_REFRESH } from './direction-queries';

// Carga del normograma desde el archivo RE-DG-001 (B46, decisión 6): primero se revisa y se ve el
// resultado de cada fila; solo sin errores se puede guardar.

interface Request {
  readonly content: string;
  readonly apply: boolean;
}

function Report({ report }: { readonly report: LegalImportResponse }): JSX.Element {
  return (
    <SimpleTable
      headers={['Fila', 'Norma', 'Artículos', 'Resultado', 'Errores']}
      scrollLabel="Revisión del archivo"
    >
      {report.rows.map((row) => (
        <TableRow key={row.line}>
          <TableCell>{row.line}</TableCell>
          <TableCell>{row.norm}</TableCell>
          <TableCell>{row.article ?? '—'}</TableCell>
          <TableCell>{LEGAL_IMPORT_OUTCOMES[row.outcome]}</TableCell>
          <TableCell>{row.errors.join(' ')}</TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function summary(report: LegalImportResponse): string {
  const totals = `${String(report.created)} nuevos y ${String(report.updated)} por actualizar`;
  return report.applied ? `Guardamos el normograma: ${totals}.` : `Revisión lista: ${totals}.`;
}

function useLegalImport() {
  const api = useApiClient();
  const [content, setContent] = useState<string | null>(null);
  const [report, setReport] = useState<LegalImportResponse | null>(null);
  const action = useHrAction<Request, LegalImportResponse>(
    (body, csrfToken) =>
      api.post('/v1/qms/legal-requirements/import', {
        body,
        csrfToken,
        schema: legalImportResponseSchema,
      }),
    setReport,
    DIRECTION_REFRESH,
  );
  const choose = (text: string | null) => {
    setReport(null);
    setContent(text);
  };
  const send = (apply: boolean) => {
    if (content !== null) action.execute({ content, apply });
  };
  const clean =
    report !== null && !report.applied && report.rows.every((row) => row.outcome !== 'error');
  return { action, content, report, choose, send, clean };
}

type ImportState = ReturnType<typeof useLegalImport>;

function FilePicker({ state }: { readonly state: ImportState }): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-sm">
      Archivo del normograma
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          state.choose(null);
          if (file !== undefined) void file.text().then(state.choose);
        }}
      />
    </label>
  );
}

function ImportBody({ state }: { readonly state: ImportState }): JSX.Element {
  const { action, report } = state;
  return (
    <>
      <FilePicker state={state} />
      <div aria-live="polite">
        {report === null ? null : <FormSuccess message={summary(report)} />}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {report === null ? null : <Report report={report} />}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={state.content === null || action.pending}
          onClick={() => {
            state.send(false);
          }}
        >
          Revisar
        </Button>
        <Button
          type="button"
          disabled={!state.clean || state.content === null || action.pending}
          onClick={() => {
            state.send(true);
          }}
        >
          Guardar
        </Button>
      </DialogFooter>
      {action.dialog}
    </>
  );
}

export function LegalImport(): JSX.Element | null {
  const { canAll } = usePermissions();
  const [open, setOpen] = useState(false);
  const state = useLegalImport();
  if (!canAll('qms.legal.manage')) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Cargar archivo
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cargar el normograma</DialogTitle>
          <DialogDescription>
            Archivo CSV (UTF-8, separado por punto y coma) con las columnas:{' '}
            {LEGAL_IMPORT_COLUMNS.join('; ')}. Primero se revisa; con un solo error no se guarda
            nada.
          </DialogDescription>
        </DialogHeader>
        <ImportBody state={state} />
      </DialogContent>
    </Dialog>
  );
}
