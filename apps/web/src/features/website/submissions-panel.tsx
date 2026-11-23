'use client';

import { QUOTE_TIMEFRAMES, SITE_FORMS, SITE_SERVICES, type Submission } from '@arza/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@arza/ui';
import { Inbox, MailX } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { useSubmissions, useUnsubscribes } from './queries';

// Sitio web › Formularios recibidos (B41, decisión 7): cada mensaje de contacto o solicitud de
// cotización, con el prospecto que creó en Comercial y la versión del aviso que aceptó la persona.
// Abajo, las bajas de comunicaciones comerciales (decisión 9).

function labelOf(dictionary: Readonly<Record<string, string>>, code: string | null): string | null {
  if (code === null) return null;
  return dictionary[code] ?? code;
}

function SubmissionLines({ item }: { readonly item: Submission }): JSX.Element {
  const service = labelOf(SITE_SERVICES, item.service);
  const timeframe = labelOf(QUOTE_TIMEFRAMES, item.timeframe);
  return (
    <>
      <p>
        <strong>{item.name}</strong>
        {item.company === null ? null : ` · ${item.company}`} · {item.email}
        {item.phone === null ? null : ` · ${item.phone}`}
      </p>
      {service === null ? null : (
        <p>
          {service}
          {timeframe === null ? null : ` · ${timeframe}`}
        </p>
      )}
      <p className="whitespace-pre-line text-muted-foreground">{item.detail}</p>
      <p className="text-muted-foreground">
        Recibido el {formatDateTime(item.received_at)} · Aceptó la versión {item.notice_version} del
        aviso · {item.ack_sent_at === null ? 'Acuse pendiente' : 'Acuse enviado'}
      </p>
    </>
  );
}

function SubmissionCard({ item }: { readonly item: Submission }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {item.code}
          <Badge tone={item.form_key === 'quote' ? 'info' : 'neutral'}>
            {SITE_FORMS[item.form_key]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <SubmissionLines item={item} />
        {item.lead === null ? null : (
          <Link
            href={`/app/comercial/prospectos/${item.lead.id}`}
            className="self-start text-primary underline underline-offset-4"
          >
            Ver el prospecto {item.lead.code}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function Unsubscribes(): JSX.Element {
  const query = useUnsubscribes();
  return (
    <section aria-labelledby="bajas-titulo" className="flex flex-col gap-3">
      <h2 id="bajas-titulo" className="text-lg font-semibold">
        Bajas de comunicaciones comerciales
      </h2>
      <QueryState query={query} loadingLabel="Cargando las bajas">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<MailX aria-hidden="true" />}
              title="Nadie se ha dado de baja"
              description="Cuando alguien use el enlace del correo, aparecerá aquí y no recibirá comunicaciones comerciales."
            />
          ) : (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Correos dados de baja">
              {data.data.map((row) => (
                <li key={row.id}>
                  {row.email} · {formatDateTime(row.unsubscribed_at)}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

export function SubmissionsPanel(): JSX.Element {
  const query = useSubmissions();
  return (
    <div className="flex flex-col gap-8">
      <QueryState query={query} loadingLabel="Cargando los formularios">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Inbox aria-hidden="true" />}
              title="Todavía no llegan formularios"
              description="Los mensajes de contacto y las solicitudes de cotización del sitio aparecerán aquí."
            />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2" aria-label="Formularios recibidos">
              {data.data.map((item) => (
                <li key={item.id}>
                  <SubmissionCard item={item} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <Unsubscribes />
    </div>
  );
}
