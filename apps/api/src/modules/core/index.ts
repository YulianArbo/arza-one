// Interfaz pública del núcleo (M00). Los demás módulos piden aquí los códigos de negocio, los
// vencimientos en días hábiles, el horario laboral y las opciones de los catálogos; nunca leen las
// tablas core_ directamente.
export { CoreModule } from './interface/core.module.js';
export { seedCore } from './application/core-seed.js';
export { nextBusinessCode } from './application/sequences.js';
export { businessDeadline } from './application/calendar.js';
export { workScheduleOn } from './application/parameters.js';
export { isActiveCatalogCode } from './application/catalogs.js';
export { bogotaToday, fromCalendarDate, toCalendarDate } from './domain/calendar-date.js';
