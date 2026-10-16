// Interfaz pública del motor de flujos y tareas (M04). Los módulos inician el flujo de sus
// registros y piden transiciones por aquí, dentro de su propia transacción; se enteran de los
// cambios por los eventos «wf.instance.*» de la bandeja de salida. Nunca leen las tablas wf_.
// Se publica también como «@arza/api/wf» para el worker, que escala las tareas vencidas.
export { WfModule } from './interface/wf.module.js';
export { seedWorkflowDemo } from './application/wf-demo-seed.js';
export { escalateOverdueTasks, type OverdueCheckDependencies } from './application/overdue.js';
export {
  requestTransition,
  startWorkflow,
  type StartRequest,
  type TransitionAsk,
} from './application/workflow-engine.js';
export { taskActorOf, type WfContext } from './application/wf-context.js';
export { taskNoticeFacts, visibleInstanceTitle } from './application/wf-records.js';
