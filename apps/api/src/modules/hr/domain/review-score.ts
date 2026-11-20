import { Decimal } from 'decimal.js';

// Calificación de la evaluación de desempeño (B36, decisión 7): el promedio de las calificaciones
// de 1 a 5 de cada objetivo, ponderado por su peso, con dos decimales.

export interface WeightedObjective {
  readonly weight: number;
}

export function weightedScore(
  objectives: readonly WeightedObjective[],
  scores: readonly number[],
): Decimal {
  const total = objectives.reduce(
    (sum, objective, index) => sum.plus(new Decimal(objective.weight).times(scores[index] ?? 0)),
    new Decimal(0),
  );
  return total.dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
