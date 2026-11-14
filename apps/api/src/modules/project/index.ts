// Interfaz pública de Proyectos (M07, B26 y B27). Los demás módulos se enteran de sus cambios por los
// eventos «project.*» de la bandeja de salida (numeral 13.3: project.created para el portal y las
// tareas de arranque; project.milestone.billable para Facturación); nunca leen las tablas prj_. Se
// publica también como «@arza/api/project» para el worker, que envía las actas a firma.
export { ProjectModule } from './interface/project.module.js';
export { seedProjects } from './application/project-seed.js';
export {
  followAcceptances,
  type AcceptanceWorkDependencies,
  type AcceptanceWorkResult,
} from './application/acceptance-work.js';
