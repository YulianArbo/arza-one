'use client';

import {
  envelopeListResponseSchema,
  envelopeOptionsSchema,
  type EnvelopeListResponse,
  type EnvelopeOptions,
  type SignatureSource,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de la firma electrónica (B25). La API revisa el permiso, «lo propio» y el aislamiento.
// Las acciones usan useContractAction, que recarga todo lo de Contratos (también estas consultas).

export interface SignatureTarget {
  readonly source: SignatureSource;
  readonly id: string;
}

function path(base: string, target: SignatureTarget): string {
  return `${base}?source=${target.source}&source_id=${target.id}`;
}

export function useEnvelopes(target: SignatureTarget): UseQueryResult<EnvelopeListResponse> {
  const api = useApiClient();
  const url = path('/v1/signature-envelopes', target);
  return useQuery({
    queryKey: ['contracts', 'signatures', url],
    queryFn: ({ signal }) => api.get(url, { schema: envelopeListResponseSchema, signal }),
  });
}

/** Firmantes autorizados, quién firma por la empresa y el plazo, para preparar el envío. */
export function useEnvelopeOptions(target: SignatureTarget): UseQueryResult<EnvelopeOptions> {
  const api = useApiClient();
  const url = path('/v1/signature-envelopes/options', target);
  return useQuery({
    queryKey: ['contracts', 'signatures', 'options', url],
    queryFn: ({ signal }) => api.get(url, { schema: envelopeOptionsSchema, signal }),
  });
}
