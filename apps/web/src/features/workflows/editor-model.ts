import type {
  ConditionRule,
  CreateDefinitionRequest,
  DefinitionView,
  Participant,
  StateInput,
  StateKind,
  TransitionInput,
  UpdateDefinitionRequest,
} from '@arza/contracts';

// Modelo del editor básico de flujos (B15): convierte la definición en campos de formulario y de
// vuelta. No decide si el flujo es válido: eso lo dice definitionProblems, igual que la API.

export interface EditorDraft {
  readonly key: string;
  readonly entity_type: string;
  readonly name: string;
  readonly description: string;
  readonly states: readonly StateInput[];
  readonly transitions: readonly TransitionInput[];
}

/** Valor de la lista «quién atiende o aprueba»: vacío, quien inició, su jefe o «role:CODIGO». */
export function choiceOf(participant: Participant | null): string {
  if (participant === null) return '';
  return participant.type === 'role' ? `role:${participant.role}` : participant.type;
}

export function participantOf(choice: string): Participant | null {
  if (choice === 'initiator' || choice === 'supervisor') return { type: choice };
  if (choice.startsWith('role:')) return { type: 'role', role: choice.slice('role:'.length) };
  return null;
}

/** Cambiar el tipo de un estado ajusta lo que ese tipo admite. */
export function withKind(state: StateInput, kind: StateKind): StateInput {
  if (kind === 'final') return { ...state, kind, sla_hours: null, assignee: null, approval: null };
  if (kind === 'approval') {
    const approval = state.approval ?? { mode: 'serial', approvers: [{ type: 'supervisor' }] };
    return { ...state, kind, assignee: null, approval };
  }
  const assignee = state.assignee ?? { type: 'initiator' };
  return { ...state, kind, assignee, approval: null };
}

export function emptyState(index: number): StateInput {
  return {
    key: `paso_${String(index + 1)}`,
    label: `Paso ${String(index + 1)}`,
    kind: 'normal',
    sla_hours: 8,
    priority: 'normal',
    assignee: { type: 'initiator' },
    approval: null,
  };
}

export function emptyTransition(states: readonly StateInput[]): TransitionInput {
  const [first, second] = states;
  return {
    from_state: first?.key ?? '',
    to_state: second?.key ?? first?.key ?? '',
    action: `accion_${String(Date.now() % 1000)}`,
    label: 'Nueva acción',
    required_permission: null,
    condition: null,
    requires_comment: false,
  };
}

export interface ConditionFields {
  readonly fact: string;
  readonly op: ConditionRule['op'];
  readonly value: string;
}

const NO_CONDITION: ConditionFields = { fact: '', op: 'eq', value: '' };

/** El editor básico maneja una regla por transición; la API admite hasta diez. */
export function conditionFieldsOf(condition: readonly ConditionRule[] | null): ConditionFields {
  const [rule] = condition ?? [];
  if (rule === undefined || Array.isArray(rule.value)) return NO_CONDITION;
  return { fact: rule.fact, op: rule.op, value: String(rule.value) };
}

/** Sin dato no hay condición; un valor numérico se guarda como número. */
export function conditionOf(fields: ConditionFields): ConditionRule[] | null {
  const fact = fields.fact.trim();
  if (fact === '') return null;
  const text = fields.value.trim();
  const value = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
  return [{ fact, op: fields.op, value }];
}

export function draftOf(view: DefinitionView | null): EditorDraft {
  if (view === null) {
    return {
      key: '',
      entity_type: '',
      name: '',
      description: '',
      states: [
        { ...emptyState(0), key: 'borrador', label: 'Borrador', kind: 'initial' },
        {
          ...emptyState(1),
          key: 'terminado',
          label: 'Terminado',
          kind: 'final',
          sla_hours: null,
          assignee: null,
        },
      ],
      transitions: [],
    };
  }
  const { key, entity_type, name, states, transitions } = view;
  return { key, entity_type, name, description: view.description ?? '', states, transitions };
}

export function updateRequestOf(draft: EditorDraft): UpdateDefinitionRequest {
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    description: description === '' ? null : description,
    states: [...draft.states],
    transitions: [...draft.transitions],
  };
}

export function createRequestOf(draft: EditorDraft): CreateDefinitionRequest {
  return {
    key: draft.key.trim(),
    entity_type: draft.entity_type.trim() === '' ? draft.key.trim() : draft.entity_type.trim(),
    ...updateRequestOf(draft),
  };
}

/** Reemplaza el elemento `index` de una lista sin modificarla. */
export function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, position) => (position === index ? item : current));
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}
