// Interfaz pública del CRM (M05, B22). Los demás módulos se enteran de sus cambios por los eventos
// «crm.*» de la bandeja de salida; nunca leen las tablas crm_. Contratos (B24) pide aquí la
// cotización aceptada con la que propone el contrato. Se publica también como
// «@arza/api/crm» para el worker, que envía los recordatorios de las actividades.
export { CrmModule } from './interface/crm.module.js';
export { seedCrmWorkflows } from './application/crm-workflows.js';
export { acceptedQuote, type ContractQuote } from './application/quote-contract.js';
export { sendActivityReminders, type ReminderDependencies } from './application/reminders.js';
export {
  expireQuotes,
  processPendingQuotes,
  type QuoteMail,
  type QuoteWorkDependencies,
  type QuoteWorkResult,
} from './application/quote-work.js';
