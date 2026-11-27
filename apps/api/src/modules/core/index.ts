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
  processesOfPosition,
  processOwnerPositionId,
  type OrgUnitRecord,
  type PositionSummary,
} from './application/org-directory.js';
export {
  businessDeadline,
  businessHoursDeadline,
  businessMinutesElapsed,
  nextBusinessMoment,
  workCalendarBetween,
} from './application/calendar.js';
export { isBusinessDay, type WorkCalendar } from './domain/business-days.js';
export {
  discountCapOn,
  laborRulesOn,
  pqrsfTermsOn,
  purchaseTiersOn,
  workScheduleOn,
} from './application/parameters.js';
export {
  companyIdentity,
  tenantIdByTaxId,
  type CompanyIdentity,
} from './application/company-identity.js';
export { superiorPositionId } from './application/positions.js';
export {
  addOrgUnit,
  addPosition,
  setUnitOwner,
  structureSnapshot,
  tenantRegistered,
  type NewOrgUnit,
  type NewPosition,
  type StructureRef,
  type StructureSnapshot,
} from './application/structure-load.js';
export { type CoreActor } from './application/core-audit.js';
export {
  activeCatalogOptions,
  catalogLabels,
  isActiveCatalogCode,
} from './application/catalogs.js';
export { activeCostCenters, costCenterRefs } from './application/cost-centers.js';
export {
  addDays,
  bogotaStartOf,
  bogotaToday,
  fromCalendarDate,
  isoWeekday,
  toCalendarDate,
} from './domain/calendar-date.js';
export {
  currentAndScheduled,
  previousValidTo,
  validFromProblem,
  type ValidFromProblem,
} from './domain/parameter-policy.js';
export { tenantIsOpen, tenantPlan, type TenantPlanView } from './application/tenant-plan.js';
export {
  changeTenantStatus,
  lastExports,
  markFilesPurged,
  platformTenants,
  purgeTenantData,
  registerTenant,
  setTenantPlan,
  tenantsDueForPurge,
  type LastExport,
  type NewTenant,
  type StatusAction,
  type StatusChange,
  type TenantRecord,
} from './infrastructure/platform-store.js';
export {
  claimQueuedExport,
  expireDueExports,
  exportColumns,
  exportInProgress,
  exportRows,
  exportTables,
  exportWorkTenants,
  findTenantExport,
  listTenantExports,
  markExportFailed,
  markExportReady,
  omittedColumns,
  omittedTables,
  queueTenantExport,
  type OmittedTable,
  type ReadyExport,
  type TenantExportRow,
} from './infrastructure/export-store.js';
