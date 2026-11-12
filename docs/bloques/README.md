# Bloques de construcción

Un bloque a la vez, en orden. Actualice la columna Estado al cerrar cada uno.

| Bloque | Fase | Entrega | Depende de | Crítico | Estado |
|---|---|---|---|---|---|
| B01 | F1 | Monorepo y herramientas de calidad | — | — | Terminado |
| B02 | F1 | Esqueleto de la API | B01 | — | En revisión |
| B03 | F1 | Base de datos, contexto de empresa y seguridad por fila | B02 | Sí | En revisión |
| B04 | F1 | Esqueleto web y sistema de diseño | B01 | — | En revisión |
| B05 | F1 | Integración continua | B02 · B03 · B04 | — | En revisión |
| B06 | F1 | Entorno local completo | B02 · B03 | — | En revisión |
| B07 | F1 | Servidor de pruebas y despliegue automático | B05 · B06 | Sí | En revisión |
| B08 | F2 | Identidad: cuentas, inicio de sesión y sesiones | B03 · B04 | Sí | En revisión |
| B09 | F2 | Segundo factor y seguridad de sesión | B08 | Sí | En revisión |
| B10 | F2 | Roles, permisos y autorización | B08 | Sí | En revisión |
| B11 | F2 | Auditoría y trazabilidad | B10 | Sí | En revisión |
| B12 | F2 | Núcleo: organización, catálogos, consecutivos y parámetros | B10 · B11 | — | En revisión |
| B13 | F2 | Terceros | B12 | — | En revisión |
| B14 | F2 | Archivos | B11 | Sí | En revisión |
| B15 | F2 | Motor de flujos y tareas | B12 | — | En revisión |
| B16 | F2 | Notificaciones, correo, comentarios y adjuntos | B15 · B14 | — | En revisión |
| B17 | F2 | Privacidad: avisos, autorizaciones y actividades de tratamiento | B13 | Sí | En revisión |
| B18 | F3 | Documentos, versiones y expedientes | B14 · B15 | — | En revisión |
| B19 | F3 | Control documental del SGC y carga inicial | B18 | — | En revisión |
| B20 | F3 | Formatos digitales y generación de documentos | B19 | — | En revisión |
| B21 | F3 | Retención, disposición y búsqueda | B19 | — | En revisión |
| B22 | F4 | CRM: contactos, oportunidades y actividades | B13 · B15 · B17 | — | En revisión |
| B23 | F4 | Portafolio y cotizaciones | B22 · B20 | — | En revisión |
| B24 | F4 | Contratos | B23 | — | En revisión |
| B25 | F4 | Firma electrónica | B24 · B09 | Sí | En revisión |
| B26 | F5 | Proyectos: estructura y tablero de trabajo | B24 · B15 | — | En revisión |
| B27 | F5 | Proyectos: horas, entregables, actas y control | B26 · B25 | — | En revisión |
| B28 | F5 | Mesa de ayuda | B15 · B16 | — | En revisión |
| B29 | F5 | PQRSF, encuestas y base de conocimiento | B28 | — | En revisión |
| B30 | F5 | Portal del cliente | B27 · B29 | Sí | En revisión |
| B31 | F6 | Facturación, cartera y recaudo | B27 | — | En revisión |
| B32 | F6 | Presupuesto, gastos, caja menor y exportación contable | B31 | — | En revisión |
| B33 | F6 | Compras, proveedores y viajes | B13 · B15 | — | En revisión |
| B34 | F6 | Activos | B33 · B25 | — | Pendiente |
| B35 | F7 | Talento humano: colaboradores, selección y vinculación | B25 · B17 | Sí | Pendiente |
| B36 | F7 | Talento humano: novedades, desempeño y retiro | B35 | — | Pendiente |
| B37 | F7 | Seguridad y salud en el trabajo | B36 | — | Pendiente |
| B38 | F7 | Calidad: procesos, riesgos, no conformidades y acciones | B15 | — | Pendiente |
| B39 | F7 | Calidad: auditorías, indicadores y revisión por la dirección | B38 | — | Pendiente |
| B40 | F7 | Innovación y propiedad intelectual | B15 | — | Pendiente |
| B41 | F8 | Sitio público, formularios, textos legales y cookies | B22 · B29 · B17 | Sí | Pendiente |
| B42 | F8 | Privacidad completa | B41 | Sí | Pendiente |
| B43 | F8 | Endurecimiento de seguridad y rendimiento | B30 · B42 | Sí | Pendiente |
| B44 | F8 | Servidor de producción, copias y monitoreo | B43 | Sí | Pendiente |
| B45 | F8 | Carga inicial, aceptación y puesta en marcha | B44 | Sí | Pendiente |
| B46 | F9 | Tableros gerenciales y requisitos legales | B39 · B31 | — | Pendiente |
| B47 | F9 | Asistente de inteligencia artificial | B46 | Sí | Pendiente |
| B48 | F9 | Multiempresa | B47 | Sí | Pendiente |
