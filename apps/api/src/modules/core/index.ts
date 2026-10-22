// Interfaz pública del núcleo (M00). Los demás módulos piden aquí los códigos de negocio, los
// vencimientos en días hábiles, el horario laboral y las opciones de los catálogos; nunca leen las
// tablas core_ directamente.
export { CoreModule } from './interface/core.module.js';
export { seedCore } from './application/core-seed.js';
export { nextBusinessCode, nextPlainCode, raisePlainSequence } from './application/sequences.js';
export {
  activePositions,
  activeProcesses,
  orgUnitsById,
  positionsById,
  type OrgUnitRecord,
  type PositionSummary,
} from './application/org-directory.js';
export {
  businessDeadline,
  businessHoursDeadline,
  nextBusinessMoment,
} from './application/calendar.js';
export { workScheduleOn } from './application/parameters.js';
export { companyIdentity, type CompanyIdentity } from './application/company-identity.js';
export { superiorPositionId } from './application/positions.js';
export { catalogLabels, isActiveCatalogCode } from './application/catalogs.js';
export { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from './domain/calendar-date.js';
