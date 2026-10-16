import type { ConditionRule, WorkflowFacts } from '@arza/contracts';

// Condiciones de las transiciones (ficha 17.5, ADR-011): comparaciones de los datos que entrega el
// módulo dueño del registro con valores guardados en la definición. Nunca se ejecuta código.

type Scalar = string | number | boolean;

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Número decimal exacto como texto: «5000000.00» o 5000000. Null si no es un número. */
function decimalParts(
  value: Scalar,
): { negative: boolean; whole: string; fraction: string } | null {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') return null;
  const match = DECIMAL.exec(text);
  if (match === null) return null;
  const [, sign, whole = '0', fraction = ''] = match;
  const trimmed = whole.replace(/^0+(?=\d)/, '');
  return { negative: sign === '-', whole: trimmed, fraction: fraction.replace(/0+$/, '') };
}

function compareMagnitude(a: { whole: string; fraction: string }, b: typeof a): number {
  if (a.whole.length !== b.whole.length) return a.whole.length - b.whole.length;
  if (a.whole !== b.whole) return a.whole < b.whole ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const left = a.fraction.padEnd(width, '0');
  const right = b.fraction.padEnd(width, '0');
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Compara dos números sin pasar por coma flotante, para que el dinero (numeric 18,2, ADR-020) se
 * compare exacto. Null si alguno no es un número.
 */
export function compareDecimals(a: Scalar, b: Scalar): number | null {
  const left = decimalParts(a);
  const right = decimalParts(b);
  if (left === null || right === null) return null;
  const isZero = (part: typeof left) => part.whole === '0' && part.fraction === '';
  const leftNegative = left.negative && !isZero(left);
  const rightNegative = right.negative && !isZero(right);
  if (leftNegative !== rightNegative) return leftNegative ? -1 : 1;
  const magnitude = compareMagnitude(left, right);
  return leftNegative ? -magnitude : magnitude;
}

function sameValue(a: Scalar, b: Scalar): boolean {
  const numeric = compareDecimals(a, b);
  return numeric === null ? a === b : numeric === 0;
}

function ruleHolds(rule: ConditionRule, fact: Scalar | undefined): boolean {
  if (fact === undefined) return false;
  const { op, value } = rule;
  if (op === 'in') return Array.isArray(value) && value.some((item) => sameValue(fact, item));
  if (Array.isArray(value)) return false;
  if (op === 'eq') return sameValue(fact, value);
  if (op === 'neq') return !sameValue(fact, value);
  const order = compareDecimals(fact, value);
  if (order === null) return false;
  const holds = { gt: order > 0, gte: order >= 0, lt: order < 0, lte: order <= 0 };
  return holds[op];
}

/** La condición se cumple si todas sus reglas se cumplen. Sin condición, siempre. */
export function conditionHolds(
  rules: readonly ConditionRule[] | null,
  facts: WorkflowFacts,
): boolean {
  return rules === null || rules.every((rule) => ruleHolds(rule, facts[rule.fact]));
}
