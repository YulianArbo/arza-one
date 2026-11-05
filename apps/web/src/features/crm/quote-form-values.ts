import {
  DEFAULT_QUOTE_VALID_DAYS,
  exceedsDiscountCap,
  quoteTotals,
  serviceUnitSchema,
  updateQuoteRequestSchema,
  type QuoteDetail,
  type QuoteOptions,
  type QuoteTotals,
  type Service,
  type UpdateQuoteRequest,
} from '@arza/contracts';

import { bogotaToday } from './labels';

// Valores del asistente de cotización (B23): lo que la persona escribe, cómo se convierte en el
// cuerpo que pide la API y los problemas de cada paso. Los totales se calculan con la misma
// función de los contratos que usa la API, así lo que se ve es lo que se guarda.

export interface ItemValues {
  /** Identificador local de la línea, para React. */
  readonly key: string;
  readonly serviceId: string | null;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly taxKey: string;
}

export interface QuoteValues {
  readonly validUntil: string;
  readonly paymentTerms: string;
  readonly deliveryTerms: string;
  readonly warranty: string;
  readonly notes: string;
  readonly items: readonly ItemValues[];
}

let nextKey = 0;

function lineKey(): string {
  nextKey += 1;
  return `linea-${String(nextKey)}`;
}

function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T12:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

export function emptyItem(taxKey = 'IVA_GENERAL'): ItemValues {
  return {
    key: lineKey(),
    serviceId: null,
    description: '',
    unit: 'hour',
    quantity: '1',
    unitPrice: '',
    discountPercent: '0',
    taxKey,
  };
}

/** Línea tomada del portafolio, con la tarifa vigente del servicio. */
export function itemFromService(service: Service): ItemValues {
  return {
    ...emptyItem(service.tax_key),
    serviceId: service.id,
    description:
      service.description === null ? service.name : `${service.name}: ${service.description}`,
    unit: service.unit,
    unitPrice: service.base_price,
  };
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
}

/** Valores iniciales: los del borrador que se edita o una cotización nueva a 30 días. */
export function initialValues(quote: QuoteDetail | null, now = new Date()): QuoteValues {
  if (quote === null) {
    return {
      validUntil: addDays(bogotaToday(now), DEFAULT_QUOTE_VALID_DAYS),
      paymentTerms: '',
      deliveryTerms: '',
      warranty: '',
      notes: '',
      items: [],
    };
  }
  return {
    validUntil: quote.valid_until,
    paymentTerms: quote.conditions.payment_terms,
    deliveryTerms: quote.conditions.delivery_terms,
    warranty: quote.conditions.warranty ?? '',
    notes: quote.notes ?? '',
    items: quote.items.map((item) => ({
      key: lineKey(),
      serviceId: item.service?.id ?? null,
      description: item.description,
      unit: item.unit,
      quantity: trimZeros(item.quantity),
      unitPrice: item.unit_price,
      discountPercent: trimZeros(item.discount_percent),
      taxKey: item.tax_key,
    })),
  };
}

function orNull(text: string): string | null {
  return text.trim() === '' ? null : text.trim();
}

/** El cuerpo que pide la API para guardar el borrador. */
export function draftBody(values: QuoteValues): UpdateQuoteRequest {
  return {
    valid_until: values.validUntil,
    conditions: {
      payment_terms: values.paymentTerms.trim(),
      delivery_terms: values.deliveryTerms.trim(),
      warranty: orNull(values.warranty),
    },
    notes: orNull(values.notes),
    items: values.items.map((item) => ({
      service_id: item.serviceId,
      description: item.description.trim(),
      unit: serviceUnitSchema.catch('unit').parse(item.unit),
      quantity: item.quantity.trim().replace(',', '.'),
      unit_price: item.unitPrice.trim().replace(',', '.'),
      discount_percent: item.discountPercent.trim().replace(',', '.') || '0',
      tax_key: item.taxKey,
    })),
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  valid_until: 'Elija el último día de vigencia.',
  payment_terms: 'Escriba la forma de pago.',
  delivery_terms: 'Escriba el plazo de entrega.',
  warranty: 'Escriba al menos tres letras o deje la garantía vacía.',
  notes: 'Escriba al menos tres letras o deje las notas vacías.',
  items: 'Agregue al menos un ítem.',
  description: 'Escriba al menos tres letras.',
  quantity: 'Escriba la cantidad, mayor que cero: 1.5',
  unit_price: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
  discount_percent: 'Escriba un descuento entre 0 y 100.',
};

/**
 * Campo de un problema del contrato: «items.2.quantity» para un ítem, «payment_terms» para una
 * condición y el nombre del campo para lo demás. El segundo valor es el nombre del mensaje.
 */
function problemKey(path: readonly PropertyKey[]): [string, string] {
  const [first = '', second, third] = path.map(String);
  if (first === 'items' && third !== undefined) return [`items.${second ?? ''}.${third}`, third];
  if (first === 'conditions' && second !== undefined) return [second, second];
  return [first, first];
}

/** Problemas por campo; los de un ítem llevan su número: «items.2.quantity». */
export function problemsOf(values: QuoteValues, today = bogotaToday()): Record<string, string> {
  const problems: Record<string, string> = {};
  const result = updateQuoteRequestSchema.safeParse(draftBody(values));
  for (const issue of result.success ? [] : result.error.issues) {
    const [key, name] = problemKey(issue.path);
    problems[key] ??= MESSAGES[name] ?? 'Revise este dato.';
  }
  if (values.validUntil !== '' && values.validUntil < today) {
    problems['valid_until'] = 'La vigencia debe terminar hoy o más adelante.';
  }
  return problems;
}

/** Los problemas que muestra cada paso del asistente. */
export function stepProblems(
  problems: Record<string, string>,
  step: 1 | 2 | 3,
): Record<string, string> {
  const inStep = (key: string): boolean => {
    if (step === 1) return key === 'valid_until';
    if (step === 2) return key === 'items' || key.startsWith('items.');
    return !key.startsWith('items') && key !== 'valid_until';
  };
  return Object.fromEntries(Object.entries(problems).filter(([key]) => inStep(key)));
}

/** Totales en vivo, con la tarifa vigente de cada impuesto; null si falta algún dato. */
export function liveTotals(values: QuoteValues, options: QuoteOptions): QuoteTotals | null {
  const rates = new Map(options.taxes.map((tax) => [tax.key, tax.rate]));
  const lines = draftBody(values).items.map((item) => ({
    ...item,
    tax_rate: rates.get(item.tax_key),
  }));
  const numeric = /^\d+(\.\d{1,2})?$/u;
  const complete = lines.every(
    (line) =>
      line.tax_rate !== undefined &&
      numeric.test(line.quantity) &&
      numeric.test(line.unit_price) &&
      numeric.test(line.discount_percent),
  );
  if (!complete) return null;
  return quoteTotals(lines.map((line) => ({ ...line, tax_rate: line.tax_rate ?? '0' })));
}

/** Algún descuento pasa el tope: la cotización irá a la Dirección. */
export function needsApproval(values: QuoteValues, cap: string | null): boolean {
  const lines = draftBody(values).items.filter((item) =>
    /^\d+(\.\d{1,2})?$/u.test(item.discount_percent),
  );
  return exceedsDiscountCap(lines, cap ?? '0');
}
