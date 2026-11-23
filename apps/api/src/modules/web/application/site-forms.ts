import { Inject, Injectable } from '@nestjs/common';
import {
  QUOTE_TIMEFRAMES,
  SITE_SERVICES,
  type ContactForm,
  type CreateLeadRequest,
  type FormNotice,
  type FormReceipt,
  type PublicFormInfo,
  type QuoteForm,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, nextBusinessCode } from '../../core/index.js';
import { captureSiteLead } from '../../crm/index.js';
import { publishedAuthorizationNotices } from '../../privacy/index.js';
import {
  formUnavailable,
  recordWebChange,
  siteTenantId,
  webConflict,
  type WebActor,
} from './web-support.js';

// Formularios de contacto y cotización del sitio (B41, ficha 17.18; decisión 7). Cada envío crea
// el prospecto con origen «Sitio web», su tarea «Contactar al prospecto» y la autorización con la
// versión exacta del aviso que se mostró; el acuse lo envía el worker. La casilla de autorización
// nunca viene marcada. Si el campo trampa llega lleno, se responde igual y no se guarda nada.

const NOTICE_KEY = 'authorization_contact';
const SUBMISSION_SEQUENCE = 'web.submission';
const SUBMISSIONS = { name: 'Solicitudes del sitio web', prefix: 'FRM', padding: 4 } as const;
const LEAD_SOURCE = 'WEBSITE';

type SiteForm =
  ({ readonly kind: 'contact' } & ContactForm) | ({ readonly kind: 'quote' } & QuoteForm);

async function formNotice(tx: TenantTransaction): Promise<FormNotice | null> {
  const notices = await publishedAuthorizationNotices(tx);
  const notice = notices.find((item) => item.key === NOTICE_KEY);
  if (notice === undefined) return null;
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    version_number: notice.version_number,
    purposes: notice.purposes,
  };
}

/** La necesidad que verá Comercial en el prospecto. */
function needOf(form: SiteForm): string {
  if (form.kind === 'contact') return `Mensaje del sitio web: ${form.message}`;
  const service = SITE_SERVICES[form.service];
  const timeframe = QUOTE_TIMEFRAMES[form.timeframe];
  return `Cotización de ${service} (${timeframe.toLowerCase()}): ${form.description}`;
}

function submissionData(form: SiteForm): Prisma.InputJsonObject {
  const base = {
    first_name: form.first_name,
    last_name: form.last_name,
    phone: form.phone,
    company: form.company,
  };
  if (form.kind === 'contact') return { ...base, detail: form.message };
  return {
    ...base,
    detail: form.description,
    service: form.service,
    timeframe: form.timeframe,
  };
}

function leadRequest(form: SiteForm, notice: FormNotice, at: Date): CreateLeadRequest {
  return {
    party_id: null,
    person: {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email.toLowerCase(),
      phone: form.phone,
    },
    company_name: form.company,
    need: needOf(form),
    source: LEAD_SOURCE,
    campaign_id: null,
    owner_id: null,
    consent: {
      notice_id: notice.id,
      accepted: true,
      purposes: notice.purposes,
      channel: 'digital',
      granted_on: bogotaToday(at),
      evidence_file_id: null,
    },
  };
}

async function fileSubmission(tx: TenantTransaction, actor: WebActor, form: SiteForm) {
  const notice = await formNotice(tx);
  if (notice === null) throw formUnavailable();
  if (notice.id !== form.notice_id) {
    throw webConflict('El texto de autorización cambió. Recargue la página y léalo de nuevo.');
  }
  const lead = await captureSiteLead(tx, actor, leadRequest(form, notice, actor.at));
  const row = await tx.webFormSubmission.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, SUBMISSION_SEQUENCE, actor.at, SUBMISSIONS),
      formKey: form.kind,
      email: form.email.toLowerCase(),
      data: submissionData(form),
      noticeId: notice.id,
      noticeVersion: notice.version_number,
      consentId: lead.consentId,
      ip: actor.meta?.ip ?? null,
      userAgent: actor.meta?.userAgent ?? null,
      createdLeadId: lead.id,
      createdLeadCode: lead.code,
      receivedAt: actor.at,
    },
  });
  await recordWebChange(tx, actor, {
    action: 'web.form.submit',
    event: 'web.form.submitted',
    entityType: 'web_form_submission',
    entityId: row.id,
    changes: { code: row.code, form_key: row.formKey, lead_code: lead.code },
  });
  return row;
}

@Injectable()
export class SiteForms {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Pick<Env, 'PUBLIC_SITE_TAX_ID'>,
  ) {}

  /** El aviso que acompaña al formulario; sin empresa o sin aviso, no está disponible. */
  async info(): Promise<PublicFormInfo> {
    const tenantId = await siteTenantId(this.database, this.config);
    if (tenantId === null) return { available: false, notice: null };
    const notice = await this.database.withTenant({ tenantId, userId: null }, formNotice);
    return { available: notice !== null, notice };
  }

  async contact(input: ContactForm, meta: RequestMeta): Promise<FormReceipt> {
    return this.submit({ kind: 'contact', ...input }, meta);
  }

  async quote(input: QuoteForm, meta: RequestMeta): Promise<FormReceipt> {
    return this.submit({ kind: 'quote', ...input }, meta);
  }

  private async submit(form: SiteForm, meta: RequestMeta): Promise<FormReceipt> {
    const at = this.clock.now();
    if (form.nickname !== '') return robotReceipt(at);
    const tenantId = await siteTenantId(this.database, this.config);
    if (tenantId === null) throw formUnavailable();
    const actor: WebActor = { tenantId, userId: null, at, meta };
    const row = await this.database.withTenant({ tenantId, userId: null }, (tx) =>
      fileSubmission(tx, actor, form),
    );
    return { code: row.code, received_at: row.receivedAt.toISOString() };
  }
}

/** Al robot se le responde como a una persona, sin guardar nada (decisión 8). */
function robotReceipt(at: Date): FormReceipt {
  return { code: `FRM-${String(at.getUTCFullYear())}-0000`, received_at: at.toISOString() };
}
