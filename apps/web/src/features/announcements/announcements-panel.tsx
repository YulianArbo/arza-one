'use client';

import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
  type Announcement,
  type AnnouncementStatus,
} from '@arza/contracts';
import { Badge, EmptyState, HighlightCard, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Megaphone } from 'lucide-react';
import type { JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { AnnouncementForm } from './announcement-form';
import { useAnnouncements } from './announcement-queries';
import { useEndAnnouncement } from './announcement-save';

// Administración › Comunicados (B36A): los comunicados de la pantalla de acceso, con su estado
// según las fechas de Colombia. Se editan y se terminan mientras no hayan vencido.

const STATUS_TONES: Readonly<Record<AnnouncementStatus, 'success' | 'info' | 'neutral'>> = {
  active: 'success',
  scheduled: 'info',
  expired: 'neutral',
  ended: 'neutral',
};

function isOpen(announcement: Announcement): boolean {
  return announcement.status === 'active' || announcement.status === 'scheduled';
}

function Actions(props: {
  readonly announcement: Announcement;
  readonly onEnd: (announcement: Announcement) => void;
  readonly ending: boolean;
}): JSX.Element | null {
  const { announcement } = props;
  if (!isOpen(announcement)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar ${announcement.title}`}
        variant="outline"
        title={`Editar ${announcement.title}`}
        description="Los cambios se ven en el acceso al guardar y quedan en la auditoría."
      >
        {(close) => <AnnouncementForm announcement={announcement} onSaved={close} />}
      </RecordDialog>
      <ConfirmActionButton
        label="Terminar"
        title={`¿Terminar el comunicado ${announcement.title}?`}
        description="Deja de verse en el acceso desde ya y no se puede volver a publicar; para eso, cree uno nuevo."
        confirmLabel="Sí, terminar"
        disabled={props.ending}
        onConfirm={() => {
          props.onEnd(announcement);
        }}
      />
    </div>
  );
}

function AnnouncementRow(props: {
  readonly announcement: Announcement;
  readonly onEnd: (announcement: Announcement) => void;
  readonly ending: boolean;
}): JSX.Element {
  const { announcement } = props;
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{announcement.title}</span>
        <span className="block text-xs text-muted-foreground">
          {announcement.image_file_id === null ? 'Sin imagen' : 'Con imagen'}
        </span>
      </TableCell>
      <TableCell>{ANNOUNCEMENT_AUDIENCES[announcement.audience]}</TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(announcement.starts_on)} a {formatDate(announcement.ends_on)}
      </TableCell>
      <TableCell>
        <Badge tone={STATUS_TONES[announcement.status]}>
          {ANNOUNCEMENT_STATUSES[announcement.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <Actions {...props} />
      </TableCell>
    </TableRow>
  );
}

function AnnouncementTable(props: {
  readonly announcements: readonly Announcement[];
  readonly onEnd: (announcement: Announcement) => void;
  readonly ending: boolean;
}): JSX.Element {
  if (props.announcements.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Todavía no hay comunicados"
        description="Cree el primero: se verá en la pantalla de acceso durante las fechas que elija."
      />
    );
  }
  return (
    <SimpleTable headers={['Comunicado', 'Para quién', 'Vigencia', 'Estado', '']}>
      {props.announcements.map((announcement) => (
        <AnnouncementRow
          key={announcement.id}
          announcement={announcement}
          onEnd={props.onEnd}
          ending={props.ending}
        />
      ))}
    </SimpleTable>
  );
}

/** Los comunicados de la empresa y el botón para crear uno nuevo. */
export function AnnouncementsPanel(): JSX.Element {
  const announcements = useAnnouncements();
  const end = useEndAnnouncement();
  return (
    <HighlightCard
      title="Comunicados"
      description="Lo que se publica aquí lo ve cualquier persona en la pantalla de acceso: nunca información confidencial."
    >
      <div>
        <RecordDialog
          triggerLabel="Crear comunicado"
          title="Crear comunicado"
          description="Se verá en el acceso desde la fecha de inicio hasta la de fin, en hora de Colombia."
        >
          {(close) => <AnnouncementForm announcement={null} onSaved={close} />}
        </RecordDialog>
      </div>
      {end.error === null ? null : <FormError error={end.error} />}
      <QueryState query={announcements} loadingLabel="Cargando los comunicados">
        {(data) => (
          <AnnouncementTable announcements={data.data} onEnd={end.execute} ending={end.pending} />
        )}
      </QueryState>
      {end.dialog}
    </HighlightCard>
  );
}
