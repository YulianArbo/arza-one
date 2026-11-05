import {
  createProjectRequestSchema,
  updateProjectRequestSchema,
  type ProjectDetail,
  type ProjectMethodology,
  type ProjectOptions,
  type ProjectType,
} from '@arza/contracts';
import type { z } from 'zod';

// Lo que se escribe en el asistente y en la edición del proyecto (B26), y cómo se vuelve el cuerpo
// que la API espera. La API vuelve a revisar todo; aquí solo se avisa antes de enviar.

export interface ProjectValues {
  readonly contractId: string;
  readonly partyId: string;
  readonly name: string;
  readonly type: ProjectType;
  readonly methodology: ProjectMethodology;
  readonly description: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly budgetHours: string;
  readonly budgetAmount: string;
  readonly managerId: string;
}

export const EMPTY_VALUES: ProjectValues = {
  contractId: '',
  partyId: '',
  name: '',
  type: 'development',
  methodology: 'scrum',
  description: '',
  startsOn: '',
  endsOn: '',
  budgetHours: '',
  budgetAmount: '',
  managerId: '',
};

type ContractOption = ProjectOptions['contracts'][number];

/** El asistente lleno con el contrato elegido: cliente, nombre, fechas y valor. */
export function valuesFromContract(
  values: ProjectValues,
  contract: ContractOption | undefined,
): ProjectValues {
  if (contract === undefined) return { ...values, contractId: '' };
  return {
    ...values,
    contractId: contract.id,
    partyId: contract.party.id,
    name: values.name === '' ? contract.title : values.name,
    startsOn: contract.starts_on,
    endsOn: contract.ends_on,
    budgetAmount: contract.value ?? '',
  };
}

export function valuesFromDetail(project: ProjectDetail): ProjectValues {
  return {
    contractId: project.contract?.id ?? '',
    partyId: project.party.id,
    name: project.name,
    type: project.type,
    methodology: project.methodology,
    description: project.description ?? '',
    startsOn: project.starts_on,
    endsOn: project.ends_on,
    budgetHours: String(project.budget_hours).replace('.', ','),
    budgetAmount: project.budget_amount ?? '',
    managerId: project.manager?.id ?? '',
  };
}

function orNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** «120,5» o «120.5» como número; vacío o ilegible queda como texto para que la API lo rechace. */
function hours(text: string): number | string {
  const normalized = text.trim().replace(',', '.');
  const parsed = Number(normalized);
  return normalized === '' || Number.isNaN(parsed) ? normalized : parsed;
}

function dataBody(values: ProjectValues) {
  return {
    name: values.name.trim(),
    type: values.type,
    methodology: values.methodology,
    description: orNull(values.description),
    starts_on: values.startsOn,
    ends_on: values.endsOn,
    budget_hours: hours(values.budgetHours),
    budget_amount: orNull(values.budgetAmount),
    manager_id: values.managerId,
  };
}

export function createBody(values: ProjectValues): Record<string, unknown> {
  const fromContract = values.contractId !== '';
  return {
    contract_id: fromContract ? values.contractId : null,
    party_id: fromContract ? null : orNull(values.partyId),
    ...dataBody(values),
  };
}

export function updateBody(values: ProjectValues): Record<string, unknown> {
  return dataBody(values);
}

const MESSAGES: Readonly<Record<string, string>> = {
  starts_on: 'Elija la fecha de inicio.',
  ends_on: 'Elija la fecha de fin.',
  manager_id: 'Elija el líder del proyecto.',
  budget_hours: 'Escriba las horas presupuestadas, por ejemplo 320 o 320,5.',
  budget_amount: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
};

function problemsOf(result: z.ZodSafeParseResult<unknown>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const issue of result.success ? [] : result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??= MESSAGES[field] ?? issue.message;
  }
  return problems;
}

function datesProblem(values: ProjectValues, problems: Record<string, string>): void {
  if (values.endsOn !== '' && values.startsOn !== '' && values.endsOn < values.startsOn) {
    problems['ends_on'] ??= 'Debe ser igual o posterior a la fecha de inicio.';
  }
}

/** Lo que falta o está mal antes de crear el proyecto; vacío si está listo. */
export function createProblems(values: ProjectValues): Record<string, string> {
  const problems = problemsOf(createProjectRequestSchema.safeParse(createBody(values)));
  if (values.contractId === '' && values.partyId === '') {
    problems['party_id'] = 'Elija el contrato vigente o, sin contrato, busque y elija el cliente.';
  }
  datesProblem(values, problems);
  return problems;
}

export function updateProblems(values: ProjectValues): Record<string, string> {
  const problems = problemsOf(updateProjectRequestSchema.safeParse(updateBody(values)));
  datesProblem(values, problems);
  return problems;
}
