// Interfaz pública de Servicio al cliente (M08, B28 y B29). Los demás módulos se enteran de sus
// cambios por los eventos «service.*» de la bandeja de salida (numeral 13.3): service.compensation.
// approved para Facturación (B31), service.pqrsf.transferred para Privacidad (B42),
// service.pqrsf.nonconforming para Calidad (B38) y service.survey.answered para el
// indicador de satisfacción (B39); nunca leen las tablas svc_. Se publica también como
// «@arza/api/service» para el worker, que lleva el reloj de los tiquetes y los correos de las PQRSF y
// las encuestas.
export { ServiceModule } from './interface/service.module.js';
export { seedService } from './application/sla-policies.js';
export {
  followTicketClocks,
  followTicketClocksIn,
  type SlaWorkDependencies,
  type SlaWorkResult,
} from './application/sla-work.js';
export {
  followCustomerCare,
  followCustomerCareIn,
  tenantsWithCareWork,
  type CareWorkDependencies,
  type CareWorkResult,
} from './application/care-work.js';
