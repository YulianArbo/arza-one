# Cierre del bloque B43 — Endurecimiento de seguridad y rendimiento

- Módulo: Plataforma · Fase F8 · Depende de B30 y B42 · **Bloque crítico: requiere revisión externa**
- Construido por Claude Code el 23 y 24/11/2026, con el plan aprobado por el propietario («Apruebo
  todo», 8 decisiones).
- Rama `feat/b43-endurecimiento-de-seguridad-y`, desde `cccd5e2` (`main` con B42 ya fusionado).
  Pull request #99.
- Revisión de seguridad completa: [`docs/seguridad/asvs-nivel-2.md`](../seguridad/asvs-nivel-2.md).

## Qué se construyó

- **Cabeceras de seguridad definitivas.**
  - La web y la API impiden que otra página comparta la ventana de ARZA ONE o use sus archivos
    (dos cabeceras nuevas).
  - Las pantallas que se abren con un enlace personal ya no se guardan en la memoria del navegador
    ni aparecen en buscadores. Son: firmar, cotización, encuesta, darse de baja, segundo factor y
    aceptar términos. Antes solo estaban protegidas la aplicación, el portal y cuatro pantallas de
    acceso.
  - Una prueba falla si mañana se agrega una pantalla de ese tipo sin protegerla.
- **Sello de integridad de la empresa en los PDF firmados** (numeral 19.3).
  - Cuando todos firman, el PDF final queda sellado con el certificado de la empresa. Si alguien
    cambia el archivo, aunque sea una coma, Adobe Reader o cualquier lector de PDF avisa que la
    firma ya no es válida. También muestra quién selló.
  - La huella del certificado queda guardada en el proceso de firma y en la auditoría. La base de
    datos impide cambiarla.
  - La verificación pública (`/verificar`) sigue funcionando igual.
- **Revisión contra OWASP ASVS nivel 2**, la lista internacional de controles que pide el manual.
  - Recorre los 17 capítulos y dice cómo se cumple cada uno, con qué prueba se comprueba y qué
    falta.
  - Se corrigió lo que se encontró dentro del alcance: las pantallas de enlace personal y más datos
    sensibles ocultos en los registros (contraseñas al cambiarlas, secreto del segundo factor y
    clave del sello).
- **ZAP con sesión iniciada.** ZAP es el programa que ataca la aplicación como lo haría un intruso.
  - Antes solo revisaba lo público. Ahora también entra como una cuenta de análisis (roles
    Dirección y Comercial, con segundo factor real) y ataca toda la API.
  - Falla con cualquier hallazgo alto o crítico.
- **Pruebas de carga con k6.**
  - Simulan 50 personas usando la plataforma a la vez durante 5 minutos, sobre una copia a la que
    antes se le agregan 2000 terceros.
  - Fallan si las consultas tardan más de medio segundo o las grabaciones más de un segundo (en el
    95 % de los casos).
- **Inventario de componentes (SBOM) y avisos de terceros.**
  - Cada versión produce la lista de todo lo que lleva por dentro cada servidor y un archivo con
    las licencias de las librerías.
  - La verificación falla si entra una librería cuya licencia obligue a publicar el código de
    ARZA ONE.

### Criterios de aceptación

| Criterio                                                 | Cómo se cumple                                                                                                                                                                                                               | Dónde se comprueba                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Cero hallazgos altos o críticos                          | ZAP (con y sin sesión), Semgrep, osv-scanner, Trivy y gitleaks fallan con uno solo                                                                                                                                           | Tareas 6, 8 y «10. OWASP ZAP» del PR #99                                                       |
| Metas de rendimiento del numeral 21.1                    | Umbrales de k6: percentil 95 menor a 500 ms en consultas y a 1 s en escrituras, con 50 usuarios                                                                                                                              | «Rendimiento con 50 usuarios (k6)» del PR #99                                                  |
| `pnpm check` en verde                                    | Ver «Cómo se probó»                                                                                                                                                                                                          | Integración continua del PR #99                                                                |
| Permiso denegado, aislamiento entre empresas y auditoría | El sello no abre rutas nuevas. Siguen en verde las pruebas de firma: otra empresa no ve el documento y quien no tiene permiso es rechazado. Nueva prueba: el sello deja su huella en la auditoría y la base impide cambiarla | `signature-journey.int.test.ts`, `signature-rules.int.test.ts`, `tenant-isolation.int.test.ts` |
| Documentación y cierre                                   | Este archivo, el informe ASVS, `sig.md`, `apps/api/README.md` y la guía de integración continua                                                                                                                              | —                                                                                              |

## Decisiones (aprobadas el 23/11/2026)

1. Una rama, commits pequeños y un pull request.
2. El propietario autorizó cambiar la integración continua: ZAP con sesión, k6, SBOM y revisión de
   licencias.
3. El sello se hace con Gotenberg si puede; si no, con `@signpdf` (licencia MIT).
4. En pruebas se usa un certificado temporal. El certificado real se instala en B44.
5. Los documentos firmados antes de B43 no se vuelven a sellar.
6. k6 (licencia AGPL) solo se usa como herramienta de prueba en GitHub; no se entrega con el
   producto.
7. Un hallazgo alto sin corrección publicada se registra como excepción con motivo y vencimiento,
   y lo aprueba el propietario en el PR.
8. Revisión externa: el informe ASVS es la guía del revisor, no lo reemplaza.

### Decisiones técnicas tomadas durante la construcción (le pido revisarlas)

- **Gotenberg no sirve para sellar.** La versión que usamos (8.37) no firma PDF; eso llega en
  Gotenberg 9. Por la decisión 3 se usó `@signpdf` 4.0 (licencia MIT, con publicaciones en 2026),
  con `node-forge` 1.4.3 (licencia BSD, con publicaciones en noviembre de 2026).
- **Se evitó una librería vulnerable.** Una pieza de `@signpdf` pide pdfkit 0.10, que trae
  `crypto-js` 3 con una vulnerabilidad crítica. La pieza nunca usa pdfkit, así que en
  `pnpm-workspace.yaml` se declaró que ese requisito es opcional: pdfkit no se instala. Se comprobó
  que el sello funciona sin él.
- **El sello va después de unir el documento y antes de calcular su huella.** Así la verificación
  pública compara el archivo sellado que recibe cada firmante.
- **Sin el certificado real, la producción no arranca** (`PDF_SEAL_PKCS12` y `PDF_SEAL_PASSPHRASE`).
  Fuera de producción el worker crea un certificado temporal a su nombre, con la marca «sin
  validez».
- **La cuenta de análisis** de ZAP y k6 solo existe en la copia desechable de GitHub. Se invita,
  activa y configura con el mismo camino que una persona, con contraseña y segundo factor
  aleatorios que nadie ve. ZAP no ataca las rutas de salir, cerrar sesiones ni cambiar contraseña o
  segundo factor, porque perdería la sesión. Esas rutas ya las cubren las pruebas de Identidad.
- **Una alerta de ZAP queda aceptada** en `.zap/reglas.tsv`: los estilos en línea que usan los
  menús, que el manual permite. No es de riesgo alto.
- **ZAP y k6 también corren en el pull request** que cambie sus propios archivos. Así se pudieron
  comprobar en este PR antes de fusionarlo.

## Cómo se probó

En este equipo (24/11/2026):

- Tipos de los 13 paquetes, límites entre módulos (`pnpm boundaries`) y código sin uso (`knip`):
  en verde.
- Unitarias de la API: 466 pruebas. Una (`openapi.test.ts`) se pasó de tiempo con el equipo
  cargado y pasó al repetirla sola.
- Unitarias del worker, de los guiones de infraestructura (cobertura 99,5 %) y de las cabeceras de
  la web: en verde.
- Integración con base de datos real: firma (journey, otrosíes y reglas), activos, contratación,
  portal, entregas de proyectos, migraciones, permisos de base de datos, columnas de control y
  aislamiento entre empresas, en verde. Incluye la prueba nueva del sello: el PDF descargado pasa
  la comprobación del lector, un cambio la rompe y la base impide cambiar el certificado.
- Sello probado a mano con PDF reales generados por Gotenberg: sellado correcto, también sin
  pdfkit instalado.
- El guion de k6 se validó con `k6 inspect`.

Lo que solo corre en GitHub (memoria del equipo): suite completa de integración, pruebas en
navegador, imágenes con Trivy y SBOM, ZAP con sesión y k6. Sus resultados están en la pestaña
**Checks** del PR #99.

## Cómo lo pruebo yo en el navegador

Necesita el ambiente local encendido (`pnpm infra:up` y `pnpm dev`).

1. **Sello del PDF firmado.**
   1. Inicie sesión, abra un contrato aprobado y envíelo a firma, como en B25.
   2. Firme como cliente (el código llega a Mailpit, http://localhost:8025) y luego como empresa.
   3. Espere unos segundos y descargue el «documento firmado» desde la ficha del contrato.
   4. Ábralo con **Adobe Acrobat Reader**. Arriba debe aparecer una barra de firmas que dice que el
      documento fue firmado por «ARZA ONE (local, sin validez)». En su equipo saldrá el aviso
      «la identidad del firmante es desconocida», porque es el certificado temporal. Con el
      certificado real de B44 ese aviso desaparece.
   5. Opcional: abra el PDF con un editor, cambie una letra y guarde. Al abrirlo de nuevo, Adobe
      debe decir que el documento **fue modificado después de firmarse**.
2. **Páginas de enlace personal.** Abra http://localhost:3000/firmar y presione F12, pestaña
   **Red** (Network). Recargue la página y haga clic en la primera fila. En las cabeceras de la
   respuesta deben aparecer `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow`.
3. **Resultados de ZAP y k6.** En el PR #99, pestaña **Checks**:
   1. Abra «10. OWASP ZAP» y, abajo, el artefacto `informes-zap`. Son tres informes en HTML (web,
      API sin sesión y API con sesión). Ninguno debe tener alertas «High».
   2. Abra «Rendimiento con 50 usuarios (k6)» y el artefacto `resumen-k6` para ver los tiempos.
4. **Inventario y avisos.** En la ejecución de «Verificaciones» del PR, descargue los artefactos
   `avisos-de-terceros` (lista de librerías y licencias) y `sbom-…` (inventario de cada servidor).

## Qué quedó pendiente

- **Certificado real del sello** y su instalación en el servidor de producción (B44). Debe ser de
  ARZA TECH: de una entidad certificadora acreditada o uno propio. **Usted decide cuál.**
- **Sello de tiempo de una autoridad** (RFC 3161) dentro del sello, para que la fecha no dependa del
  servidor. Requiere contratar el servicio; se propone para después de la salida a producción.
- **Cabeceras de Caddy en producción** con HSTS completo (`includeSubDomains` y `preload`), en B44.
- **Gestor de secretos y rotación por guion** (numeral 15.7), en B44.
- **Revisión externa y prueba de intrusión** (numeral 21.4): este bloque es crítico.
- **Pasar a Gotenberg 9**, que ya sella PDF: se evaluaría en una actualización controlada.
