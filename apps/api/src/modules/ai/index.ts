// Interfaz pública del asistente de inteligencia artificial (M20, B47). Se publica también como
// «@arza/api/ai» para el worker, que mantiene el índice de los documentos (refreshAiIndex). Nadie
// más lee las tablas ai_; el asistente lee Gestión documental y Servicio por sus index.ts.
export { AiModule } from './interface/ai.module.js';
export { AI_MODEL, type AiModel, type AiCompletion } from './infrastructure/ai-model.js';
export {
  refreshAiIndex,
  type AiIndexDependencies,
  type AiIndexResult,
} from './application/index-work.js';
