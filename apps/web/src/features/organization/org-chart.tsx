'use client';

import type { OrgUnit, Position } from '@arza/contracts';
import { Badge, EmptyState } from '@arza/ui';
import { Network } from 'lucide-react';
import type { JSX } from 'react';

interface ChartNode {
  readonly position: Position;
  readonly unit: string;
  readonly children: readonly ChartNode[];
}

/**
 * Árbol de cargos por jefe directo. Un cargo cuyo jefe no está en la lista (porque se eliminó)
 * cuelga de la raíz, para que nunca desaparezca del organigrama.
 */
export function buildChart(positions: readonly Position[], units: readonly OrgUnit[]): ChartNode[] {
  const unitName = new Map(units.map((unit) => [unit.id, `${unit.code} · ${unit.name}`]));
  const known = new Set(positions.map((position) => position.id));
  const childrenOf = (bossId: string | null): ChartNode[] =>
    positions
      .filter((p) =>
        bossId === null
          ? p.reports_to_id === null || !known.has(p.reports_to_id)
          : p.reports_to_id === bossId,
      )
      .map((position) => ({
        position,
        unit: unitName.get(position.org_unit_id) ?? '',
        children: childrenOf(position.id),
      }));
  return childrenOf(null);
}

function ChartBranch({ nodes }: { readonly nodes: readonly ChartNode[] }): JSX.Element {
  return (
    <ul className="flex flex-col gap-2 border-l border-border pl-4 first:border-l-0 first:pl-0">
      {nodes.map((node) => (
        <li key={node.position.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
            <span className="font-medium">{node.position.name}</span>
            <span className="text-xs text-muted-foreground">{node.unit}</span>
            {node.position.is_active ? null : <Badge tone="neutral">Inactivo</Badge>}
          </div>
          {node.children.length === 0 ? null : <ChartBranch nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

/** Organigrama DC-SGC-001: cada cargo con el proceso al que pertenece y quién le reporta. */
export function OrgChart(props: {
  readonly positions: readonly Position[];
  readonly units: readonly OrgUnit[];
}): JSX.Element {
  const chart = buildChart(props.positions, props.units);
  if (chart.length === 0) {
    return (
      <EmptyState
        icon={<Network />}
        title="Todavía no hay cargos"
        description="Cree el cargo de la cabeza de la empresa y luego los que le reportan."
      />
    );
  }
  return <ChartBranch nodes={chart} />;
}
