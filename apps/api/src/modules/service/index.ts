// Interfaz pública de la mesa de ayuda (M08, B28). Los demás módulos se enteran de sus cambios por
// los eventos «service.*» de la bandeja de salida (numeral 13.3: service.ticket.resolved para las
// encuestas del B29, service.compensation.approved para Facturación); nunca leen las tablas svc_.
// Se publica también como «@arza/api/service» para el worker, que lleva el reloj de los tiquetes.
export { ServiceModule } from './interface/service.module.js';
export { seedService } from './application/sla-policies.js';
export {
  followTicketClocks,
  type SlaWorkDependencies,
  type SlaWorkResult,
} from './application/sla-work.js';
