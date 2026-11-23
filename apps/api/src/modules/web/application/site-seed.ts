import { LEGAL_TEXT_KINDS, type LegalTextKey } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { recordWebChange, type WebActor } from './web-support.js';

// Semilla del sitio (B41, decisión 11). El repositorio no tiene los textos oficiales: cada empresa
// nace con un borrador provisional por clase de texto, marcado «PENDIENTE DE CONCEPTO JURÍDICO».
// Solo en las empresas ficticias se aprueban y publican (excepto los términos de la plataforma, que
// quedan en borrador para probar su publicación) y se publica una página «Nosotros» de ejemplo.
// Crea lo que falta, así que se puede correr de nuevo.

const KEYS = Object.keys(LEGAL_TEXT_KINDS) as LegalTextKey[];

function provisionalBody(key: LegalTextKey): string {
  const label = LEGAL_TEXT_KINDS[key].label;
  return [
    'PENDIENTE DE CONCEPTO JURÍDICO.',
    `Texto provisional de «${label}». Antes de publicarlo en producción debe reemplazarse por el ` +
      'texto oficial aprobado por el asesor jurídico (numeral 20.5).',
    '## Contenido mínimo',
    '- Identificación de la empresa y medios de contacto.',
    '- Alcance, derechos y deberes según el numeral 20.2 del Manual Maestro.',
    '- Ley aplicable y forma de presentar consultas.',
  ].join('\n\n');
}

const DEMO_PAGE = {
  slug: 'nosotros',
  title: 'Nosotros',
  summary: 'Quiénes somos y cómo trabajamos.',
  body: [
    'Texto de demostración de la página «Nosotros». El equipo de la empresa lo reemplaza desde la plataforma.',
    '## Cómo trabajamos',
    '- Escuchamos su necesidad antes de proponer.',
    '- Entregamos por etapas, con avances que usted puede revisar.',
    '- Acompañamos después de la entrega.',
  ].join('\n\n'),
};

function systemActor(tenantId: string, clock: Clock): WebActor {
  return { tenantId, userId: null, at: clock.now(), meta: null };
}

async function seedDraft(tx: TenantTransaction, actor: WebActor, key: LegalTextKey) {
  if ((await tx.webLegalText.count({ where: { key } })) > 0) return;
  const row = await tx.webLegalText.create({
    data: {
      tenantId: actor.tenantId,
      key,
      versionNumber: 1,
      title: LEGAL_TEXT_KINDS[key].label,
      body: provisionalBody(key),
    },
  });
  await recordWebChange(tx, actor, {
    action: 'web.legal_text.create',
    event: 'web.legal.created',
    entityType: 'web_legal_text',
    entityId: row.id,
    changes: { key, version_number: 1, seed: true },
  });
}

export async function seedSiteTexts(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor = systemActor(tenantId, clock);
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      for (const key of KEYS) await seedDraft(tx, actor, key);
    });
  }
}

/** Publica el borrador provisional, aprobado por una persona de la Dirección de la empresa. */
async function publishDemoText(
  tx: TenantTransaction,
  actor: WebActor,
  key: LegalTextKey,
  approverId: string,
) {
  const draft = await tx.webLegalText.findFirst({ where: { key, status: 'draft' } });
  const published = await tx.webLegalText.count({ where: { key, status: 'published' } });
  if (draft === null || published > 0) return;
  await tx.webLegalText.update({
    where: { id: draft.id },
    data: {
      status: 'published',
      approvedBy: approverId,
      approvedAt: actor.at,
      effectiveFrom: actor.at,
    },
  });
  await recordWebChange(tx, actor, {
    action: 'web.legal_text.publish',
    event: 'web.legal.published',
    entityType: 'web_legal_text',
    entityId: draft.id,
    changes: { key, version_number: draft.versionNumber, seed: true },
  });
}

async function seedDemoPage(tx: TenantTransaction, actor: WebActor) {
  if ((await tx.webPage.count({ where: { slug: DEMO_PAGE.slug } })) > 0) return;
  const row = await tx.webPage.create({
    data: {
      tenantId: actor.tenantId,
      ...DEMO_PAGE,
      status: 'published',
      publishedAt: actor.at,
    },
  });
  await recordWebChange(tx, actor, {
    action: 'web.page.create',
    event: 'web.page.created',
    entityType: 'web_page',
    entityId: row.id,
    changes: { slug: row.slug, title: row.title, seed: true },
  });
}

export async function seedSiteDemo(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor = systemActor(tenantId, clock);
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      const [approverId] = await activeUsersWithRoles(tx, ['DIRECCION'], actor.at);
      if (approverId !== undefined) {
        for (const key of KEYS) {
          if (key !== 'platform_terms') await publishDemoText(tx, actor, key, approverId);
        }
      }
      await seedDemoPage(tx, actor);
    });
  }
}
