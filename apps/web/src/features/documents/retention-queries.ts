'use client';

import {
  createdResponseSchema,
  dispositionListResponseSchema,
  dispositionProposalDetailSchema,
  documentRetentionSchema,
  documentSearchResponseSchema,
  downloadLinkResponseSchema,
  proposeDispositionsResponseSchema,
  retentionRuleListResponseSchema,
  unassignedDocumentsResponseSchema,
  type CreateRetentionRule,
  type DispositionAction,
  type DispositionListResponse,
  type DispositionProposalDetail,
  type DispositionStep,
  type DocumentRetention,
  type DocumentSearchResponse,
  type DownloadLinkResponse,
  type ProposeDispositionsResponse,
  type RetentionRule,
  type RetentionRuleListResponse,
  type UnassignedDocumentsResponse,
  type UpdateRetentionRule,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';
import { useSession } from '../session/session-provider';

// Consultas y acciones de la retención, la disposición final y la búsqueda (B21). La API revisa
// el permiso y el aislamiento en cada una; la búsqueda solo devuelve lo que la persona puede abrir.

const RETENTION_KEYS = {
  rules: ['documents', 'retention-rules'] as const,
  unassigned: ['documents', 'retention-rules', 'unassigned'] as const,
  ofDocument: (id: string) => ['documents', id, 'retention'] as const,
  dispositions: (filters: string) => ['documents', 'dispositions', filters] as const,
  disposition: (id: string) => ['documents', 'dispositions', id] as const,
  search: (q: string) => ['documents', 'search', q] as const,
};

const REASON = 'La retención y la disposición final de los documentos quedan en la auditoría.';

export function useRetentionRules(): UseQueryResult<RetentionRuleListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: RETENTION_KEYS.rules,
    queryFn: ({ signal }) =>
      api.get('/v1/retention-rules', { schema: retentionRuleListResponseSchema, signal }),
  });
}

export function useUnassignedDocuments(): UseQueryResult<UnassignedDocumentsResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: RETENTION_KEYS.unassigned,
    queryFn: ({ signal }) =>
      api.get('/v1/retention-rules/unassigned-documents', {
        schema: unassignedDocumentsResponseSchema,
        signal,
      }),
  });
}

/** Crea la regla, o edita la que llega (su código no cambia). */
export function useSaveRetentionRule(
  rule: RetentionRule | null,
  onSaved: () => void,
): AdminAction<CreateRetentionRule, unknown> {
  const api = useApiClient();
  return useAdminAction<CreateRetentionRule, unknown>({
    run: (body, csrfToken) => {
      if (rule === null) {
        return api.post('/v1/retention-rules', { body, schema: createdResponseSchema, csrfToken });
      }
      const edited: UpdateRetentionRule = {
        name: body.name,
        doc_type: body.doc_type,
        process_id: body.process_id,
        active_years: body.active_years,
        archive_years: body.archive_years,
        disposition: body.disposition,
        legal_basis: body.legal_basis,
        is_active: rule.is_active,
      };
      return api.put(`/v1/retention-rules/${rule.id}`, {
        body: edited,
        version: rule.version,
        csrfToken,
      });
    },
    invalidate: [['documents']],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function useToggleRetentionRule(): AdminAction<RetentionRule, unknown> {
  const api = useApiClient();
  return useAdminAction<RetentionRule, unknown>({
    run: (rule, csrfToken) => {
      const body: UpdateRetentionRule = {
        name: rule.name,
        doc_type: rule.doc_type,
        process_id: rule.process?.id ?? null,
        active_years: rule.active_years,
        archive_years: rule.archive_years,
        disposition: rule.disposition,
        legal_basis: rule.legal_basis,
        is_active: !rule.is_active,
      };
      return api.put(`/v1/retention-rules/${rule.id}`, { body, version: rule.version, csrfToken });
    },
    invalidate: [['documents']],
    reason: REASON,
  });
}

export function useDocumentRetention(documentId: string): UseQueryResult<DocumentRetention> {
  const api = useApiClient();
  return useQuery({
    queryKey: RETENTION_KEYS.ofDocument(documentId),
    queryFn: ({ signal }) =>
      api.get(`/v1/documents/${documentId}/retention-rule`, {
        schema: documentRetentionSchema,
        signal,
      }),
  });
}

export function useSetDocumentRule(
  documentId: string,
  onSaved: () => void,
): AdminAction<{ ruleId: string | null; version: number }, unknown> {
  const api = useApiClient();
  return useAdminAction<{ ruleId: string | null; version: number }, unknown>({
    run: ({ ruleId, version }, csrfToken) =>
      api.put(`/v1/documents/${documentId}/retention-rule`, {
        body: { retention_rule_id: ruleId },
        version,
        csrfToken,
      }),
    invalidate: [['documents']],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function useDispositions(status: string): UseQueryResult<DispositionListResponse> {
  const api = useApiClient();
  const query = queryString({ status: status === '' ? undefined : status });
  return useQuery({
    queryKey: RETENTION_KEYS.dispositions(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/dispositions?${query}`, { schema: dispositionListResponseSchema, signal }),
  });
}

export function useDisposition(id: string): UseQueryResult<DispositionProposalDetail> {
  const api = useApiClient();
  return useQuery({
    queryKey: RETENTION_KEYS.disposition(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/dispositions/${id}`, { schema: dispositionProposalDetailSchema, signal }),
  });
}

export function useProposeDispositions(
  onDone: (result: ProposeDispositionsResponse) => void,
): AdminAction<undefined, ProposeDispositionsResponse> {
  const api = useApiClient();
  return useAdminAction<undefined, ProposeDispositionsResponse>({
    run: (_args, csrfToken) =>
      api.post('/v1/dispositions/propose', {
        body: {},
        schema: proposeDispositionsResponseSchema,
        csrfToken,
      }),
    invalidate: [['documents', 'dispositions']],
    onSuccess: onDone,
    reason: REASON,
  });
}

export interface ItemDecision {
  readonly proposalId: string;
  readonly itemId: string;
  readonly version: number;
  readonly action: DispositionAction;
  readonly reason: string | null;
}

export function useItemDecision(onDone?: () => void): AdminAction<ItemDecision, unknown> {
  const api = useApiClient();
  return useAdminAction<ItemDecision, unknown>({
    run: ({ proposalId, itemId, version, action, reason }, csrfToken) =>
      api.put(`/v1/dispositions/${proposalId}/items/${itemId}`, {
        body: { action, keep_reason: reason },
        version,
        csrfToken,
      }),
    invalidate: [['documents', 'dispositions']],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

export interface DispositionStepArgs {
  readonly id: string;
  readonly version: number;
  readonly step: DispositionStep;
  readonly comment: string | null;
}

export function useDispositionStep(onDone?: () => void): AdminAction<DispositionStepArgs, unknown> {
  const api = useApiClient();
  return useAdminAction<DispositionStepArgs, unknown>({
    run: ({ id, version, step, comment }, csrfToken) =>
      api.post(`/v1/dispositions/${id}/actions/${step}`, {
        body: { comment },
        version,
        csrfToken,
      }),
    invalidate: [['documents', 'dispositions']],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

/** Pide el enlace de descarga del acta de una propuesta ejecutada. */
export function useCertificateLink(): (id: string) => Promise<DownloadLinkResponse> {
  const api = useApiClient();
  const { session } = useSession();
  return (id) =>
    api.post(`/v1/dispositions/${id}/certificate`, {
      body: {},
      schema: downloadLinkResponseSchema,
      csrfToken: session.csrf_token,
    });
}

/** Búsqueda de texto completo; con menos de dos letras no consulta. */
export function useDocumentSearch(
  q: string,
  enabled: boolean,
): UseQueryResult<DocumentSearchResponse> {
  const api = useApiClient();
  const text = q.trim();
  return useQuery({
    queryKey: RETENTION_KEYS.search(text),
    enabled: enabled && text.length >= 2,
    queryFn: ({ signal }) =>
      api.get(`/v1/documents/search?${queryString({ q: text, limit: '8' })}`, {
        schema: documentSearchResponseSchema,
        signal,
      }),
  });
}
