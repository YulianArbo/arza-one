// Forma de un catálogo con el que nace cada empresa (B12, capítulo 12.1).

export interface SeedCatalog {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly items: readonly (readonly [code: string, label: string])[];
}
