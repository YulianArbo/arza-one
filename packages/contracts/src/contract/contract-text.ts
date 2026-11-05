// Texto de los contratos (B24, ficha 17.7): las cláusulas de la biblioteca llevan variables
// {{así}} que se llenan con los datos del contrato. Un contrato generado es idéntico al modelo salvo
// las variables; si alguien cambia el texto, la cláusula queda «modificada» y exige la Dirección.

/** Las variables que admite una cláusula, con lo que significan. */
export const CONTRACT_VARIABLES = {
  codigo_contrato: 'Código del contrato',
  empresa_razon_social: 'Razón social de la empresa',
  empresa_nit: 'NIT de la empresa',
  cliente_nombre: 'Nombre o razón social del cliente',
  cliente_documento: 'Documento del cliente',
  cliente_direccion: 'Dirección del cliente',
  cliente_ciudad: 'Ciudad del cliente',
  cliente_correo: 'Correo del cliente',
  cliente_representante: 'Quien firma por el cliente',
  cliente_representante_documento: 'Documento de quien firma por el cliente',
  objeto: 'Objeto del contrato',
  valor: 'Valor en números',
  valor_letras: 'Valor en letras',
  forma_pago: 'Forma de pago',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de terminación',
  cotizacion: 'Cotización de origen',
} as const;

export type ContractVariable = keyof typeof CONTRACT_VARIABLES;

export type ContractValues = Readonly<Record<ContractVariable, string>>;

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/gu;

function isContractVariable(name: string): name is ContractVariable {
  return Object.hasOwn(CONTRACT_VARIABLES, name);
}

/** Las variables que usa un texto, sin repetir, en orden de aparición. */
export function variablesOf(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1] ?? ''))];
}

/** Las variables del texto que la plataforma no conoce: la biblioteca no las acepta. */
export function unknownVariables(text: string): string[] {
  return variablesOf(text).filter((name) => !isContractVariable(name));
}

/** Valores de las variables, como los guarda un contrato; la que falte se deja como está. */
export type StoredValues = Readonly<Partial<Record<ContractVariable, string>>>;

/** El texto del modelo con cada variable reemplazada por su valor. */
export function fillClause(model: string, values: StoredValues): string {
  return model.replace(VARIABLE, (whole, name: string) =>
    isContractVariable(name) ? (values[name] ?? whole) : whole,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * El texto coincide con el modelo en todo lo que no es variable: lo que hay fuera de las variables
 * es idéntico, letra por letra. Sirve para demostrar el primer criterio del bloque.
 */
export function fitsModel(model: string, text: string): boolean {
  const parts = model.split(VARIABLE).map((part, index) =>
    // split deja el texto en las posiciones pares y el nombre de la variable en las impares.
    index % 2 === 0 ? escapeRegExp(part) : '([\\s\\S]+?)',
  );
  return new RegExp(`^${parts.join('')}$`, 'u').test(text);
}

/** Un contrato tiene como máximo 29 cláusulas numeradas (hasta la VIGÉSIMA NOVENA). */
export const MAX_CLAUSES = 29;

const ORDINALS = [
  'PRIMERA',
  'SEGUNDA',
  'TERCERA',
  'CUARTA',
  'QUINTA',
  'SEXTA',
  'SÉPTIMA',
  'OCTAVA',
  'NOVENA',
  'DÉCIMA',
] as const;

/** Número de la cláusula como se escribe en un contrato: PRIMERA, DÉCIMA SEGUNDA… */
export function clauseOrdinal(position: number): string {
  if (position < 1 || position > MAX_CLAUSES) throw new RangeError('Cláusula fuera de rango');
  if (position <= 10) return ORDINALS[position - 1] ?? '';
  const tens = position >= 20 ? 'VIGÉSIMA' : 'DÉCIMA';
  const unit = position % 10;
  return unit === 0 ? tens : `${tens} ${ORDINALS[unit - 1] ?? ''}`;
}
