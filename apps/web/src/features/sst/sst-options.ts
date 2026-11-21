'use client';

import { orgUnitListResponseSchema, sstRefListResponseSchema } from '@arza/contracts';

import { useSstQuery } from './sst-queries';

// Listas para los formularios de SST (B37): colaboradores activos, cuentas activas y procesos.

interface Option {
  readonly value: string;
  readonly label: string;
}

export function useSstEmployees(enabled = true): Option[] {
  const query = useSstQuery('/v1/sst/employees', sstRefListResponseSchema, enabled);
  return (query.data?.data ?? []).map(({ id, name }) => ({ value: id, label: name }));
}

export function useSstPeople(enabled = true): Option[] {
  const query = useSstQuery('/v1/sst/people', sstRefListResponseSchema, enabled);
  return (query.data?.data ?? []).map(({ id, name }) => ({ value: id, label: name }));
}

export function useProcesses(enabled = true): Option[] {
  const query = useSstQuery('/v1/org-units', orgUnitListResponseSchema, enabled);
  return (query.data?.data ?? [])
    .filter((unit) => unit.kind === 'process' && unit.is_active)
    .map((unit) => ({ value: unit.id, label: unit.name }));
}

/** Año actual en Colombia. */
export function currentYear(): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric' }).format(
      new Date(),
    ),
  );
}
