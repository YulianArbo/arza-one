// Interfaz pública de los avisos, comentarios y adjuntos (M04, B16). Los demás módulos producen
// avisos con eventos de la bandeja de salida; nunca escriben en las tablas ntf_. Se publica también
// como «@arza/api/ntf» para el worker, que publica la bandeja de salida y envía los correos.
export { NtfModule } from './interface/ntf.module.js';
export { seedNotificationTemplates } from './application/templates.js';
export {
  publishOutboxEvents,
  type PublisherDependencies,
  type PublishResult,
} from './application/publisher.js';
export {
  sendDueNoticeEmails,
  type DispatchResult,
  type EmailDispatchDependencies,
  type NoticeEmail,
} from './application/email-dispatch.js';
