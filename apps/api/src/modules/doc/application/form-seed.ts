import { htmlTemplateVariables } from '@arza/templates';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { seedPublishedFlow } from '../../wf/index.js';
import { FORM_FLOW_DATA } from '../domain/form-flows.js';
import {
  CHANGE_REQUEST_FORM_CODE,
  CHANGE_REQUEST_OUTPUT_BODY,
  PILOT_FORMS,
  type PilotForm,
} from '../domain/pilot-forms.js';
import { auditDoc, type DocActor } from './doc-support.js';

// Semilla de los formatos digitales (B20): los flujos de aprobación de los registros, la plantilla
// de salida del FT-SGC-001 y los cinco formatos piloto, publicados en cada empresa la primera vez.
// Si un código ya existe, no lo toca: Calidad pudo haberlo cambiado.

async function seedOutputTemplate(tx: TenantTransaction, actor: DocActor): Promise<void> {
  const exists = await tx.docOutputTemplate.count({ where: { code: CHANGE_REQUEST_FORM_CODE } });
  if (exists > 0) return;
  const created = await tx.docOutputTemplate.create({
    data: {
      tenantId: actor.tenantId,
      code: CHANGE_REQUEST_FORM_CODE,
      name: 'Solicitud de Acción Documental',
      engine: 'html',
      outputVersion: 1,
      status: 'published',
      body: CHANGE_REQUEST_OUTPUT_BODY,
      variables: htmlTemplateVariables(CHANGE_REQUEST_OUTPUT_BODY),
      publishedAt: actor.at,
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.output_template.seed',
    entityType: 'doc_output_template',
    entityId: created.id,
    changes: { code: created.code, output_version: 1 },
  });
}

async function seedForm(tx: TenantTransaction, actor: DocActor, pilot: PilotForm): Promise<void> {
  const { template } = pilot;
  if ((await tx.docFormTemplate.count({ where: { code: template.code } })) > 0) return;
  const [document, output] = await Promise.all([
    tx.docDocument.findFirst({ where: { code: template.code, deletedAt: null } }),
    pilot.outputCode === null
      ? null
      : tx.docOutputTemplate.findFirst({ where: { code: pilot.outputCode, status: 'published' } }),
  ]);
  const created = await tx.docFormTemplate.create({
    data: {
      tenantId: actor.tenantId,
      code: template.code,
      name: template.name,
      formVersion: 1,
      status: 'published',
      fillMode: pilot.fillMode,
      definition: { ...template.definition },
      layout: { ...template.layout },
      documentId: document?.id ?? null,
      outputTemplateId: output?.id ?? null,
      workflowKey: template.workflow_key,
      classification: template.classification,
      entityType: template.entity_type,
      publishedAt: actor.at,
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.form_template.seed',
    entityType: 'doc_form_template',
    entityId: created.id,
    changes: { code: created.code, form_version: 1, fill_mode: created.fillMode },
  });
}

/** Publica los flujos, la plantilla y los formatos piloto en cada empresa que aún no los tiene. */
export async function seedDocForms(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor: DocActor = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      for (const flow of FORM_FLOW_DATA) await seedPublishedFlow(tx, actor, flow);
      await seedOutputTemplate(tx, actor);
      for (const pilot of PILOT_FORMS) await seedForm(tx, actor, pilot);
    });
  }
}
