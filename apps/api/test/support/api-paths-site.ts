// Rutas del sitio público, sus formularios, textos legales y cookies (M17, B41) que publica la API.
// Se suman a API_PATHS.
export const SITE_PATHS = [
  '/v1/me/platform-terms',
  '/v1/me/platform-terms/accept',
  '/v1/public/cookie-consent',
  '/v1/public/forms/contact',
  '/v1/public/forms/notice',
  '/v1/public/forms/quote',
  '/v1/public/legal/privacy-policy',
  '/v1/public/legal/{key}',
  '/v1/public/pages',
  '/v1/public/pages/{slug}',
  '/v1/public/unsubscribe',
  '/v1/site/legal-texts',
  '/v1/site/legal-texts/{id}',
  '/v1/site/legal-texts/{id}/actions/approve',
  '/v1/site/legal-texts/{id}/actions/publish',
  '/v1/site/pages',
  '/v1/site/pages/{id}',
  '/v1/site/pages/{id}/actions',
  '/v1/site/submissions',
  '/v1/site/unsubscribes',
];
