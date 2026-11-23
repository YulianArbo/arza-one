# Sitio público, formularios, textos legales y cookies · B41

El módulo M17 presenta la empresa al público, recibe los formularios de contacto y cotización, publica los textos legales versionados y pide la elección de cookies (ficha 17.18; numerales 20.2 y 20.4). En la web interna está en **Gobierno › Sitio web**. El sitio público es el de la empresa cuyo NIT está en `PUBLIC_SITE_TAX_ID`.

## Tablas

| Tabla                   | Para qué                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web_pages`             | Páginas institucionales administrables (como «Nosotros»): dirección (`slug`), título, resumen, texto sencillo, estado (`draft`, `published`, `withdrawn`) y fecha de publicación.                                                                |
| `web_legal_texts`       | Textos legales versionados: clase (`key`), número de versión, título, texto, estado (`draft`, `approved`, `published`, `replaced`), quién lo redactó, quién y cuándo lo aprobó, concepto jurídico opcional, desde cuándo rige y cuándo se reemplazó. |
| `web_legal_acceptances` | Aceptación expresa de una versión (hoy, los términos de la plataforma): versión, persona, fecha, dirección IP y navegador. Solo se agrega.                                                                                                       |
| `web_form_submissions`  | Envíos de contacto y cotización, `FRM-AAAA-NNNN`: correo, datos del formulario (JSON), versión del aviso aceptado, autorización, IP, navegador, prospecto creado, acuse pendiente o enviado y la huella de la llave de baja.                     |
| `web_unsubscribes`      | Bajas de comunicaciones comerciales: correo (en minúsculas), origen (`ack_link`), envío del que vino y fecha. Solo se agrega.                                                                                                                    |
| `prv_cookie_consents`   | Elección de cookies de un visitante (del módulo de Privacidad, B41 decisión 4): identificador aleatorio del navegador, versión de la política, categorías aceptadas, fecha e IP truncada. Solo se agrega.                                          |

Todas llevan `tenant_id` y RLS. Las crea la migración `20261125000000_web_public_site_legal_cookies`, que además agrega `iam_sessions.terms_pending` y la función `web_tenants_with_mail_work()` para el worker.

## Reglas

- **Textos legales (decisiones 1 y 2).**
  - Clases del sitio: términos y condiciones del sitio (`site_terms`), términos de uso de la plataforma (`platform_terms`), política de cookies (`cookie_policy`), derechos del titular (`data_subject_rights`), seguridad y divulgación responsable (`security_disclosure`) y avisos de software de terceros (`third_party_notices`).
  - La política de tratamiento de datos, el aviso de privacidad y los términos del portal siguen en Privacidad (`prv_notices`); el pie del sitio enlaza la política publicada allí.
  - Los redacta quien tiene «Editar textos legales»; los aprueba y publica quien tiene «Publicar textos legales». **Nadie aprueba lo que redactó** (403 `SITE_SELF_APPROVAL`; la base también lo verifica). Quien edita el borrador queda como su redactor.
  - Una sola versión en curso (borrador o aprobada) y una sola publicada por clase. Publicar reemplaza la vigente. Lo aprobado y lo publicado no se editan.
- **Términos de la plataforma (decisión 3).** Al completar el ingreso, si la persona interna no ha aceptado la versión publicada, la sesión queda con `terms_pending`. Mientras tanto la API responde 403 `TERMS_PENDING` a toda ruta con permiso, y solo atiende la cuenta propia: `GET /v1/me/platform-terms` y `POST /v1/me/platform-terms/accept`. La web lleva a la persona a `/aceptar-terminos`. Sin versión publicada no se bloquea a nadie. Las sesiones abiertas antes de publicar siguen trabajando: se pide en el siguiente ingreso.
- **Formularios (decisiones 7 y 8).**
  - Contacto y cotización crean el prospecto en Comercial (origen «Sitio web») con su tarea «Contactar al prospecto» y la autorización con la versión exacta del aviso `authorization_contact` que se mostró. Si el aviso cambió, 409.
  - La casilla de autorización nunca viene marcada; sin ella, 422.
  - El campo `nickname` es una trampa para robots: si llega lleno, se responde igual y no se guarda nada. Además, cinco envíos por minuto por dirección. El CAPTCHA llega con B43.
- **Acuse y baja (decisión 9).** Cada 30 segundos (`web.site-work`) el worker envía el acuse con la referencia y un enlace de baja `/baja#token=…`. La llave se crea al enviar y solo se guarda su huella; sirve una sola vez. Al usarla, el correo entra a `web_unsubscribes`. Todo envío comercial futuro debe consultar `isUnsubscribed` (en `apps/api/src/modules/web/index.ts`).
- **Cookies (decisiones 4, 5 y 6).** Categorías: necesarias (siempre), preferencias (modo claro u oscuro, desmarcada), analíticas y publicidad (no se usan). La elección se guarda en la cookie necesaria `arza_cookie_consent` por 12 meses y se registra con la versión de la política publicada; con otra versión, 409. En el sitio público el modo claro u oscuro solo se recuerda si se aceptan las preferencias; al rechazarlas, se borra la cookie `arza_theme`.
- **Páginas (decisión 10).** Texto sencillo: «## » título, «- » lista, línea en blanco entre párrafos; se pinta como texto, nunca como HTML. Las direcciones de la plataforma están reservadas (`RESERVED_PAGE_SLUGS`).

## Rutas de la API

| Ruta                                                     | Acceso                    |
| -------------------------------------------------------- | ------------------------- |
| `GET /v1/public/pages`, `GET /v1/public/pages/{slug}`    | Pública                   |
| `GET /v1/public/legal/{key}`, `GET .../privacy-policy`   | Pública                   |
| `GET /v1/public/forms/notice`                            | Pública                   |
| `POST /v1/public/forms/contact`, `.../quote`             | Pública (5 por minuto)    |
| `POST /v1/public/cookie-consent`                         | Pública                   |
| `POST /v1/public/unsubscribe`                            | Pública (llave en cuerpo) |
| `GET/POST /v1/site/pages`, `PATCH .../{id}`, `.../actions` | `web.page.manage`       |
| `GET/POST /v1/site/legal-texts`, `PATCH .../{id}`        | `web.legal_text.manage`   |
| `POST /v1/site/legal-texts/{id}/actions/approve`, `.../publish` | `web.legal_text.publish` |
| `GET /v1/site/submissions`, `GET /v1/site/unsubscribes`  | `web.submission.read`     |
| `GET /v1/me/platform-terms`, `POST .../accept`           | Cuenta propia             |

## Auditoría y eventos

Cada escritura deja su evento de auditoría en la misma transacción: `web.page.*`, `web.legal_text.*`, `web.platform_terms.accept`, `web.form.submit`, `web.form.acknowledge`, `web.unsubscribe.link.issue`, `web.unsubscribe.record` y `privacy.cookie_consent.record` (con la IP truncada). Eventos de la bandeja de salida: `web.page.created|updated|published|withdrawn`, `web.legal.created|updated|approved|published`, `web.form.submitted` y `web.unsubscribe.recorded`.
