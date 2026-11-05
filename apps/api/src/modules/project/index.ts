// Interfaz pública de Proyectos (M07, B26). Los demás módulos se enteran de sus cambios por los
// eventos «project.*» de la bandeja de salida (numeral 13.3: project.created para el portal y las
// tareas de arranque); nunca leen las tablas prj_.
export { ProjectModule } from './interface/project.module.js';
export { seedProjects } from './application/project-seed.js';
