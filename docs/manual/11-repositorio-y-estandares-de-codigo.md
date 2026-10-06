# 11. Repositorio y estándares de código

## 11.1 Estructura del repositorio

```text
arza-one/
├── CLAUDE.md                  Instrucciones permanentes para Claude Code (anexo A)
├── README.md                  Cómo levantar el proyecto en un equipo nuevo
├── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├── apps/
│   ├── api/                   Backend NestJS
│   │   ├── prisma/            schema.prisma, migraciones, datos semilla
│   │   ├── src/
│   │   │   ├── main.ts · app.module.ts
│   │   │   ├── platform/      Piezas transversales: config, base de datos, contexto
│   │   │   │                  de empresa, guardas, auditoría, errores, archivos, colas
│   │   │   └── modules/       Un directorio por módulo M00–M20
│   │   │       └── crm/
│   │   │           ├── index.ts            Interfaz pública del módulo
│   │   │           ├── crm.module.ts
│   │   │           ├── interface/          controllers y DTO
│   │   │           ├── application/        casos de uso
│   │   │           ├── domain/             entidades, políticas, estados
│   │   │           ├── infrastructure/     repositorios y adaptadores
│   │   │           └── tests/              unitarias e integración
│   │   └── test/              Pruebas de integración transversales
│   ├── worker/                Procesadores de colas (reutiliza los módulos de api)
│   └── web/                   Frontend Next.js
│       ├── src/app/(public)/  Sitio público
│       ├── src/app/(app)/     Aplicación interna
│       ├── src/app/(portal)/  Portal del cliente
│       ├── src/features/      Un directorio por módulo: pantallas, hooks, formularios
│       ├── src/components/    Componentes compartidos de la aplicación
│       └── e2e/               Pruebas Playwright
├── packages/
│   ├── contracts/             Esquemas Zod, tipos y permisos compartidos
│   ├── ui/                    Sistema de diseño (componentes y tokens)
│   ├── config/                Configuración compartida de ESLint, TypeScript, Tailwind
│   └── templates/             Plantillas de correo y de documentos PDF
├── infra/
│   ├── compose/               Docker Compose por ambiente
│   ├── caddy/ · postgres/ · backup/
│   └── scripts/               Aprovisionar servidor, desplegar, restaurar
├── docs/
│   ├── manual/                Este manual en Markdown, por capítulos
│   ├── adr/                   Decisiones de arquitectura
│   ├── bloques/               Encargos de trabajo y su bitácora de cierre
│   └── runbooks/              Guías de operación e incidentes
└── .github/workflows/         Integración y despliegue continuos
```

## 11.2 Reglas de código limpio

Complementan el MN-TEC-001. Son obligatorias y la mayoría se verifica automáticamente; ningún cambio se integra si una verificación falla.

| **Tema**            | **Regla**                                                                                                                                                                                        |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Idioma**          | Código, nombres de tablas, columnas, variables y mensajes de commit en inglés. Textos de interfaz, mensajes al usuario, documentación funcional y comentarios de negocio en español de Colombia. |
| **Tipado**          | TypeScript estricto. Prohibido any, las aserciones sin validar y desactivar reglas del analizador sin un comentario que lo justifique.                                                           |
| **Tamaño**          | Funciones de máximo 40 líneas y un solo propósito; archivos de máximo 300 líneas; máximo tres niveles de anidación.                                                                              |
| **Nombres**         | Descriptivos y sin abreviaturas. Clases en PascalCase, variables y funciones en camelCase, tablas y columnas en snake_case, archivos en kebab-case.                                              |
| **Validación**      | Toda entrada externa se valida con un esquema Zod en el borde. Dentro del dominio los datos ya son válidos.                                                                                      |
| **Errores**         | Se lanzan errores de dominio tipados con código estable (por ejemplo CONTRACT_NOT_APPROVED). Nunca se silencian ni se devuelven trazas al usuario.                                               |
| **Transacciones**   | Un caso de uso es una transacción. Escritura, auditoría y eventos se confirman juntos o no se confirma nada.                                                                                     |
| **Acceso a datos**  | Solo los repositorios del propio módulo consultan sus tablas. Prohibido SQL concatenado; solo consultas parametrizadas.                                                                          |
| **Dinero y fechas** | Dinero con decimal.js y numeric(18,2); nunca números de punto flotante. Fechas en UTC; la zona horaria se aplica al mostrar.                                                                     |
| **Secretos**        | Solo en variables de entorno. Nunca en el código, en los registros, en las pruebas ni en los encargos a Claude Code.                                                                             |
| **Registros**       | Estructurados, con identificador de correlación. Nunca contraseñas, códigos, documentos de identidad completos ni datos sensibles.                                                               |
| **Pruebas**         | Todo caso de uso tiene pruebas del camino feliz, de cada regla de negocio, de permiso denegado y de aislamiento entre empresas.                                                                  |
| **Comentarios**     | Explican el porqué, no el qué. Toda regla que proviene de una norma o de un documento del SGC cita su código.                                                                                    |
| **Dependencias**    | Agregar una biblioteca exige justificarla en el pull request: licencia permisiva, mantenimiento activo y sin alternativa ya presente.                                                            |
| **Código muerto**   | No se deja código comentado, funciones sin uso ni marcas de pendiente sin número de bloque.                                                                                                      |

## 11.3 Ramas, commits y revisión

| **Elemento**           | **Convención**                                                                                                                                                   | **Referencia** |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| **Rama principal**     | main, siempre desplegable y protegida: no admite cambios directos                                                                                                | PT-TEC-001     |
| **Ramas de trabajo**   | feat/Bnn-descripcion, fix/descripcion, chore/descripcion; una por bloque o corrección                                                                            | PT-TEC-001     |
| **Mensajes de commit** | Convención Conventional Commits: tipo(módulo): descripción en imperativo                                                                                         | IN-TEC-002     |
| **Pull request**       | Plantilla con qué cambia, cómo se probó, capturas de pantalla, impacto en datos y seguridad, lista de verificación de la definición de terminado                 | PR-TEC-001     |
| **Revisión**           | Revisión automática con Claude Code en modo de revisión, más revisión humana del responsable técnico o del revisor externo en los bloques marcados como críticos | FT-TEC-002     |
| **Versiones**          | Versionado semántico vMAYOR.MENOR.PARCHE con notas de versión generadas a partir de los commits                                                                  | PR-TEC-003     |

## 11.4 Verificaciones automáticas en cada cambio

| **Orden** | **Verificación**                                                                  | **Falla si…**                                                         |
|-----------|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| **1**     | Formato y análisis estático (Prettier, ESLint)                                    | Hay una sola advertencia                                              |
| **2**     | Comprobación de tipos                                                             | Hay un error de tipos                                                 |
| **3**     | Fronteras entre módulos (dependency-cruiser) y código sin uso (knip)              | Un módulo importa el interior de otro                                 |
| **4**     | Pruebas unitarias con cobertura                                                   | Falla una prueba o la cobertura baja del umbral del capítulo 21       |
| **5**     | Pruebas de integración con base de datos real                                     | Falla una prueba, incluida la de aislamiento entre empresas           |
| **6**     | Secretos (gitleaks), análisis de seguridad (Semgrep) y dependencias (osv-scanner) | Se detecta un secreto o una vulnerabilidad alta o crítica             |
| **7**     | Migraciones: aplicar desde cero y sobre la versión anterior                       | Una migración no aplica o no es compatible hacia atrás                |
| **8**     | Construcción de imágenes y análisis con Trivy                                     | Vulnerabilidad crítica con corrección disponible                      |
| **9**     | Pruebas de extremo a extremo y de accesibilidad en el ambiente de pruebas         | Falla un recorrido crítico o hay una violación grave de accesibilidad |
| **10**    | Análisis dinámico con OWASP ZAP (semanal y antes de cada versión)                 | Alerta de riesgo alto                                                 |
