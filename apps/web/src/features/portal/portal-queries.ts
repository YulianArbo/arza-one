'use client';

import {
  downloadLinkResponseSchema,
  portalArticleListSchema,
  portalArticleSchema,
  portalContractListSchema,
  portalDocumentListSchema,
  portalHomeSchema,
  portalInvoiceListSchema,
  portalMyDataSchema,
  portalPqrsfListSchema,
  portalProjectDetailSchema,
  portalProjectListSchema,
  portalSignatureListSchema,
  portalTermsSchema,
  portalTicketDetailSchema,
  portalTicketListSchema,
  portalUserListSchema,
  type PortalArticle,
  type PortalArticleList,
  type PortalContractList,
  type PortalDocumentList,
  type PortalHome,
  type PortalInvoiceList,
  type PortalMyData,
  type PortalPqrsfList,
  type PortalProjectDetail,
  type PortalProjectList,
  type PortalSignatureList,
  type PortalTerms,
  type PortalTicketDetail,
  type PortalTicketList,
  type PortalUserList,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { save } from '../audit/audit-export-button';

// Consultas del portal del cliente (B30). La API filtra todo por la empresa cliente de la persona
// y es la única barrera: la pantalla solo decide qué mostrar. Toda acción del portal vuelve a pedir
// lo del portal (llave «portal»).

const PORTAL_KEY = ['portal'] as const;

function usePortalQuery<T>(path: string, schema: z.ZodType<T>, enabled = true): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...PORTAL_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function usePortalTerms(): UseQueryResult<PortalTerms> {
  return usePortalQuery('/v1/portal/terms', portalTermsSchema);
}

export function usePortalHome(): UseQueryResult<PortalHome> {
  return usePortalQuery('/v1/portal/home', portalHomeSchema);
}

export function usePortalProjects(): UseQueryResult<PortalProjectList> {
  return usePortalQuery('/v1/portal/projects', portalProjectListSchema);
}

export function usePortalProject(id: string): UseQueryResult<PortalProjectDetail> {
  return usePortalQuery(`/v1/portal/projects/${id}`, portalProjectDetailSchema);
}

export function usePortalSignatures(enabled = true): UseQueryResult<PortalSignatureList> {
  return usePortalQuery('/v1/portal/signatures', portalSignatureListSchema, enabled);
}

export function usePortalContracts(): UseQueryResult<PortalContractList> {
  return usePortalQuery('/v1/portal/contracts', portalContractListSchema);
}

export function usePortalDocuments(): UseQueryResult<PortalDocumentList> {
  return usePortalQuery('/v1/portal/documents', portalDocumentListSchema);
}

export function usePortalInvoices(): UseQueryResult<PortalInvoiceList> {
  return usePortalQuery('/v1/portal/invoices', portalInvoiceListSchema);
}

export function usePortalTickets(): UseQueryResult<PortalTicketList> {
  return usePortalQuery('/v1/portal/tickets', portalTicketListSchema);
}

export function usePortalTicket(id: string): UseQueryResult<PortalTicketDetail> {
  return usePortalQuery(`/v1/portal/tickets/${id}`, portalTicketDetailSchema);
}

export function usePortalPqrsf(): UseQueryResult<PortalPqrsfList> {
  return usePortalQuery('/v1/portal/pqrsf', portalPqrsfListSchema);
}

export function usePortalArticles(q: string): UseQueryResult<PortalArticleList> {
  const search = q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : '';
  return usePortalQuery(`/v1/portal/articles${search}`, portalArticleListSchema);
}

export function usePortalArticle(id: string): UseQueryResult<PortalArticle> {
  return usePortalQuery(`/v1/portal/articles/${id}`, portalArticleSchema);
}

export function usePortalUsers(): UseQueryResult<PortalUserList> {
  return usePortalQuery('/v1/portal/users', portalUserListSchema);
}

export function usePortalMyData(): UseQueryResult<PortalMyData> {
  return usePortalQuery('/v1/portal/me', portalMyDataSchema);
}

/** Acción del portal: vuelve a pedir lo del portal y, si hace falta, confirma la identidad. */
export function usePortalAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [PORTAL_KEY],
    reason: 'Sus acciones en el portal quedan registradas.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

export interface PortalDownload {
  /** Dirección de la API que entrega el enlace temporal. */
  readonly path: string;
  readonly fileName: string;
}

/** Pide el enlace temporal, descarga el archivo y lo guarda con su nombre; queda registrado. */
export function usePortalDownload(): AdminAction<PortalDownload, void> {
  const api = useApiClient();
  return usePortalAction<PortalDownload>(async (target, csrfToken) => {
    const link = await api.post(target.path, {
      body: {},
      schema: downloadLinkResponseSchema,
      csrfToken,
    });
    save({ fileName: target.fileName, content: await api.fetchFile(link.url) });
  });
}
