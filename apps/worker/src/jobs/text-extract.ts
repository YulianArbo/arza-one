import { extractPendingTexts, type TextExtractionDependencies } from '@arza/api/doc';

export type TextExtractJobDependencies = TextExtractionDependencies;

/**
 * Texto de las versiones vigentes para la búsqueda (B21, numeral 13.2), en el módulo de gestión
 * documental. Repetirlo no cambia nada. Devuelve cuántas versiones guardó.
 */
export async function processTextExtract(deps: TextExtractJobDependencies): Promise<number> {
  return extractPendingTexts(deps);
}
