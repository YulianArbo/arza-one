'use client';

import { SelectField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { ActivityList } from './activities-panel';

// Agenda comercial de la persona (B22): sus actividades pendientes, hechas o todas.

const VIEWS = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'done', label: 'Hechas' },
  { value: 'all', label: 'Todas' },
];

export function ActivityAgenda(): JSX.Element {
  const [view, setView] = useState('pending');
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <SelectField
          id="agenda-vista"
          label="Mostrar"
          options={VIEWS}
          value={view}
          onChange={(event) => {
            setView(event.target.value);
          }}
        />
      </div>
      <ActivityList
        filters={{ mine: 'true', view }}
        showRecord
        canUpdate={can('crm.lead.update') && can('crm.opportunity.update')}
      />
    </div>
  );
}
