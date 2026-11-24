# Revisión de ARZA ONE contra OWASP ASVS 5.0, nivel 2 (B43)

**Fecha:** 24/11/2026 · **Quién:** Claude Code, en el bloque B43 · **Alcance:** API, web, worker
y su configuración en el repositorio (`main` con B42 más la rama de B43).

El capítulo 15 del Manual Maestro fija el nivel 2 de OWASP ASVS como meta. Esta revisión recorre
los 17 capítulos de la versión 5.0 y dice, para cada grupo de requisitos, cómo los cumple ARZA ONE y
con qué prueba se comprueba. **No reemplaza la revisión externa ni la prueba de intrusión** que exige
el numeral 21.4: es la guía para el revisor.

Estados: **Cumple** (control y prueba automática) · **Parcial** (falta algo, se dice qué y dónde
queda) · **Pendiente** (se hace en un bloque posterior) · **No aplica**.

## Resumen

| Capítulo                          | Estado    | Pendiente                                          |
| --------------------------------- | --------- | -------------------------------------------------- |
| V1 Codificación y saneamiento     | Cumple    | —                                                  |
| V2 Validación y lógica de negocio | Cumple    | —                                                  |
| V3 Seguridad del navegador        | Cumple    | Estilos en línea aceptados (ver V3)                |
| V4 API y servicios web            | Cumple    | —                                                  |
| V5 Manejo de archivos             | Cumple    | —                                                  |
| V6 Autenticación                  | Cumple    | —                                                  |
| V7 Sesiones                       | Cumple    | —                                                  |
| V8 Autorización                   | Cumple    | —                                                  |
| V9 Tokens autocontenidos          | No aplica | No se usan JWT                                     |
| V10 OAuth y OIDC                  | No aplica | No hay ingreso con terceros                        |
| V11 Criptografía                  | Parcial   | Certificado real del sello y sello de tiempo (B44) |
| V12 Comunicaciones seguras        | Parcial   | Cabeceras definitivas de Caddy en producción (B44) |
| V13 Configuración                 | Parcial   | Gestor de secretos y rotación por guion (B44)      |
| V14 Protección de datos           | Cumple    | —                                                  |
| V15 Código y arquitectura seguros | Cumple    | —                                                  |
| V16 Registros y errores           | Parcial   | Alertas centralizadas (GlitchTip, B44)             |
| V17 WebRTC                        | No aplica | No se usa                                          |

## V1 Codificación y saneamiento

- React escapa todo texto por defecto. No hay `dangerouslySetInnerHTML` en la web (búsqueda del
  24/11/2026). Los textos enriquecidos se guardan y muestran como texto plano.
- Toda consulta a la base va por Prisma con parámetros. Las pocas consultas manuales usan la
  plantilla etiquetada `$queryRaw`, que también envía parámetros. Semgrep (`p/owasp-top-ten`) revisa
  cada cambio (paso 6 del numeral 11.4).
- Los PDF se arman con plantillas HTML que escapan los datos antes de enviarlos a Gotenberg.

## V2 Validación y lógica de negocio

- Cada punto de la API declara su esquema Zod en `packages/contracts`. Los objetos son estrictos y
  un campo desconocido se rechaza con 422, así que no se puede asignar en masa.
- Las reglas de negocio (estados, plazos, montos con `decimal.js`) viven en el dominio y tienen
  pruebas unitarias con 90 % de cobertura mínima.
- Las operaciones que no deben repetirse usan `Idempotency-Key`, y las ediciones usan `If-Match`
  con la versión del registro. Así no se pierden cambios cuando dos personas editan a la vez.

## V3 Seguridad del navegador

- Política de seguridad del contenido con nonce por petición y `strict-dynamic`: no hay scripts en
  línea sin firma. También `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y
  `frame-ancestors 'none'`. Se comprueba en `apps/web/e2e/security.spec.ts` y en
  `apps/web/src/lib/platform.test.ts`.
- **B43:** `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Resource-Policy: same-origin`
  en la web y la API.
- **B43:** las páginas de enlace personal (firma, cotización, encuesta, baja, segundo factor y
  términos) ya no se guardan en caché ni se indexan. Antes solo lo hacían `/app`, `/portal` y
  cuatro pantallas de acceso. Una prueba falla si se agrega una página de acceso o de cliente sin
  incluirla en la lista.
- Cookies `__Host-`, `Secure`, `HttpOnly` y `SameSite=Lax` (`session-cookie.ts`).
- **Aceptado:** `style-src 'unsafe-inline'`, porque Radix posiciona menús con estilos en línea. El
  numeral 15.6 solo prohíbe lo en línea en los scripts. Está anotado en `.zap/reglas.tsv`.
- El regreso después de iniciar sesión (`volver`) solo acepta rutas propias (`safeReturnPath`): no
  permite redirigir a otro sitio.

## V4 API y servicios web

- Toda respuesta lleva `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y una CSP que
  no carga nada. Los errores también, lo que se comprueba desde B43 en `request-chain.test.ts`.
- CORS solo con los orígenes propios y con la lista cerrada de cabeceras permitidas (`app.ts`).
- Cuerpos JSON de máximo 1 MB. Límite de peticiones global, y uno más estricto (10 por minuto) en
  el ingreso.
- La documentación OpenAPI no se publica en producción (`openapi.ts`). Una prueba compara el
  OpenAPI con las rutas reales.

## V5 Manejo de archivos

- Se valida el tipo real por su contenido, el tamaño máximo es `MAX_FILE_BYTES` y cada archivo pasa
  por el antivirus ClamAV. Mientras no se analiza, queda «en análisis».
- Los archivos se guardan en almacenamiento privado (Garage), fuera del servidor web, y se
  descargan con enlaces de corta duración y `Content-Disposition: attachment`.

## V6 Autenticación

- Contraseñas de mínimo 12 caracteres, comparadas contra una lista de contraseñas filtradas
  (`leaked-passwords.ts`). Hash Argon2id con sal por usuario (`password-hasher.ts`).
- Segundo factor TOTP obligatorio para los usuarios internos y los administradores de cliente, con
  diez códigos de recuperación de un solo uso.
- Retraso progresivo tras cada intento fallido y bloqueo de 15 minutos al quinto
  (`login-throttle.ts`). El mensaje no revela si el correo existe.
- No hay registro abierto: solo invitación, con enlace de un solo uso que vence en 72 horas. La
  recuperación usa un enlace de 30 minutos y cierra todas las sesiones.
- Las acciones de alto riesgo piden confirmar la identidad (`reauthenticate`, válido 30 minutos).

## V7 Sesiones

- La llave de sesión es aleatoria, de 256 bits, y en la base se guarda solo su hash. Se entrega una
  llave nueva al completar el ingreso.
- Vence a las 8 horas de inactividad y a las 12 horas en total para los usuarios internos. Se puede
  cerrar de forma remota y el retiro de un colaborador revoca sus sesiones.
- **B43:** el análisis de ZAP con sesión comprueba al final que la sesión de análisis siguió activa:
  el análisis atacó las rutas, no el ingreso.

## V8 Autorización

- Permiso declarado en cada punto (`RequirePermission`, `Public`, `OwnAccount`). Una prueba recorre
  todas las rutas y falla si una pública no está en la lista permitida (`access.test.ts`).
- Cada caso de uso autoriza sobre el registro concreto (ABAC, numeral 15.4) y responde 404 cuando el
  registro es de otra persona o de otra empresa.
- Seguridad por fila en PostgreSQL con `tenant_id` en toda tabla de negocio. Las pruebas de
  aislamiento corren en cada cambio (`tenant-isolation.int.test.ts` y las de cada módulo).

## V9 y V10

No aplican: la sesión es una cookie opaca. No se usan JWT, OAuth ni OIDC.

## V11 Criptografía

Inventario de algoritmos:

| Uso                                                   | Algoritmo                                        | Dónde                                    |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| Contraseñas                                           | Argon2id (parámetros OWASP)                      | `iam/infrastructure/password-hasher.ts`  |
| Campos sensibles (secreto TOTP, salud, disciplinario) | AES-256-GCM con llave derivada por HKDF          | `platform/crypto/field-cipher.ts`        |
| Llaves de sesión, enlaces y códigos                   | Aleatorio criptográfico; en la base, SHA-256     | `iam`, `contract`                        |
| Cadena de auditoría y de eventos de firma             | SHA-256 encadenado                               | `platform/audit`, `contract`             |
| Huella del documento firmado                          | SHA-256                                          | `contract/application/signature-work.ts` |
| **Sello de integridad del PDF firmado (B43)**         | Firma CMS separada (PAdES básico), RSA y SHA-256 | `platform/pdf/pdf-seal.ts`               |
| Transporte                                            | TLS 1.2 o superior (Caddy)                       | `infra/caddy/Caddyfile`                  |

- **B43:** el PDF firmado por todos queda sellado con el certificado de la empresa. Cualquier lector
  de PDF muestra quién lo selló y avisa si alguien cambió el archivo. La huella del certificado queda
  en el proceso de firma (la base impide cambiarla) y en la auditoría.
- **Parcial:**
  - fuera de producción el sello usa un certificado temporal que ningún lector reconoce como de
    confianza. El certificado real de ARZA TECH se instala en B44;
  - el sello todavía no lleva sello de tiempo de una autoridad (RFC 3161). La fecha la da el
    servidor y queda en la cadena de eventos.

## V12 Comunicaciones seguras

- HSTS de un año con `includeSubDomains` y `preload` desde la API y la web. Caddy obtiene y renueva
  los certificados.
- **Parcial:** el Caddyfile del ambiente de pruebas envía HSTS sin `includeSubDomains` ni `preload`
  (es un subdominio de pruebas). El servidor de producción (B44) debe aplicar las cabeceras completas
  del numeral 15.6.

## V13 Configuración

- Los secretos solo viven en variables de entorno. Los servicios validan su configuración al
  arrancar y no muestran valores (`load-config.ts`). gitleaks revisa cada commit y todo el historial.
- **B43:** en producción el worker no arranca sin el certificado del sello y su clave
  (`PDF_SEAL_PKCS12`, `PDF_SEAL_PASSPHRASE`).
- Dependencias con versiones fijas en el archivo de bloqueo, osv-scanner en cada cambio y Trivy
  sobre las imágenes.
- **B43:** cada versión produce el inventario de componentes (SBOM CycloneDX por imagen) y los
  avisos de terceros. La verificación falla si entra una licencia que obligue a publicar el código
  de ARZA ONE.
- **B43:** el sello no instala pdfkit 0.10 ni su `crypto-js` 3, que tiene una vulnerabilidad
  crítica (ver `pnpm-workspace.yaml`).
- **Parcial:** no hay gestor de secretos ni rotación automática. La rotación por guion del numeral
  15.7 se arma con el servidor de producción (B44).

## V14 Protección de datos

- `no-store` en toda respuesta con datos. Los datos sensibles se cifran por campo. Las
  exportaciones del titular solo salen de una solicitud verificada (B42).
- Retención automática (B35, B41 y B42) y supresión con bloqueo por obligación legal.

## V15 Código y arquitectura seguros

- Monolito modular con fronteras comprobadas por dependency-cruiser. Sin `any` ni reglas del
  analizador desactivadas.
- Toda escritura: una transacción con su evento de auditoría y su evento de bandeja de salida.
- Las dependencias nuevas de B43 (`@signpdf/*` con licencia MIT y `node-forge` con licencia BSD)
  tienen mantenimiento activo. Ver el cierre del bloque.

## V16 Registros y errores

- Registros JSON con identificador de correlación. Nunca se registran contraseñas, cookies,
  códigos ni llaves.
- **B43 (hallazgo de ZAP):** un texto con el carácter nulo causaba un error interno en PostgreSQL;
  ahora se rechaza antes de validar, con 422 (`platform/http/null-character.pipe.ts`).
- **B43:** tampoco las contraseñas al cambiarlas, el secreto del segundo factor, los códigos de
  recuperación ni la clave del sello (`logging.module.ts`).
- Los errores responden con un formato único sin detalles internos. La auditoría es de solo
  inserción y encadenada por hash, con verificación diaria.
- **Parcial:** la recolección central de errores y las alertas (GlitchTip, Uptime Kuma) son de
  B44.

## Análisis dinámico y carga

- **ZAP** (`.github/workflows/zap-semanal.yml`) analiza la web, la API sin sesión y, **desde B43**,
  la API con la sesión de una cuenta de análisis (rol Dirección y Comercial, con segundo factor).
  Falla con cualquier alerta de riesgo alto. Resultado de la ejecución del pull request de B43: ver
  `docs/bloques/B43-cierre.md`.
- **k6** (`.github/workflows/rendimiento.yml`) mide 50 usuarios simultáneos sobre 2000 terceros
  adicionales, con las metas del numeral 21.1. Resultado: ver el cierre del bloque.
