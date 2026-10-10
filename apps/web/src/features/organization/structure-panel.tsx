'use client';

import { Alert, AlertDescription } from '@arza/ui';
import { Info } from 'lucide-react';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { OrgChart } from './org-chart';
import { PositionsSection } from './positions-section';
import { useOrgUnits, usePositions } from './queries';
import { UnitsSection, type StructureLists } from './units-section';

function StructureView({ lists }: { readonly lists: StructureLists }): JSX.Element {
  const canManage = usePermissions().can('core.org.manage');
  return (
    <div className="flex flex-col gap-8">
      <Alert tone="info">
        <Info aria-hidden="true" />
        <AlertDescription>
          La estructura inicial es provisional: se armó con los cargos del manual mientras se
          confirma con el documento DC-SGC-001.
        </AlertDescription>
      </Alert>
      <section aria-labelledby="organigrama-titulo" className="flex flex-col gap-4">
        <h2 id="organigrama-titulo" className="text-lg font-semibold">
          Organigrama
        </h2>
        <OrgChart positions={lists.positions} units={lists.units} />
      </section>
      <UnitsSection lists={lists} canManage={canManage} />
      <PositionsSection lists={lists} canManage={canManage} />
    </div>
  );
}

/** Organigrama, procesos y cargos (ficha 17.1), armados con las mismas dos consultas. */
export function StructurePanel(): JSX.Element {
  const units = useOrgUnits();
  const positions = usePositions();
  return (
    <QueryState query={units} loadingLabel="Cargando los procesos">
      {(unitList) => (
        <QueryState query={positions} loadingLabel="Cargando los cargos">
          {(positionList) => (
            <StructureView lists={{ units: unitList.data, positions: positionList.data }} />
          )}
        </QueryState>
      )}
    </QueryState>
  );
}
