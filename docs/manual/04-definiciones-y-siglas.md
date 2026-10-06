# 4. Definiciones y siglas

| **Término**                    | **Definición**                                                                                                                               |
|--------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **ARZA ONE**                   | Nombre del producto: la plataforma empresarial integral de ARZA TECH S.A.S.                                                                  |
| **Backend**                    | Parte del sistema que corre en el servidor: aplica las reglas del negocio, valida permisos y guarda los datos. El usuario no la ve.          |
| **Frontend**                   | Parte del sistema que se ve en el navegador: pantallas, formularios y tableros.                                                              |
| **API**                        | Interfaz de programación. Conjunto de direcciones por las que el frontend y otros sistemas piden o envían datos al backend.                  |
| **Base de datos**              | Almacén estructurado de la información (PostgreSQL). Cada tipo de dato vive en una tabla.                                                    |
| **Monolito modular**           | Una sola aplicación desplegable, organizada internamente en módulos independientes con fronteras estrictas.                                  |
| **Repositorio**                | Carpeta del proyecto con todo el código y su historial de cambios, administrada con Git y alojada en GitHub.                                 |
| **Rama, commit, pull request** | Línea de trabajo paralela; cambio guardado con mensaje; solicitud de integrar una rama a la principal después de revisión y pruebas.         |
| **CI/CD**                      | Integración y despliegue continuos: verificaciones automáticas que se ejecutan con cada cambio y publicación automatizada en los servidores. |
| **Contenedor (Docker)**        | Paquete que incluye un programa y todo lo que necesita para ejecutarse igual en cualquier equipo o servidor.                                 |
| **VPS**                        | Servidor virtual privado alquilado a un proveedor de nube.                                                                                   |
| **Tenant (empresa inquilina)** | Cada empresa cuyos datos viven aislados dentro de la plataforma. Al inicio solo existe ARZA TECH.                                            |
| **RBAC / ABAC**                | Control de acceso por rol y por atributos (por ejemplo, «solo los proyectos donde participa»).                                               |
| **RLS**                        | Seguridad a nivel de fila: la base de datos impide leer filas de otra empresa aunque el código se equivoque.                                 |
| **MFA / TOTP**                 | Autenticación de varios factores; código temporal de seis dígitos generado por una aplicación en el celular.                                 |
| **Migración**                  | Archivo versionado que cambia la estructura de la base de datos de forma controlada y repetible.                                             |
| **Flujo (workflow)**           | Secuencia de estados y aprobaciones por la que pasa un registro (por ejemplo, un contrato).                                                  |
| **Evento de auditoría**        | Registro inalterable de quién hizo qué, cuándo, sobre qué y con qué resultado.                                                               |
| **ADR**                        | Registro de decisión de arquitectura: documento corto que explica una decisión técnica y sus razones.                                        |
| **Bloque**                     | Unidad de trabajo que se encarga a Claude Code: tiene objetivo, entregables y criterios de aceptación.                                       |
| **MVP / primera versión**      | Conjunto mínimo de módulos con el que la plataforma entra en producción.                                                                     |
| **Mensaje de datos**           | Información generada, enviada, recibida o almacenada por medios electrónicos (Ley 527 de 1999).                                              |
| **Firma electrónica**          | Método que identifica a una persona y prueba que aprobó un mensaje de datos, confiable según su propósito (Decreto 2364 de 2012).            |
| **Titular**                    | Persona natural cuyos datos personales son objeto de tratamiento.                                                                            |
| **SGC / PHVA**                 | Sistema de Gestión de la Calidad; ciclo planear, hacer, verificar y actuar.                                                                  |
| **SAD**                        | Solicitud de Acción Documental (FT-SGC-001).                                                                                                 |
| **PQRSF**                      | Petición, queja, reclamo, sugerencia o felicitación.                                                                                         |
| **OWASP / ASVS**               | Proyecto abierto de seguridad de aplicaciones; su estándar de verificación de seguridad por niveles.                                         |
| **WCAG**                       | Pautas de accesibilidad para el contenido web.                                                                                               |
| **RTO / RPO**                  | Tiempo máximo para restablecer el servicio; pérdida máxima de datos tolerable, medida en tiempo.                                             |
