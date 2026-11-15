import { ASSET_CATEGORIES, assetCategorySchema } from '@arza/contracts';

// Reglas de Activos sin base de datos (B34): fechas válidas y el contenido del contrato de
// comodato CT-ADM-001 que firma quien recibe un activo.

/** Por qué una fecha no sirve, o null si sirve: ni futura ni anterior a la compra. */
export function dateProblem(
  date: string,
  limits: { readonly today: string; readonly notBefore?: string },
  what: string,
): string | null {
  if (date > limits.today) return `${what} no puede ser futura.`;
  if (limits.notBefore !== undefined && date < limits.notBefore) {
    return `${what} no puede ser anterior a la fecha de compra del activo.`;
  }
  return null;
}

/**
 * Cláusulas de ejemplo del comodato. Son un borrador pendiente de revisión jurídica y de
 * validación contra el CT-ADM-001 original (decisión 3 del B34).
 */
const LOAN_CLAUSES = [
  'PRIMERA. Objeto: el comodante entrega al comodatario, a título de comodato o préstamo de uso, el activo descrito en este documento, para el desempeño de sus funciones.',
  'SEGUNDA. Uso y cuidado: el comodatario usará el activo solo para los fines de la empresa, lo cuidará con la diligencia debida y avisará de inmediato cualquier daño, pérdida o hurto.',
  'TERCERA. Prohibiciones: el comodatario no podrá ceder, prestar, arrendar, vender ni modificar el activo sin autorización escrita del comodante.',
  'CUARTA. Restitución: el comodatario devolverá el activo en el estado en que lo recibió, salvo el deterioro por el uso normal, cuando el comodante lo solicite o al terminar su vinculación.',
  'QUINTA. Responsabilidad: el comodatario responderá por la pérdida o el daño del activo causados por su culpa o por un uso distinto del acordado.',
  'SEXTA. Propiedad: el activo es y seguirá siendo propiedad del comodante; este contrato no transfiere dominio alguno.',
].join('\n\n');

export interface LoanContractInput {
  readonly company: { readonly legalName: string; readonly taxId: string };
  readonly borrower: { readonly name: string; readonly document: string };
  readonly asset: {
    readonly code: string;
    readonly name: string;
    readonly category: string;
    readonly serial: string | null;
    readonly cost: string;
  };
  readonly assignedOn: string;
}

function categoryLabel(category: string): string {
  const parsed = assetCategorySchema.safeParse(category);
  return parsed.success ? ASSET_CATEGORIES[parsed.data] : category;
}

/** Los campos del formato CT-ADM-001, con las llaves de su definición. */
export function loanContractData(input: LoanContractInput): Record<string, string> {
  return {
    comodante: input.company.legalName,
    comodante_nit: input.company.taxId,
    comodatario: input.borrower.name,
    comodatario_documento: input.borrower.document,
    codigo: input.asset.code,
    nombre: input.asset.name,
    categoria: categoryLabel(input.asset.category),
    serie: input.asset.serial ?? 'No aplica',
    valor: `$ ${input.asset.cost}`,
    fecha_entrega: input.assignedOn,
    clausulas: LOAN_CLAUSES,
  };
}
