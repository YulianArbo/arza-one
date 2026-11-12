// Interfaz pública de Proyectos (M07, B26 y B27). Los demás módulos se enteran de sus cambios por los
// eventos «project.*» de la bandeja de salida (numeral 13.3: project.created para el portal y las
// tareas de arranque; project.milestone.billable para Facturación); nunca leen las tablas prj_. La mesa de ayuda (B28)
// lee el código y el nombre de proyectos y entregables y se entera de la aceptación aquí. Se
// publica también como «@arza/api/project» para el worker, que envía las actas a firma.
export { ProjectModule } from './interface/project.module.js';
export {
  billableMilestone,
  billableMilestones,
  type BillableMilestone,
} from './application/billable-milestone.js';
export { seedProjects } from './application/project-seed.js';
export {
  followAcceptances,
  type AcceptanceWorkDependencies,
  type AcceptanceWorkResult,
} from './application/acceptance-work.js';
export {
  deliverableRefs,
  onDeliverableAccepted,
  projectRefs,
  type DeliverableAccepted,
  type DeliverableAcceptedListener,
  type DeliverableRef,
  type ProjectRef,
} from './application/project-directory.js';
export type { ProjectActor } from './application/project-support.js';
export {
  clientAccessByUser,
  clientAwaitingActs,
  clientProject,
  clientProjectDocuments,
  clientProjectIds,
  clientProjects,
  clientUpcomingMilestones,
  companyProjects,
  type ClientProjectDocument,
  type ClientProjectScope,
} from './application/client-projects.js';
export { setClientAccess } from './application/client-sharing.js';
