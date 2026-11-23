// Interfaz pública del sitio (M17, B41). Identidad pregunta por los términos de la plataforma
// mediante PLATFORM_TERMS_GATE; todo envío comercial consulta antes la lista de bajas. Se publica
// también como «@arza/api/web» para el worker, que envía el acuse de los formularios.
export { WebModule } from './interface/web.module.js';
export { seedSiteDemo, seedSiteTexts } from './application/site-seed.js';
export { isUnsubscribed } from './application/submissions.js';
export {
  sendSiteMail,
  sendSiteMailIn,
  type SiteMail,
  type SiteWorkDependencies,
} from './application/site-work.js';
