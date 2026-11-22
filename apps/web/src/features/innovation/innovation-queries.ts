'use client';

import { innRefListResponseSchema } from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de Innovación y propiedad intelectual (B40) y las listas de sus formularios.

const INN_KEY = ['innovation'] as const;
/** Lo que se refresca después de guardar en Innovación. */
export const INN_REFRESH = [INN_KEY] as const;

export function useInnQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...INN_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export interface Option {
  readonly value: string;
  readonly label: string;
}

/** Cuentas internas activas, para elegir responsables. */
export function useInnPeople(enabled = true): Option[] {
  const query = useInnQuery('/v1/innovation/people', innRefListResponseSchema, enabled);
  return (query.data?.data ?? []).map(({ id, name }) => ({ value: id, label: name }));
}

/** Hoy en Colombia, AAAA-MM-DD. */
export function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
