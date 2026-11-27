'use client';

import type { DashboardFigure } from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de los tableros de la Dirección y del normograma (B46) y el formato colombiano de sus
// cifras: pesos con $ y punto de miles, porcentajes con coma decimal y fechas dd/mm/aaaa.

const DIRECTION_KEY = ['direction'] as const;
/** Lo que se refresca después de guardar en Dirección (también lo de Calidad que se ve aquí). */
export const DIRECTION_REFRESH = [DIRECTION_KEY, ['qms']] as const;

export function useDirectionQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...DIRECTION_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** La cifra con su unidad; sin valor, una raya. */
export function figureValue(figure: Pick<DashboardFigure, 'unit' | 'value'>): string {
  if (figure.value === null) return '—';
  // Solo para mostrar: la API ya hizo las cuentas con decimales exactos.
  const number = Number(figure.value);
  if (figure.unit === 'pesos') return PESOS.format(number);
  if (figure.unit === 'percent') return `${DECIMAL.format(number)} %`;
  if (figure.unit === 'score') return `${DECIMAL.format(number)} de 5`;
  return DECIMAL.format(number);
}

/** AAAA-MM-DD como dd/mm/aaaa. */
export function shownDate(date: string | null): string {
  if (date === null) return '—';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Fecha y hora de Colombia, por ejemplo «26/11/2026 3:05 p. m.». */
export function bogotaMoment(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Hoy en Colombia, AAAA-MM-DD. */
export function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
