'use client';

import {
  createdResponseSchema,
  downloadLinkResponseSchema,
  formPreviewResponseSchema,
  formRecordListResponseSchema,
  formRecordSchema,
  formTemplateListResponseSchema,
  formTemplateSchema,
  outputTemplateListResponseSchema,
  outputTemplateSchema,
  type FormEntityType,
  type CreateFormTemplate,
  type CreateOutputTemplate,
  type DownloadLinkResponse,
  type FormPreviewResponse,
  type FormRecord,
  type FormRecordListResponse,
  type FormRecordStep,
  type FormTemplate,
  type FormTemplateListResponse,
  type OutputTemplate,
  type OutputTemplateListResponse,
  type UpdateFormTemplate,
  type UpdateOutputTemplate,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';
import { useSession } from '../session/session-provider';

// Consultas y acciones de los formatos digitales (B20): formatos, registros diligenciados y
// plantillas de salida. La API revisa el permiso, el aislamiento y los datos en cada una.

const KEYS = {
  templates: (filters: string) => ['forms', 'templates', filters] as const,
  template: (id: string) => ['forms', 'templates', id] as const,
  preview: (kind: string, id: string) => ['forms', kind, id, 'preview'] as const,
  records: (filters: string) => ['forms', 'records', filters] as const,
  record: (id: string) => ['forms', 'records', id] as const,
  outputs: ['forms', 'outputs'] as const,
  output: (id: string) => ['forms', 'outputs', id] as const,
};

const REASON = 'Los formatos y sus registros quedan en la auditoría.';
const FORMS: readonly (readonly string[])[] = [['forms']];

export interface TemplateFilters {
  readonly code?: string;
  readonly fillable?: boolean;
}

export function useFormTemplates(
  filters: TemplateFilters = {},
): UseQueryResult<FormTemplateListResponse> {
  const api = useApiClient();
  const query = queryString({
    code: filters.code,
    fillable: filters.fillable === undefined ? undefined : String(filters.fillable),
  });
  return useQuery({
    queryKey: KEYS.templates(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/form-templates?${query}`, { schema: formTemplateListResponseSchema, signal }),
  });
}

export function useFormTemplate(id: string | null): UseQueryResult<FormTemplate> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.template(id ?? ''),
    enabled: id !== null,
    queryFn: ({ signal }) =>
      api.get(`/v1/form-templates/${id ?? ''}`, { schema: formTemplateSchema, signal }),
  });
}

/** Vista previa de un formato o de una plantilla de salida, como HTML completo. */
export function usePreview(
  kind: 'form-templates' | 'output-templates',
  id: string,
): UseQueryResult<FormPreviewResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.preview(kind, id),
    queryFn: ({ signal }) =>
      api.get(`/v1/${kind}/${id}/preview`, { schema: formPreviewResponseSchema, signal }),
  });
}

export function useCreateFormTemplate(
  onSaved: (id: string) => void,
): AdminAction<CreateFormTemplate, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreateFormTemplate, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/form-templates', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: FORMS,
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

export function useUpdateFormTemplate(
  target: { readonly id: string; readonly version: number },
  onSaved: () => void,
): AdminAction<UpdateFormTemplate, unknown> {
  const api = useApiClient();
  return useAdminAction<UpdateFormTemplate, unknown>({
    run: (body, csrfToken) =>
      api.patch(`/v1/form-templates/${target.id}`, { body, version: target.version, csrfToken }),
    invalidate: FORMS,
    onSuccess: onSaved,
    reason: REASON,
  });
}

/** Publicar o retirar un formato. */
export function useTemplateAction(
  action: 'publish' | 'retire',
): AdminAction<{ readonly id: string; readonly version: number }, unknown> {
  const api = useApiClient();
  return useAdminAction<{ readonly id: string; readonly version: number }, unknown>({
    run: ({ id, version }, csrfToken) =>
      api.post(`/v1/form-templates/${id}/actions/${action}`, { body: {}, version, csrfToken }),
    invalidate: FORMS,
    reason: REASON,
  });
}

export interface RecordFilters {
  readonly templateCode?: string;
  readonly status?: string;
  readonly entityType?: string;
  readonly entityId?: string;
}

export function useFormRecords(
  filters: RecordFilters = {},
): UseQueryResult<FormRecordListResponse> {
  const api = useApiClient();
  const query = queryString({
    template_code: filters.templateCode,
    status: filters.status,
    entity_type: filters.entityType,
    entity_id: filters.entityId,
  });
  return useQuery({
    queryKey: KEYS.records(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/form-records?${query}`, { schema: formRecordListResponseSchema, signal }),
  });
}

export function useFormRecord(id: string): UseQueryResult<FormRecord> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.record(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/form-records/${id}`, { schema: formRecordSchema, signal }),
  });
}

/** Registro nuevo: los valores se validan en la pantalla y de nuevo en la API. */
export interface NewRecord {
  readonly template_id: string;
  readonly data: Record<string, unknown>;
  readonly entity_type: FormEntityType | null;
  readonly entity_id: string | null;
}

export function useCreateFormRecord(
  onSaved: (id: string) => void,
): AdminAction<NewRecord, { id: string }> {
  const api = useApiClient();
  return useAdminAction<NewRecord, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/form-records', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: FORMS,
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

export interface SaveRecord {
  readonly id: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
}

export function useSaveFormRecord(onSaved?: () => void): AdminAction<SaveRecord, unknown> {
  const api = useApiClient();
  return useAdminAction<SaveRecord, unknown>({
    run: ({ id, version, data }, csrfToken) =>
      api.patch(`/v1/form-records/${id}`, { body: { data }, version, csrfToken }),
    invalidate: FORMS,
    ...(onSaved === undefined ? {} : { onSuccess: onSaved }),
    reason: REASON,
  });
}

export interface RecordStep {
  readonly id: string;
  readonly version: number;
  readonly step: FormRecordStep;
  readonly comment: string | null;
}

export function useRecordStep(onDone?: () => void): AdminAction<RecordStep, unknown> {
  const api = useApiClient();
  return useAdminAction<RecordStep, unknown>({
    run: ({ id, version, step, comment }, csrfToken) =>
      api.post(`/v1/form-records/${id}/actions/${step}`, { body: { comment }, version, csrfToken }),
    invalidate: FORMS,
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

/** Pide el enlace de descarga del PDF de un registro terminado. */
export function useRecordPdfLink(): (id: string) => Promise<DownloadLinkResponse> {
  const api = useApiClient();
  const { session } = useSession();
  return (id) =>
    api.post(`/v1/form-records/${id}/pdf`, {
      body: {},
      schema: downloadLinkResponseSchema,
      csrfToken: session.csrf_token,
    });
}

export function useOutputTemplates(): UseQueryResult<OutputTemplateListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.outputs,
    queryFn: ({ signal }) =>
      api.get('/v1/output-templates', { schema: outputTemplateListResponseSchema, signal }),
  });
}

export function useOutputTemplate(id: string): UseQueryResult<OutputTemplate> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.output(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/output-templates/${id}`, { schema: outputTemplateSchema, signal }),
  });
}

export function useCreateOutputTemplate(
  onSaved: (id: string) => void,
): AdminAction<CreateOutputTemplate, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreateOutputTemplate, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/output-templates', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: FORMS,
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

export function useUpdateOutputTemplate(
  target: { readonly id: string; readonly version: number },
  onSaved: () => void,
): AdminAction<UpdateOutputTemplate, unknown> {
  const api = useApiClient();
  return useAdminAction<UpdateOutputTemplate, unknown>({
    run: (body, csrfToken) =>
      api.patch(`/v1/output-templates/${target.id}`, { body, version: target.version, csrfToken }),
    invalidate: FORMS,
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function usePublishOutputTemplate(): AdminAction<
  { readonly id: string; readonly version: number },
  unknown
> {
  const api = useApiClient();
  return useAdminAction<{ readonly id: string; readonly version: number }, unknown>({
    run: ({ id, version }, csrfToken) =>
      api.post(`/v1/output-templates/${id}/actions/publish`, { body: {}, version, csrfToken }),
    invalidate: FORMS,
    reason: REASON,
  });
}
