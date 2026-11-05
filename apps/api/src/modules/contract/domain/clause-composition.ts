import {
  fillClause,
  type ClauseOrigin,
  type ContractClauseRequest,
  type ContractValues,
} from '@arza/contracts';

// Cómo se arma el texto de un contrato (B24, ficha 17.7). Cada cláusula de la biblioteca se llena
// con las variables del contrato; si alguien cambió su título o su texto, queda «modificada», y si
// no viene de la biblioteca, «nueva». Las dos exigen la revisión de la Dirección.

export interface LibraryClause {
  readonly key: string;
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly numbered: boolean;
}

export interface TemplateEntry {
  readonly key: string;
  readonly required: boolean;
}

export interface ComposedClause {
  readonly position: number;
  readonly clauseKey: string | null;
  readonly clauseVersion: number | null;
  readonly title: string;
  readonly body: string;
  readonly origin: ClauseOrigin;
  readonly numbered: boolean;
  readonly required: boolean;
}

export type CompositionProblem =
  | { readonly kind: 'unknown'; readonly key: string }
  | { readonly kind: 'duplicate'; readonly key: string }
  | { readonly kind: 'required'; readonly title: string };

/** El texto pedido no se puede armar: una cláusula no existe, se repite o falta una obligatoria. */
export class CompositionError extends Error {
  constructor(readonly problem: CompositionProblem) {
    super(problem.kind);
  }
}

/** Las cláusulas de la plantilla, tal como vienen: el punto de partida de un contrato nuevo. */
export function templateRequest(
  template: readonly TemplateEntry[],
  library: ReadonlyMap<string, LibraryClause>,
): ContractClauseRequest[] {
  return template.map((entry) => {
    const clause = library.get(entry.key);
    if (clause === undefined) throw new CompositionError({ kind: 'unknown', key: entry.key });
    return { clause_key: entry.key, title: clause.title, body: null };
  });
}

function composeOne(
  request: ContractClauseRequest,
  position: number,
  context: Composition,
): ComposedClause {
  if (request.clause_key === null) {
    const body = request.body ?? '';
    const origin = 'added';
    return {
      position,
      clauseKey: null,
      clauseVersion: null,
      title: request.title,
      body,
      origin,
      numbered: true,
      required: false,
    };
  }
  const clause = context.library.get(request.clause_key);
  if (clause === undefined)
    throw new CompositionError({ kind: 'unknown', key: request.clause_key });
  const modelText = fillClause(clause.body, context.values);
  const body = request.body ?? modelText;
  const modified = body !== modelText || request.title !== clause.title;
  return {
    position,
    clauseKey: clause.key,
    clauseVersion: clause.version,
    title: request.title,
    body,
    origin: modified ? 'modified' : 'library',
    numbered: clause.numbered,
    required: context.required.has(clause.key),
  };
}

interface Composition {
  readonly library: ReadonlyMap<string, LibraryClause>;
  readonly required: ReadonlySet<string>;
  readonly values: ContractValues;
}

/** Arma las cláusulas pedidas en su orden. Las obligatorias de la plantilla no se pueden quitar. */
export function composeClauses(
  requested: readonly ContractClauseRequest[],
  template: readonly TemplateEntry[],
  library: ReadonlyMap<string, LibraryClause>,
  values: ContractValues,
): ComposedClause[] {
  const required = new Set(template.filter((entry) => entry.required).map((entry) => entry.key));
  const seen = new Set<string>();
  for (const request of requested) {
    if (request.clause_key === null) continue;
    if (seen.has(request.clause_key)) {
      throw new CompositionError({ kind: 'duplicate', key: request.clause_key });
    }
    seen.add(request.clause_key);
  }
  const missing = [...required].find((key) => !seen.has(key));
  if (missing !== undefined) {
    throw new CompositionError({ kind: 'required', title: library.get(missing)?.title ?? missing });
  }
  const context = { library, required, values };
  return requested.map((request, index) => composeOne(request, index + 1, context));
}

/** Cláusulas que la Dirección debe revisar una por una. */
export function needsReview(clause: { readonly origin: string }): boolean {
  return clause.origin !== 'library';
}
