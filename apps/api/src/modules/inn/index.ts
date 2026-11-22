// Interfaz pública de Innovación y propiedad intelectual (M15, B40). Se publica también como
// «@arza/api/inn» para el worker, que avisa las renovaciones de marcas y dominios (decisión 6).
// Nadie más lee las tablas inn_.
export { InnModule } from './interface/inn.module.js';
export { seedInnovation, seedInnovationDemo } from './application/inn-seed.js';
export {
  runInnDailyWork,
  type InnDailyWorkDeps,
  type InnDailyWorkResult,
} from './application/renewal-work.js';
