# 6. Cómo usar este manual y qué cambia frente a los avances anteriores

## 6.1 Cómo leerlo

| **Si usted quiere…**                                                         | **Lea…**                                                  |
|------------------------------------------------------------------------------|-----------------------------------------------------------|
| **Entender qué se va a construir y por qué**                                 | Capítulos 7 y 8                                           |
| **Saber qué herramientas se usan, cuáles son gratuitas y qué hay que pagar** | Capítulos 9 y 10                                          |
| **Conocer qué hace cada módulo y qué documentos del SGC digitaliza**         | Capítulos 17 y 18                                         |
| **Revisar el cumplimiento legal, las cookies, los derechos y deberes**       | Capítulos 19 y 20                                         |
| **Empezar a construir con Claude Code**                                      | Capítulo 23 y anexos A y B                                |
| **Verificar si una entrega está bien hecha**                                 | Capítulo 21 y anexo E                                     |
| **Dar a Claude Code el detalle técnico de un bloque**                        | Capítulos 11 a 16 y la ficha del módulo en el capítulo 17 |

## 6.2 Qué se conserva de los documentos V1.0, V2.0 y V3.0

Se conservan íntegramente la visión de plataforma integrada y no de módulos sueltos, los principios de seguridad y privacidad desde el diseño, mínimo privilegio, cero papel y trazabilidad total, el flujo de valor de contacto a satisfacción, el estilo de monolito modular, PostgreSQL como base de datos, TypeScript en todo el sistema, la preparación multiempresa, la separación entre la operación comercial y el adaptador fiscal, las reglas no negociables y el orden de construcción que empieza por el núcleo.

## 6.3 Decisiones que este manual cierra o cambia

Los avances dejaron varias decisiones abiertas o tomadas pensando en una empresa con equipo técnico amplio. Este manual las cierra con un criterio: la plataforma la construye y la opera una empresa que inicia, con una sola persona al frente y sin costos de licencias. Cada cambio queda registrado como decisión de arquitectura en el capítulo 8.

| **Tema**                        | **En los avances**                  | **Decisión en este manual**                                                                                                   | **Razón**                                                                                                                 |
|---------------------------------|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| **Identidad**                   | Proveedor externo OIDC/OAuth2       | Módulo de identidad propio con sesiones seguras, Argon2id y MFA; queda preparado para conectar un proveedor externo           | Un servidor de identidad aparte duplica la operación y no aporta valor con un solo sistema                                |
| **Tecnología del backend**      | «NestJS o equivalente»              | NestJS, sin alternativa                                                                                                       | Estructura modular explícita que facilita el trabajo con Claude Code                                                      |
| **Contabilidad, nómina y DIAN** | Módulos propios M08 y M10           | Se integran con el software contable habilitado; la plataforma lleva la operación                                             | Construir contabilidad y transmisión fiscal exige habilitación, mantenimiento normativo permanente y revisión profesional |
| **Observabilidad**              | OpenTelemetry completo              | Registros estructurados, monitoreo de disponibilidad y captura de errores; trazas distribuidas cuando haya más de un servicio | Proporcional a un solo servidor                                                                                           |
| **Infraestructura**             | Infraestructura como código en nube | Un servidor por ambiente con Docker Compose y guiones versionados                                                             | Reproducible, económico y suficiente para la carga esperada                                                               |
| **Ambientes**                   | Local, Dev, QA, Staging, Producción | Local, Pruebas (staging) y Producción                                                                                         | Cinco ambientes no se justifican con un equipo de una persona                                                             |
| **Almacenamiento de archivos**  | S3 compatible sin definir           | Garage autoalojado con interfaz S3; el código no depende del proveedor                                                        | MinIO, la opción habitual, dejó de mantener su edición comunitaria                                                        |
| **Mapa de módulos**             | 20 módulos M01 a M20                | 21 módulos M00 a M20 reorganizados según el mapa de procesos del SGC                                                          | Cada módulo responde a un proceso y a sus documentos                                                                      |
| **Inteligencia artificial**     | Módulo transversal desde el inicio  | Fase final, después de producción, con pasarela de control                                                                    | Primero datos ordenados y permisos probados; la IA sin eso es un riesgo                                                   |
| **Siguiente entregable**        | Serie V3.1 a V3.7 y V4.0            | Este manual es la especificación consolidada; el detalle fino de cada bloque lo produce Claude Code como parte del bloque     | Evita meses de documentación previa sin software funcionando                                                              |
