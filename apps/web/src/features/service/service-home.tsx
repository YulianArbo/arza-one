'use client';

import { LoadingState } from '@arza/ui';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { KnowledgeList } from './knowledge-list';
import { PqrsfInbox } from './pqrsf-inbox';
import { TicketInbox } from './ticket-inbox';

// Entrada a Servicio al cliente (B29): cada persona llega a la primera sección que puede ver.

/** La primera sección que la persona puede ver: tiquetes, PQRSF o la base de conocimiento. */
export function ServiceHome(): JSX.Element {
  const view = usePermissions();
  if (!view.ready) return <LoadingState label="Cargando Servicio al cliente" />;
  if (view.can('service.ticket.read')) return <TicketInbox />;
  if (view.can('service.pqrsf.read')) return <PqrsfInbox />;
  return <KnowledgeList />;
}
