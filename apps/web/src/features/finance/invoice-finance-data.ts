import {
  billableMilestonesResponseSchema,
  invoiceListResponseSchema,
  type BillableMilestone,
  type InvoiceListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';

const FINANCE_KEY = ['finance', 'invoices'] as const;

interface FinanceData {
  readonly invoices: UseQueryResult<InvoiceListResponse>;
  readonly milestones: UseQueryResult<{ readonly data: BillableMilestone[] }>;
}

export function useFinanceData(): FinanceData {
  const api = useApiClient();
  const invoices = useQuery({
    queryKey: FINANCE_KEY,
    queryFn: ({ signal }) =>
      api.get('/v1/finance/invoices', { schema: invoiceListResponseSchema, signal }),
  });
  const milestones = useQuery({
    queryKey: [...FINANCE_KEY, 'billable-milestones'],
    queryFn: ({ signal }) =>
      api.get('/v1/finance/invoices/billable-milestones', {
        schema: billableMilestonesResponseSchema,
        signal,
      }),
  });
  return { invoices, milestones };
}

export function useFinanceAction<TArgs>(
  run: (args: TArgs, csrfToken: string) => Promise<unknown>,
  onSuccess?: () => void,
): AdminAction<TArgs, unknown> {
  return useAdminAction({
    run,
    invalidate: [FINANCE_KEY, [...FINANCE_KEY, 'billable-milestones']],
    reason: 'Los cambios de facturación y recaudo quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}
