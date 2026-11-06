import { z } from 'zod';

import {
  calendarDateSchema,
  dateTimeSchema,
  moneySchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { optionalText, requiredText } from '../contract/common.js';
import {
  ACCEPTANCE_RULES,
  checkAnswerSchema,
  CODE_REVIEW_CHECKLIST,
  deliveryEnvironmentSchema,
  incidentKindSchema,
  incidentSeveritySchema,
  incidentStatusSchema,
  reviewResultSchema,
  projectRiskLevelSchema,
  riskStatusSchema,
} from './common.js';
import { projectProgressSchema } from './projects.js';

// Control del proyecto (B27, ficha 17.8): riesgos, liberaciones, revisiones de código (FT-TEC-002),
// incidentes (FT-TEC-004), la configuración de las actas y del costo, los indicadores de avance,
// desviación y rentabilidad, y el cierre.

const httpsUrl = z
  .url({ protocol: /^https$/u, error: 'Escriba el enlace completo, que empiece por https://' })
  .max(500);

const scaleSchema = z
  .number()
  .int('Elija un valor de 1 a 5.')
  .min(1, 'Elija un valor de 1 a 5.')
  .max(5, 'Elija un valor de 1 a 5.');

// Riesgos -------------------------------------------------------------------------------------

export const riskRequestSchema = z.strictObject({
  description: requiredText(3, 1000, 'Describa el riesgo.'),
  probability: scaleSchema.describe('Probabilidad, de 1 (rara) a 5 (casi segura)'),
  impact: scaleSchema.describe('Impacto, de 1 (menor) a 5 (grave)'),
  response: optionalText(2000).describe('Qué se hará para tratarlo'),
  owner_id: z.uuid().describe('Responsable: miembro del equipo'),
  status: riskStatusSchema.default('open'),
});

export const riskSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  probability: z.number().int(),
  impact: z.number().int(),
  level: projectRiskLevelSchema,
  response: z.string().nullable(),
  owner: personRefSchema.nullable(),
  status: riskStatusSchema,
  version: versionSchema,
});

// Liberaciones --------------------------------------------------------------------------------

export const releaseRequestSchema = z.strictObject({
  version_label: requiredText(1, 40, 'Escriba la versión, como 1.2.0.'),
  environment: deliveryEnvironmentSchema,
  released_on: calendarDateSchema.describe('Fecha de la liberación'),
  notes: requiredText(3, 4000, 'Escriba qué cambia en esta versión.'),
  test_report_file_id: z
    .uuid()
    .describe('Informe de pruebas en PDF que usted subió (PR-TEC-003); obligatorio'),
});

export const releaseSchema = z.object({
  id: z.uuid(),
  version_label: z.string(),
  environment: deliveryEnvironmentSchema,
  released_on: calendarDateSchema,
  notes: z.string(),
  test_report: z.object({ id: z.uuid(), file_name: z.string() }).nullable(),
  released_by: personRefSchema.nullable(),
});

// Revisiones de código (FT-TEC-002) ------------------------------------------------------------

export const codeReviewRequestSchema = z.strictObject({
  item_id: z.uuid().describe('Ítem revisado'),
  reference_url: httpsUrl.describe('Enlace a la solicitud de cambios en el repositorio'),
  answers: z
    .array(checkAnswerSchema)
    .length(CODE_REVIEW_CHECKLIST.length, 'Responda todos los puntos de la lista.')
    .describe('Respuesta a cada punto de CODE_REVIEW_CHECKLIST, en su orden'),
  result: reviewResultSchema,
  notes: optionalText(2000).describe('Observaciones'),
});

export const codeReviewSchema = z.object({
  id: z.uuid(),
  item: z.object({ id: z.uuid(), number: z.number().int(), title: z.string() }),
  reference_url: z.string(),
  reviewer: personRefSchema.nullable(),
  answers: z.array(checkAnswerSchema),
  result: reviewResultSchema,
  notes: z.string().nullable(),
  record_code: z.string().nullable().describe('Código del registro FT-TEC-002'),
  created_at: dateTimeSchema,
});

export const codeReviewListQuerySchema = z.strictObject({
  item_id: z.uuid().optional(),
});

// Incidentes (FT-TEC-004) ---------------------------------------------------------------------

export const incidentRequestSchema = z.strictObject({
  title: requiredText(3, 160, 'Escriba un título corto.'),
  kind: incidentKindSchema,
  severity: incidentSeveritySchema,
  description: requiredText(3, 4000, 'Describa qué pasó.'),
  detected_at: dateTimeSchema.describe('Cuándo se detectó'),
  personal_data: z
    .boolean()
    .default(false)
    .describe('Se comprometieron datos personales: se avisa al Oficial de datos'),
});

export const resolveIncidentRequestSchema = z.strictObject({
  resolved_at: dateTimeSchema,
  root_cause: requiredText(3, 4000, 'Escriba la causa raíz.'),
  actions: requiredText(3, 4000, 'Escriba qué se hizo y qué se hará para que no se repita.'),
});

export const incidentSchema = z.object({
  id: z.uuid(),
  code: z.string().describe('INC-AAAA-NNNN'),
  title: z.string(),
  kind: incidentKindSchema,
  severity: incidentSeveritySchema,
  description: z.string(),
  detected_at: dateTimeSchema,
  personal_data: z.boolean(),
  status: incidentStatusSchema,
  resolved_at: dateTimeSchema.nullable(),
  root_cause: z.string().nullable(),
  actions: z.string().nullable(),
  reported_by: personRefSchema.nullable(),
  version: versionSchema,
});

// Configuración, indicadores y cierre ----------------------------------------------------------

export const controlSettingsRequestSchema = z
  .strictObject({
    hour_cost: moneySchema
      .nullable()
      .default(null)
      .describe('Costo promedio de una hora del equipo, para la rentabilidad'),
    respond_days: z
      .number()
      .int()
      .min(ACCEPTANCE_RULES.minDays, 'El plazo va de 1 a 30 días.')
      .max(ACCEPTANCE_RULES.maxDays, 'El plazo va de 1 a 30 días.')
      .describe('Días que tiene el cliente para responder un acta'),
    tacit_acceptance: z.boolean().describe('El contrato prevé la aceptación tácita'),
    tacit_clause: optionalText(300).describe('Cláusula del contrato que la prevé'),
  })
  .refine((value) => !value.tacit_acceptance || value.tacit_clause !== null, {
    path: ['tacit_clause'],
    message: 'Indique la cláusula del contrato que prevé la aceptación tácita.',
  });

export const closeProjectRequestSchema = z.strictObject({
  lessons: requiredText(3, 4000, 'Escriba las lecciones aprendidas del proyecto.'),
});

export const indicatorsSchema = z.object({
  progress: projectProgressSchema,
  hours: z.object({
    budget: z.number(),
    logged: z.number().describe('Todas las registradas'),
    approved: z.number(),
    billable: z.number().describe('De las aprobadas, las que se cobran'),
    pending: z.number().describe('Por aprobar'),
    used_pct: z.number().int().describe('Aprobadas sobre presupuesto'),
  }),
  schedule: z.object({
    elapsed_pct: z.number().int().describe('Tiempo transcurrido del proyecto'),
    deviation_pts: z
      .number()
      .int()
      .describe('Avance menos tiempo transcurrido: negativo es retraso'),
  }),
  money: z
    .object({
      income: moneySchema.describe('Valor del contrato o presupuesto en pesos'),
      cost: moneySchema.describe('Horas aprobadas por el costo de la hora'),
      margin: z.string().describe('Ingreso menos costo, en pesos; puede ser negativo'),
      margin_pct: z.number().int().nullable(),
    })
    .nullable()
    .describe('Solo para quien ve la rentabilidad y con el costo de la hora definido'),
  deliverables: z.object({
    total: z.number().int(),
    accepted: z.number().int(),
    waiting: z.number().int().describe('Entregados, esperando al cliente'),
  }),
  risks_high: z.number().int().describe('Riesgos altos sin cerrar'),
  incidents_open: z.number().int(),
});

export type RiskRequest = z.infer<typeof riskRequestSchema>;
export type ProjectRisk = z.infer<typeof riskSchema>;
export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;
export type ProjectRelease = z.infer<typeof releaseSchema>;
export type CodeReviewRequest = z.infer<typeof codeReviewRequestSchema>;
export type CodeReview = z.infer<typeof codeReviewSchema>;
export type CodeReviewListQuery = z.infer<typeof codeReviewListQuerySchema>;
export type IncidentRequest = z.infer<typeof incidentRequestSchema>;
export type ResolveIncidentRequest = z.infer<typeof resolveIncidentRequestSchema>;
export type ProjectIncident = z.infer<typeof incidentSchema>;
export type ControlSettingsRequest = z.infer<typeof controlSettingsRequestSchema>;
export type CloseProjectRequest = z.infer<typeof closeProjectRequestSchema>;
export type ProjectIndicators = z.infer<typeof indicatorsSchema>;

export const riskListResponseSchema = z.object({ data: z.array(riskSchema) });
export const releaseListResponseSchema = z.object({ data: z.array(releaseSchema) });
export const codeReviewListResponseSchema = z.object({ data: z.array(codeReviewSchema) });
export const incidentListResponseSchema = z.object({ data: z.array(incidentSchema) });
