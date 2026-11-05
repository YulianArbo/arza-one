import {
  createContractRequestSchema,
  updateContractRequestSchema,
  type ContractClauseRequest,
  type ContractDetail,
  type ContractOptions,
  type ContractRenewal,
} from '@arza/contracts';
import type { z } from 'zod';

// Lo que se escribe en el asistente y en la edición del contrato (B24), y cómo se vuelve el cuerpo
// que la API espera. La API vuelve a revisar todo; aquí solo se avisa antes de enviar.

export interface ContractValues {
  readonly templateId: string;
  readonly partyId: string;
  readonly quoteId: string | null;
  readonly title: string;
  readonly object: string;
  readonly value: string;
  readonly paymentTerms: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly renewal: ContractRenewal;
  readonly signerName: string;
  readonly signerDocument: string;
}

export const EMPTY_VALUES: ContractValues = {
  templateId: '',
  partyId: '',
  quoteId: null,
  title: '',
  object: '',
  value: '',
  paymentTerms: '',
  startsOn: '',
  endsOn: '',
  renewal: 'by_agreement',
  signerName: '',
  signerDocument: '',
};

/** El asistente lleno con la cotización aceptada, si se abrió desde ella. */
export function valuesFromQuote(quote: ContractOptions['quote']): ContractValues {
  if (quote === null) return EMPTY_VALUES;
  return {
    ...EMPTY_VALUES,
    partyId: quote.party.id,
    quoteId: quote.id,
    title: quote.title,
    object: quote.object,
    value: quote.value,
    paymentTerms: quote.payment_terms,
  };
}

export function valuesFromDetail(contract: ContractDetail): ContractValues {
  return {
    templateId: contract.template.id,
    partyId: contract.party.id,
    quoteId: contract.quote?.id ?? null,
    title: contract.title,
    object: contract.object,
    value: contract.value ?? '',
    paymentTerms: contract.payment_terms ?? '',
    startsOn: contract.starts_on,
    endsOn: contract.ends_on,
    renewal: contract.renewal,
    signerName: contract.client_signer_name,
    signerDocument: contract.client_signer_document,
  };
}

function orNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function dataBody(values: ContractValues) {
  return {
    title: values.title.trim(),
    object: values.object.trim(),
    value: orNull(values.value),
    payment_terms: orNull(values.paymentTerms),
    starts_on: values.startsOn,
    ends_on: values.endsOn,
    renewal: values.renewal,
    responsible_id: null,
    client_signer_name: values.signerName.trim(),
    client_signer_document: values.signerDocument.trim(),
  };
}

export function createBody(values: ContractValues): Record<string, unknown> {
  return {
    template_id: values.templateId,
    party_id: values.partyId,
    quote_id: values.quoteId,
    ...dataBody(values),
  };
}

export function updateBody(
  values: ContractValues,
  clauses: readonly ContractClauseRequest[],
): Record<string, unknown> {
  return { ...dataBody(values), clauses };
}

const MESSAGES: Readonly<Record<string, string>> = {
  template_id: 'Elija la plantilla.',
  party_id: 'Busque y elija el cliente.',
  starts_on: 'Elija la fecha de inicio.',
  ends_on: 'Elija la fecha de terminación.',
  value: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
};

function problemsOf(result: z.ZodSafeParseResult<unknown>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const issue of result.success ? [] : result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??= MESSAGES[field] ?? issue.message;
  }
  return problems;
}

/** Lo que falta o está mal antes de generar el contrato; vacío si está listo. */
export function createProblems(values: ContractValues): Record<string, string> {
  const problems = problemsOf(createContractRequestSchema.safeParse(createBody(values)));
  if (values.endsOn !== '' && values.startsOn !== '' && values.endsOn < values.startsOn) {
    problems['ends_on'] ??= 'Debe ser igual o posterior a la fecha de inicio.';
  }
  return problems;
}

export function updateProblems(
  values: ContractValues,
  clauses: readonly ContractClauseRequest[],
): Record<string, string> {
  return problemsOf(updateContractRequestSchema.safeParse(updateBody(values, clauses)));
}

/** Una cláusula mientras se edita: si no se tocó, va sin texto y la API usa el de la biblioteca. */
export interface ClauseDraft {
  readonly key: string;
  readonly clauseKey: string | null;
  readonly title: string;
  readonly body: string;
  readonly libraryBody: string | null;
  readonly required: boolean;
}

export function clauseDrafts(contract: ContractDetail): ClauseDraft[] {
  return contract.clauses.map((clause) => ({
    key: clause.id,
    clauseKey: clause.clause_key,
    title: clause.title,
    body: clause.body,
    libraryBody: clause.origin === 'library' ? clause.body : clause.library_text,
    required: clause.required,
  }));
}

/** Lo que se envía: el texto solo si cambió respecto de la biblioteca. */
export function clauseRequests(drafts: readonly ClauseDraft[]): ContractClauseRequest[] {
  return drafts.map((draft) => ({
    clause_key: draft.clauseKey,
    title: draft.title.trim(),
    body: draft.clauseKey !== null && draft.body === draft.libraryBody ? null : draft.body.trim(),
  }));
}

/** La cláusula cambió (o es nueva): la Dirección deberá revisarla. */
export function isChanged(draft: ClauseDraft): boolean {
  return draft.clauseKey === null || draft.body !== draft.libraryBody;
}
