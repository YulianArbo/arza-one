'use client';

import { COOKIE_CATEGORIES, COOKIE_RETENTION_YEARS, type CookieReport } from '@arza/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { useState, type JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { TextInput } from '../projects/form-bits';
import { useCookieConsents } from './request-queries';

// Privacidad › Cookies (B42; B41, decisión 4; numeral 20.4): cuántos visitantes aceptaron cada
// categoría, con qué versión de la política, y las últimas elecciones. Se conservan tres años.

function monthStart(): string {
  return `${bogotaToday().slice(0, 8)}01`;
}

function categoryLabel(category: string): string {
  const found = (COOKIE_CATEGORIES as Readonly<Record<string, { readonly label: string }>>)[
    category
  ];
  return found?.label ?? category;
}

function Summary({ report }: { readonly report: CookieReport }): JSX.Element {
  if (report.total === 0) {
    return (
      <EmptyState title="Sin elecciones en el periodo" description="Pruebe con otras fechas." />
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {report.total} elecciones · {report.only_necessary} rechazaron las no necesarias
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <SimpleTable caption="Aceptación por categoría" headers={['Categoría', 'Visitantes']}>
          {report.by_category.map((item) => (
            <TableRow key={item.category}>
              <TableCell>{categoryLabel(item.category)}</TableCell>
              <TableCell>{item.count}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
        <SimpleTable
          caption="Elecciones por versión de la política"
          headers={['Versión', 'Elecciones']}
        >
          {report.by_version.map((item) => (
            <TableRow key={item.policy_version}>
              <TableCell>Versión {item.policy_version}</TableCell>
              <TableCell>{item.count}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </CardContent>
    </Card>
  );
}

export function CookiesPanel(): JSX.Element {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(bogotaToday());
  const { list, report } = useCookieConsents(from, to);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <TextInput id="cookies-desde" label="Desde" type="date" value={from} onValue={setFrom} />
        <TextInput id="cookies-hasta" label="Hasta" type="date" value={to} onValue={setTo} />
      </div>
      <p className="text-sm text-muted-foreground">
        Las elecciones se guardan {COOKIE_RETENTION_YEARS} años con la versión de la política, las
        categorías y la dirección IP recortada; después se borran solas.
      </p>
      <QueryState query={report} loadingLabel="Calculando el resumen">
        {(found) => <Summary report={found} />}
      </QueryState>
      <QueryState query={list} loadingLabel="Cargando las elecciones">
        {(page) => (
          <SimpleTable
            caption="Últimas elecciones del periodo"
            headers={['Fecha', 'Navegador', 'Versión', 'Categorías', 'IP']}
          >
            {page.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDateTime(row.decided_at)}</TableCell>
                <TableCell>{row.visitor}…</TableCell>
                <TableCell>{row.policy_version}</TableCell>
                <TableCell>{row.categories.map(categoryLabel).join(', ')}</TableCell>
                <TableCell>{row.ip_truncated ?? '—'}</TableCell>
              </TableRow>
            ))}
          </SimpleTable>
        )}
      </QueryState>
    </div>
  );
}
