# 9. Tecnologías y bibliotecas

Todo el software de la plataforma es gratuito y de código abierto. Se prefieren licencias permisivas (MIT, Apache 2.0, BSD, PostgreSQL); los componentes con licencia de reciprocidad fuerte (AGPL o GPL) se usan únicamente como servicios independientes en su propio contenedor, sin incorporar su código al de ARZA ONE, de modo que no condicionan la propiedad del software. Las versiones se fijan en el repositorio al iniciar cada fase tomando la versión estable con soporte vigente.

## 9.1 Base y backend

| **Función**                       | **Herramienta**                                       | **Licencia**                 | **Uso en la plataforma**                                           |
|-----------------------------------|-------------------------------------------------------|------------------------------|--------------------------------------------------------------------|
| **Entorno de ejecución**          | Node.js (versión LTS vigente, 24 o superior)          | MIT                          | Ejecuta backend, worker y frontend                                 |
| **Lenguaje**                      | TypeScript en modo estricto                           | Apache 2.0                   | Todo el código                                                     |
| **Gestor de paquetes y monorepo** | pnpm y Turborepo                                      | MIT                          | Dependencias y tareas del repositorio                              |
| **Marco del backend**             | NestJS                                                | MIT                          | API y worker                                                       |
| **Acceso a datos y migraciones**  | Prisma                                                | Apache 2.0                   | Modelo, consultas tipadas, migraciones                             |
| **Base de datos**                 | PostgreSQL con pgcrypto, pg_trgm, unaccent y pgvector | PostgreSQL                   | Datos, búsqueda y, a futuro, búsqueda semántica                    |
| **Validación y contratos**        | Zod y nestjs-zod                                      | MIT                          | Validación de entradas y generación de OpenAPI                     |
| **Autorización**                  | CASL                                                  | MIT                          | Reglas RBAC y ABAC                                                 |
| **Contraseñas**                   | @node-rs/argon2                                       | MIT                          | Hash Argon2id                                                      |
| **Segundo factor**                | otpauth                                               | MIT                          | Códigos TOTP y códigos de recuperación                             |
| **Colas y tareas programadas**    | BullMQ sobre Valkey                                   | MIT / BSD                    | Trabajos en segundo plano                                          |
| **Archivos**                      | Cliente S3 del SDK de AWS contra Garage               | Apache 2.0 / AGPL (servicio) | Carga, descarga y enlaces temporales                               |
| **Antivirus**                     | ClamAV                                                | GPL (servicio)               | Análisis de archivos cargados                                      |
| **Generación de PDF**             | Gotenberg                                             | MIT                          | Cotizaciones, contratos, actas, certificados                       |
| **Plantillas de documentos**      | docxtemplater (núcleo) y Handlebars                   | MIT                          | Relleno de plantillas institucionales                              |
| **Correo**                        | Nodemailer y React Email                              | MIT                          | Envío y plantillas de correo                                       |
| **Registros**                     | Pino                                                  | MIT                          | Registros estructurados en JSON                                    |
| **Seguridad HTTP**                | Helmet y limitador de peticiones de NestJS            | MIT                          | Cabeceras y protección contra abuso                                |
| **Fechas y dinero**               | date-fns y decimal.js                                 | MIT                          | Cálculo de plazos en días hábiles y operaciones monetarias exactas |

## 9.2 Frontend

| **Función**              | **Herramienta**                                    | **Licencia** | **Uso en la plataforma**                         |
|--------------------------|----------------------------------------------------|--------------|--------------------------------------------------|
| **Marco web**            | Next.js (enrutador de aplicaciones) y React        | MIT          | Sitio, aplicación interna y portal               |
| **Estilos**              | Tailwind CSS                                       | MIT          | Sistema de diseño con variables de marca         |
| **Componentes**          | shadcn/ui sobre Radix UI                           | MIT          | Botones, diálogos, menús, formularios accesibles |
| **Iconos**               | Lucide                                             | ISC          | Iconografía única                                |
| **Datos del servidor**   | TanStack Query                                     | MIT          | Consultas, caché y sincronización                |
| **Tablas**               | TanStack Table                                     | MIT          | Listados con orden, filtro y paginación          |
| **Formularios**          | React Hook Form con Zod                            | MIT          | Validación idéntica a la del backend             |
| **Gráficas**             | Recharts                                           | MIT          | Tableros e indicadores                           |
| **Tableros de tarjetas** | dnd-kit                                            | MIT          | Arrastrar y soltar en vistas kanban              |
| **Editor de texto**      | Tiptap (núcleo)                                    | MIT          | Descripciones, actas y plantillas                |
| **Visor de documentos**  | PDF.js                                             | Apache 2.0   | Lectura de PDF sin descargar                     |
| **Tipografías**          | Montserrat e Inter, alojadas en el propio servidor | OFL          | Identidad corporativa sin llamadas a terceros    |

## 9.3 Calidad, seguridad y operación

| **Función**                         | **Herramienta**                             | **Licencia**                    | **Uso**                                                           |
|-------------------------------------|---------------------------------------------|---------------------------------|-------------------------------------------------------------------|
| **Pruebas unitarias e integración** | Vitest, Supertest y Testcontainers          | MIT                             | Reglas de negocio y API contra una base de datos real desechable  |
| **Pruebas de extremo a extremo**    | Playwright con axe-core                     | Apache 2.0 / MPL                | Recorridos completos en navegador y accesibilidad                 |
| **Estilo y análisis de código**     | ESLint, Prettier, dependency-cruiser y knip | MIT / ISC                       | Formato, errores comunes, fronteras entre módulos, código sin uso |
| **Mensajes de cambio**              | commitlint y lefthook                       | MIT                             | Aplican IN-TEC-002 antes de cada commit                           |
| **Secretos en el código**           | gitleaks                                    | MIT                             | Impide subir contraseñas o llaves                                 |
| **Análisis estático de seguridad**  | Semgrep edición comunitaria                 | LGPL (herramienta)              | Patrones inseguros                                                |
| **Dependencias vulnerables**        | osv-scanner y Renovate                      | Apache 2.0 / AGPL (herramienta) | Alertas y actualización controlada                                |
| **Imágenes de contenedor**          | Trivy                                       | Apache 2.0                      | Vulnerabilidades en las imágenes                                  |
| **Análisis dinámico**               | OWASP ZAP                                   | Apache 2.0                      | Prueba automática de la aplicación desplegada en pruebas          |
| **Contenedores**                    | Docker Engine y Docker Compose              | Apache 2.0                      | Empaquetado y despliegue                                          |
| **Proxy y TLS**                     | Caddy                                       | Apache 2.0                      | HTTPS automático                                                  |
| **Copias de seguridad**             | pgBackRest y restic                         | MIT / BSD                       | Copias cifradas y recuperación a un punto en el tiempo            |
| **Disponibilidad**                  | Uptime Kuma                                 | MIT                             | Vigilancia y alertas                                              |
| **Errores de aplicación**           | GlitchTip                                   | MIT                             | Captura de errores con contexto                                   |
| **Correo en desarrollo**            | Mailpit                                     | MIT                             | Bandeja falsa para pruebas                                        |

## 9.4 Lo que sí tiene costo

El software es gratuito; la operación no lo es del todo. Los valores son estimaciones de mercado y deben confirmarse con cada proveedor antes de contratar.

| **Concepto**                                | **Para qué**                     | **Costo estimado**           | **Nota**                                                                                             |
|---------------------------------------------|----------------------------------|------------------------------|------------------------------------------------------------------------------------------------------|
| **Suscripción de Claude con Claude Code**   | Construir la plataforma          | Plan Pro o Max, según el uso | El plan gratuito no incluye Claude Code. Una construcción intensiva suele requerir un plan Max       |
| **Servidor de producción**                  | Alojar la plataforma             | USD 20 a 40 al mes           | 4 vCPU, 8 GB de RAM, 160 GB SSD                                                                      |
| **Servidor de pruebas**                     | Probar antes de publicar         | USD 6 a 15 al mes            | Puede apagarse cuando no se usa                                                                      |
| **Almacenamiento externo de copias**        | Copias fuera del servidor        | USD 1 a 6 al mes             | Se paga por lo almacenado                                                                            |
| **Dominio**                                 | Dirección de la plataforma       | Cerca de \$90.000 al año     | Ya previsto en PL-FIN-001                                                                            |
| **Correo transaccional**                    | Avisos y códigos de verificación | Sin costo al inicio          | El correo corporativo o un servicio con capa gratuita cubren el volumen inicial                      |
| **GitHub**                                  | Repositorio y verificaciones     | Sin costo al inicio          | La cuota gratuita de minutos de Actions alcanza si las pruebas largas se ejecutan en el equipo local |
| **Revisión externa por hitos**              | Segunda opinión de un ingeniero  | Por horas, en cuatro hitos   | Recomendada; ver capítulo 23                                                                         |
| **Prueba de intrusión antes de producción** | Seguridad                        | Por cotización               | Recomendada antes de exponer datos de clientes                                                       |
