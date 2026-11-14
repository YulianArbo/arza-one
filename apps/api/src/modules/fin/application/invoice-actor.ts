import type { Principal } from '../../../platform/access/principal.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

export interface InvoiceActor {
  readonly principal: Principal;
  readonly meta: RequestMeta;
}
