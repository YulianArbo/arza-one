import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

/** Un cargo del organigrama, como lo necesita la ficha de usuario. */
export interface PositionRecord {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

/**
 * Consulta de cargos. Los cargos viven en el núcleo, que ya depende de iam; para no depender de
 * vuelta, iam pide los cargos por este puerto y el núcleo lo implementa.
 */
export interface PositionDirectory {
  find(tx: TenantTransaction, positionId: string): Promise<PositionRecord | null>;
}

export const POSITION_DIRECTORY = Symbol('POSITION_DIRECTORY');
