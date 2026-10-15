import { z } from 'zod';

import { permissionCodeSchema } from '../iam/access.js';

// Contratos de las definiciones de flujo (M04, B15; ADR-011): estados, transiciones, permisos,
// condiciones y plazos guardados como datos que interpreta un solo motor.

export const WF_ERROR_CODES = {
  definitionNotFound: 'WF_DEFINITION_NOT_FOUND',
  definitionInvalid: 'WF_DEFINITION_INVALID',
  definitionNotDraft: 'WF_DEFINITION_NOT_DRAFT',
  definitionKeyTaken: 'WF_DEFINITION_KEY_TAKEN',
  draftExists: 'WF_DRAFT_EXISTS',
  noPublishedVersion: 'WF_NO_PUBLISHED_VERSION',
  instanceNotFound: 'WF_INSTANCE_NOT_FOUND',
  instanceActive: 'WF_INSTANCE_ACTIVE',
  transitionNotAllowed: 'WF_TRANSITION_NOT_ALLOWED',
  conditionNotMet: 'WF_CONDITION_NOT_MET',
  commentRequired: 'WF_COMMENT_REQUIRED',
  taskNotFound: 'WF_TASK_NOT_FOUND',
  taskClosed: 'WF_TASK_CLOSED',
  taskActionNotAllowed: 'WF_TASK_ACTION_NOT_ALLOWED',
  personInvalid: 'WF_PERSON_INVALID',
} as const;

/** Clave de un estado, de una acción o de un dato: minúsculas, números y guion bajo. */
export const wfKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Use minúsculas, números y guion bajo, sin espacios');

/** Clave de un flujo o de un tipo de registro: como «doc.change_request». */
export const wfDottedKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/,
    'Use minúsculas, números, guion bajo y puntos, sin espacios',
  )
  .min(3)
  .max(60);

/** Código de un rol del sistema o propio, como «CALIDAD». */
export const roleCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'Código de rol no válido');

export const stateKindSchema = z
  .enum(['initial', 'normal', 'approval', 'final'])
  .describe('Inicial, normal, de aprobación o final');

export const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

/**
 * Quién atiende un estado o aprueba: quien inició el trámite, su jefe inmediato o las personas
 * con un rol.
 */
export const participantSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('initiator') }),
  z.strictObject({ type: z.literal('supervisor') }),
  z.strictObject({ type: z.literal('role'), role: roleCodeSchema }),
]);

export const approvalConfigSchema = z.strictObject({
  mode: z.enum(['serial', 'parallel']).describe('En serie (uno tras otro) o en paralelo'),
  approvers: z.array(participantSchema).min(1).max(10),
});

/** Valor de una condición: texto, número o sí/no; para «in», una lista. */
const scalarSchema = z.union([z.string().max(200), z.number(), z.boolean()]);

export const conditionRuleSchema = z.strictObject({
  fact: wfKeySchema.describe('Dato del registro que entrega su módulo, como «amount»'),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in']),
  value: z.union([scalarSchema, z.array(z.union([z.string().max(200), z.number()])).max(50)]),
});

/** Todas las reglas deben cumplirse. Nunca es código: solo comparaciones con datos. */
export const conditionSchema = z.array(conditionRuleSchema).min(1).max(10);

export const stateInputSchema = z.strictObject({
  key: wfKeySchema,
  label: z.string().trim().min(1).max(80),
  kind: stateKindSchema,
  sla_hours: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .nullable()
    .describe('Plazo en horas hábiles para salir del estado'),
  priority: taskPrioritySchema,
  assignee: participantSchema.nullable().describe('Quién atiende un estado normal'),
  approval: approvalConfigSchema.nullable().describe('Solo en los estados de aprobación'),
});

export const transitionInputSchema = z.strictObject({
  from_state: wfKeySchema,
  to_state: wfKeySchema,
  action: wfKeySchema,
  label: z.string().trim().min(1).max(80),
  required_permission: permissionCodeSchema.nullable(),
  condition: conditionSchema.nullable(),
  requires_comment: z.boolean(),
});

export type ConditionRule = z.infer<typeof conditionRuleSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type StateInput = z.infer<typeof stateInputSchema>;
export type TransitionInput = z.infer<typeof transitionInputSchema>;

/** Acciones reservadas de un estado de aprobación: las ejecuta el motor con las decisiones. */
export const APPROVAL_ACTIONS = { approve: 'approve', reject: 'reject' } as const;

export interface DefinitionShape {
  readonly states: readonly StateInput[];
  readonly transitions: readonly TransitionInput[];
}

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function stateProblems(state: StateInput): string[] {
  const problems: string[] = [];
  const name = `«${state.label}»`;
  if (state.kind === 'approval' && (state.approval?.approvers.length ?? 0) === 0) {
    problems.push(`El estado ${name} es de aprobación y no dice quién aprueba.`);
  }
  if (state.kind !== 'approval' && state.approval !== null) {
    problems.push(`Solo los estados de aprobación llevan aprobadores (${name}).`);
  }
  if (state.kind !== 'normal' && state.kind !== 'initial' && state.assignee !== null) {
    problems.push(`Solo los estados normales tienen responsable (${name}).`);
  }
  if (state.kind === 'final' && state.sla_hours !== null) {
    problems.push(`Un estado final no tiene plazo (${name}).`);
  }
  return problems;
}

function reachable(shape: DefinitionShape, initial: string): Set<string> {
  const seen = new Set([initial]);
  const pending = [initial];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const transition of shape.transitions) {
      if (transition.from_state === current && !seen.has(transition.to_state)) {
        seen.add(transition.to_state);
        pending.push(transition.to_state);
      }
    }
  }
  return seen;
}

function transitionProblems(shape: DefinitionShape, kinds: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const transition of shape.transitions) {
    const name = `«${transition.label}»`;
    if (!kinds.has(transition.from_state) || !kinds.has(transition.to_state)) {
      problems.push(`La transición ${name} usa un estado que no existe.`);
    } else if (kinds.get(transition.from_state) === 'final') {
      problems.push(`La transición ${name} sale de un estado final.`);
    }
  }
  const pairs = shape.transitions.map((t) => `${t.from_state} ${t.action}`);
  if (duplicates(pairs).length > 0) {
    problems.push('Un mismo estado tiene dos transiciones con la misma acción.');
  }
  return problems;
}

function approvalProblems(shape: DefinitionShape): string[] {
  return shape.states
    .filter((state) => state.kind === 'approval')
    .flatMap((state) => {
      const actions = shape.transitions
        .filter((transition) => transition.from_state === state.key)
        .map((transition) => transition.action);
      const missing = Object.values(APPROVAL_ACTIONS).filter((action) => !actions.includes(action));
      return missing.length === 0
        ? []
        : [`El estado «${state.label}» necesita las transiciones «approve» y «reject».`];
    });
}

function graphProblems(shape: DefinitionShape, kinds: Map<string, string>): string[] {
  const initials = shape.states.filter((state) => state.kind === 'initial');
  const problems: string[] = [];
  if (initials.length !== 1) problems.push('El flujo debe tener exactamente un estado inicial.');
  if (!shape.states.some((state) => state.kind === 'final')) {
    problems.push('El flujo debe tener al menos un estado final.');
  }
  const [initial] = initials;
  if (initial === undefined || problems.length > 0) return problems;
  const seen = reachable(shape, initial.key);
  for (const state of shape.states) {
    const exits = shape.transitions.some((transition) => transition.from_state === state.key);
    if (!seen.has(state.key)) problems.push(`No se llega al estado «${state.label}».`);
    if (kinds.get(state.key) !== 'final' && !exits) {
      problems.push(`El estado «${state.label}» no tiene salida.`);
    }
  }
  return problems;
}

/**
 * Problemas de una definición, explicados para quien la edita. Vacío si se puede publicar. Lo
 * usan la API, que no publica una definición con problemas, y el editor, que los muestra.
 */
export function definitionProblems(shape: DefinitionShape): string[] {
  const keys = shape.states.map((state) => state.key);
  if (duplicates(keys).length > 0) return ['Hay dos estados con la misma clave.'];
  const kinds = new Map(shape.states.map((state) => [state.key, state.kind]));
  return [
    ...shape.states.flatMap(stateProblems),
    ...transitionProblems(shape, kinds),
    ...approvalProblems(shape),
    ...graphProblems(shape, kinds),
  ];
}

const definitionFields = {
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable(),
  states: z.array(stateInputSchema).min(2).max(30),
  transitions: z.array(transitionInputSchema).min(1).max(100),
};

export const createDefinitionRequestSchema = z.strictObject({
  key: wfDottedKeySchema.describe('Clave estable del flujo, como «doc.change_request»'),
  entity_type: wfDottedKeySchema.describe('Tipo de registro que sigue el flujo'),
  ...definitionFields,
});

/** Edición completa de un borrador (con If-Match). */
export const updateDefinitionRequestSchema = z.strictObject(definitionFields);

export const definitionStatusSchema = z
  .enum(['draft', 'published', 'retired'])
  .describe('Borrador, publicada (vigente) o retirada');

const dateTime = z.iso.datetime({ offset: true });

export const definitionSummarySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  entity_type: z.string(),
  version: z.number().int().positive().describe('Versión del flujo: 1, 2, 3…'),
  status: definitionStatusSchema,
  published_at: dateTime.nullable(),
  updated_at: dateTime,
});

export const definitionSchema = definitionSummarySchema.extend({
  description: z.string().nullable(),
  states: z.array(stateInputSchema),
  transitions: z.array(transitionInputSchema),
  row_version: z.number().int().positive().describe('Versión del registro, para If-Match'),
  problems: z.array(z.string()).describe('Lo que impide publicarla; vacío si se puede'),
});

export const definitionListResponseSchema = z.object({
  data: z.array(definitionSummarySchema).describe('La última versión de cada flujo, por nombre'),
});

/** Datos del registro que el módulo dueño entrega para evaluar las condiciones. */
export const workflowFactsSchema = z.record(wfKeySchema, scalarSchema);

export const startTestInstanceRequestSchema = z.strictObject({
  title: z.string().trim().min(3).max(160).describe('Asunto del trámite de prueba'),
  facts: workflowFactsSchema
    .optional()
    .describe('Datos del registro para las condiciones, como {"amount": 6000000}'),
});

export type CreateDefinitionRequest = z.infer<typeof createDefinitionRequestSchema>;
export type UpdateDefinitionRequest = z.infer<typeof updateDefinitionRequestSchema>;
export type DefinitionStatus = z.infer<typeof definitionStatusSchema>;
export type DefinitionSummary = z.infer<typeof definitionSummarySchema>;
export type DefinitionView = z.infer<typeof definitionSchema>;
export type DefinitionListResponse = z.infer<typeof definitionListResponseSchema>;
export type StartTestInstanceRequest = z.infer<typeof startTestInstanceRequestSchema>;
export type StateKind = z.infer<typeof stateKindSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type WorkflowFacts = Readonly<z.infer<typeof workflowFactsSchema>>;
