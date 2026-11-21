'use client';

import { orgUnitListResponseSchema, qmsRefListResponseSchema } from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de Calidad y mejora continua (B38) y las listas de sus formularios.

export const QMS_KEY = ['qms'] as const;
/** Lo que se refresca después de guardar en Calidad. */
export const QMS_REFRESH = [QMS_KEY] as const;

export function useQmsQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...QMS_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

interface Option {
  readonly value: string;
  readonly label: string;
}

/** Cuentas internas activas, para elegir responsables. */
export function useQmsPeople(enabled = true): Option[] {
  const query = useQmsQuery('/v1/qms/people', qmsRefListResponseSchema, enabled);
  return (query.data?.data ?? []).map(({ id, name }) => ({ value: id, label: name }));
}

/** Procesos activos del organigrama. */
export function useQmsProcesses(enabled = true): Option[] {
  const query = useQmsQuery('/v1/org-units', orgUnitListResponseSchema, enabled);
  return (query.data?.data ?? [])
    .filter((unit) => unit.kind === 'process' && unit.is_active)
    .map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name}` }));
}

/** Hoy en Colombia, AAAA-MM-DD. */
export function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
