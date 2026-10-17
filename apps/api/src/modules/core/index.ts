// Interfaz pública del núcleo (M00). Los demás módulos piden aquí los códigos de negocio, los
// vencimientos en días hábiles, el horario laboral y las opciones de los catálogos; nunca leen las
// tablas core_ directamente.
export { CoreModule } from './interface/core.module.js';
export { seedCore } from './application/core-seed.js';
export { nextBusinessCode, nextPlainCode } from './application/sequences.js';
export {
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
export { superiorPositionId } from './application/positions.js';
export { isActiveCatalogCode } from './application/catalogs.js';
export { bogotaToday, fromCalendarDate, toCalendarDate } from './domain/calendar-date.js';
