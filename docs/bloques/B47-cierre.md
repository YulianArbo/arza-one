# Cierre del bloque B47 — Asistente de inteligencia artificial

- Módulo: M20 · Fase F9 · Depende de B46.
- Construido por Claude Code el 26/11/2026, con el plan aprobado por el propietario («Apruebo todo», 12 decisiones).
- Rama `feat/b47-asistente-de-inteligencia-arti`, creada encima de la rama de B46 (`e481b487`). El PR #102 de B46 aún no está fusionado (decisión 1).
- Documentación del módulo: `docs/manual/datos/ai.md`.
- Evaluación de impacto: `docs/privacidad/evaluacion-impacto-ia.md` (borrador para firmar).
- Decisiones técnicas: ADR-027.
- **Bloque crítico: requiere revisión externa antes de fusionarlo.**

## Qué se construyó

- **Pasarela de IA (ADR-022).** Es la única puerta hacia el modelo. Cada vez que alguien usa el asistente, en este orden:
  1. revisa que el uso esté activo y que la persona no haya llegado a su límite del día;
  2. lee el registro con las reglas del módulo dueño y con los permisos de la persona;
  3. descarta lo restringido y las PQRSF sobre datos personales;
  4. borra correos, teléfonos y números de documento;
  5. recorta al tamaño máximo;
  6. envía con reglas de seguridad fijas;
  7. revisa la respuesta y se queda solo con las citas a fuentes que de verdad envió;
  8. registra el uso y su evento de auditoría.
- **El asistente nunca ejecuta nada.** Solo propone; la persona decide y usa lo que le sirva en la pantalla del registro.
- **Usos (decisión 4):**
  - preguntas sobre los documentos;
  - resumen de un documento;
  - resumen, borrador de respuesta y clasificación sugerida de un tiquete;
  - borrador de respuesta y tipo sugerido de una PQRSF.
- **Pantallas:**
  - **Asistente** (grupo Trabajo diario del menú): preguntar, con las fuentes y los botones «Copiar», «La usé» y «La descarto».
  - **Panel «Asistente»** en las fichas de documento, tiquete y PQRSF.
  - **Usos activos**, para el Oficial de datos.
  - **Instrucciones**, para Calidad y el administrador.
  - **Registro de usos**, para el Oficial de datos, el Auditor y el administrador.
- **Proveedor intercambiable (decisión 2):**
  - **apagado** (por defecto);
  - **modo de ensayo**: respuestas armadas sin IA, sin enviar nada; nunca en producción;
  - **Claude** (Anthropic), con una petición directa y sin bibliotecas nuevas.
- **Índice para buscar:** cada 5 minutos el worker parte en fragmentos el texto de los documentos vigentes no restringidos y quita los que dejaron de serlo.
- **Tablas** `ai_use_cases`, `ai_prompts`, `ai_requests` y `ai_index_chunks`, todas con separación por empresa (migración `20261129000000_ai_assistant_gateway`).
- **Evaluación de impacto de privacidad** (Circular Externa 002 de 2024 de la SIC), como borrador para el Oficial de datos.

### Criterios de aceptación

- [x] **Ficha 17.21: un usuario no obtiene por el asistente información que no puede ver por la aplicación.** Pruebas de integración:
  - un colaborador que no abre un documento no lo obtiene por el asistente;
  - otra empresa recibe «no existe»;
  - lo restringido nunca se indexa ni se envía.
- [x] **Ficha 17.21: cada uso queda registrado con caso de uso, modelo y resultado.** Tabla `ai_requests` y evento `ai.request.create`, comprobados en el recorrido de auditoría.
- [x] **Ficha 17.21: toda respuesta cita los documentos en que se basa.** Sin fuentes, responde «No encontré…».
- [x] **Ficha 17.21: nunca recibe datos restringidos.**
- [x] Pruebas de permiso denegado, aislamiento entre empresas y auditoría.
- [x] `pnpm check`: cada paso pasó en este equipo, excepto dos que se reemplazaron por su equivalente (vea «Cómo se probó»). La CI corre la cadena completa.
- [x] Documentación y cierre escritos.

## Decisiones (aprobadas el 26/11/2026)

1. Rama encima de la de B46.
2. Claude como proveedor, detrás de una pieza intercambiable, sin biblioteca nueva. Sin llave, el asistente queda apagado. Hay un modo de ensayo para probar sin costo.
3. Búsqueda sin pgvector: la IA saca palabras clave de la pregunta, con sinónimos, y se busca con la búsqueda en español de B21 (ADR-027).
4. Borradores solo de respuestas de tiquetes y PQRSF; actas y propuestas quedan pendientes.
5. El registro de usos no guarda la pregunta, el texto enviado ni la respuesta.
6. Permisos:
   - `ai.assist.use`: todos los roles internos.
   - `ai.prompt.manage`: Administrador y Calidad.
   - `ai.use_case.manage`: Oficial de datos.
   - `ai.request.read`: Oficial de datos, Auditor y Administrador.

   Se actualizaron la matriz 15.3 y el anexo G.

7. Cada uso arranca apagado; lo activa el Oficial de datos con la evaluación de impacto aprobada.
8. Límite de 50 usos por persona al día y tope de 24.000 caracteres por uso (variables `AI_GATEWAY_*`).
9. Solo documentos públicos, internos y confidenciales que la persona puede abrir; lo restringido nunca.
10. Los textos de los registros se tratan como datos, no como órdenes; el asistente no tiene acciones.
11. Evaluación de impacto en borrador para el Oficial de datos; el contrato con el proveedor queda pendiente.
12. Un solo PR con commits pequeños.

### Ajustes y decisiones técnicas tomadas durante la construcción

- **PQRSF sobre datos personales.** Además de lo restringido, el asistente rechaza las PQRSF clasificadas como consulta o reclamo de datos personales. Las atiende Privacidad. El intento queda en el registro como «Bloqueado».
- **Instrucciones.** Las reglas de seguridad son fijas y no se editan. Lo que Calidad o el administrador cambian es solo la parte de cada uso (tono y formato). La base de datos impide que quien escribe una instrucción la apruebe.
- **Cuándo no se llama al modelo.** Si la pregunta no encuentra pasajes, no se llama al modelo: se registra «Sin fuentes» y no cuesta nada.
- **Lectura de documentos confidenciales.** Cuando el asistente lee uno, no se anota en el registro de accesos de Documentos, que solo anota descargas. Queda en el registro de usos y en la auditoría, con la fuente citada.
- **Pruebas.** Las pruebas de integración usan el modo de ensayo, que se activa en `createIamTestApp`. Las pruebas unitarias siguen con el asistente apagado.
- **Biblioteca oficial.** La guía técnica de Anthropic recomienda su biblioteca oficial (`@anthropic-ai/sdk`, licencia MIT) en lugar de peticiones directas. Seguí su decisión 2 de no agregar dependencias. Si más adelante la quiere, se cambia en un solo archivo (`anthropic-model.ts`). Lo anoté en ADR-027.

## Cómo probarlo en su navegador

Antes de empezar, una sola vez:

1. Abra su archivo `.env` y agregue esta línea (yo no toco ese archivo):

   ```text
   AI_GATEWAY_PROVIDER=rehearsal
   ```

2. Aplique la migración nueva, que solo agrega tablas:

   ```powershell
   pnpm db:migrate
   ```

3. Cargue los permisos nuevos:

   ```powershell
   pnpm db:seed
   ```

4. Levante la plataforma:

   ```powershell
   pnpm dev
   ```

Luego, en el navegador:

1. **Sin activar nada.** Entre con una cuenta de prueba cualquiera y abra **Asistente** en el menú (grupo Trabajo diario). Debe decir que las preguntas sobre documentos no están activas.
2. **Activar los usos.** Entre con una cuenta de **Oficial de datos** y abra **Asistente › Usos activos**.
   - Pulse «Activar» sin escribir nada: debe pedirle la evaluación de impacto y su fecha.
   - Escriba `EIPD-IA-001` y la fecha de hoy, y active cada uso.
3. **Preguntar.** Entre con una cuenta de **Calidad**, abra **Asistente** y pregunte algo que diga un documento vigente.
   - Verá la propuesta con la etiqueta «Modo de ensayo», el aviso «es una propuesta» y, abajo, el documento fuente con su enlace.
   - Pulse «La usé».
   - Si un documento recién publicado no aparece, espere hasta 5 minutos: es lo que tarda el índice.
4. **Lo que no ve, no lo obtiene.** Con una cuenta de **Colaborador**, pregunte lo mismo. Si ese documento es de un proceso que no es el suyo, el asistente dirá que no encontró la respuesta.
5. **Tiquete.** Con una cuenta de **Servicio**, abra un tiquete.
   - En el panel «Asistente», pruebe «Resumir la conversación», «Borrador de respuesta» y «Sugerir clasificación».
   - Pulse «Copiar» y pegue el borrador en la conversación si quiere. El tiquete no cambia solo.
6. **PQRSF de datos personales.** Clasifique una PQRSF como consulta de datos personales. El panel del asistente desaparece de su ficha.
7. **Registro.** Con la cuenta de **Auditor**, abra **Asistente › Registro de usos**. Verá cada uso con persona, modelo y resultado, pero ninguna pregunta ni respuesta.
8. **Instrucciones.** Con **Calidad**, abra **Asistente › Instrucciones**, escriba una versión nueva e intente aprobarla. No lo dejará. Pida a otra persona (por ejemplo, el administrador) que la apruebe.

## Cómo se probó

Todo en este equipo, el 26/11/2026:

| Verificación                                                                                     | Resultado                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pruebas de integración del asistente (`test/int/ai`, con PostgreSQL y Valkey en contenedores)    | 18/18: documentos 6, Servicio 5, gobierno 7                                                                                                                                                       |
| Recorrido de auditoría: las 6 rutas nuevas que escriben y la regla «toda ruta tiene su llamada»  | 7/7                                                                                                                                                                                               |
| Conteo de permisos del catálogo (`roles-admin`)                                                  | Pasa, con 220 permisos                                                                                                                                                                            |
| Formato (Prettier) de todos los archivos del repositorio                                         | Pasa                                                                                                                                                                                              |
| Tipos de los contratos, tipos de todos los paquetes, compilación completa y reglas entre módulos | Pasan                                                                                                                                                                                             |
| Revisión de estilo (ESLint) de los 83 archivos que cambió el bloque                              | Pasa                                                                                                                                                                                              |
| Código sin usar (knip)                                                                           | Sin hallazgos del bloque; solo aparecen las carpetas sueltas `.codex-ci-*` del propietario                                                                                                        |
| Unitarias: contratos 325, interfaz 60, guiones 206, plantillas 30, configuración 24              | Pasan                                                                                                                                                                                             |
| Unitarias: API 548 (incluye el módulo `ai`)                                                      | Pasan                                                                                                                                                                                             |
| Unitarias: worker 50 (cobertura sobre el mínimo)                                                 | Pasan                                                                                                                                                                                             |
| Unitarias: web 1.043 (85,24 % de ramas)                                                          | Pasan                                                                                                                                                                                             |
| Navegador (Playwright), incluidas 8 pruebas nuevas del asistente en modo claro y oscuro          | La corrida completa dio 424 de 432; las 8 fallas venían de la respuesta simulada que faltaba y ya está corregida. Las especificaciones del asistente, la mesa de ayuda y las PQRSF pasan (48/48). |
| Búsqueda de secretos (gitleaks)                                                                  | Pasa                                                                                                                                                                                              |
| OpenAPI regenerado                                                                               | Solo agrega las 9 rutas del asistente                                                                                                                                                             |

Lo que no se pudo correr completo en este equipo:

- **Revisión de estilo de todo el repositorio.** Se queda sin memoria, igual que en B46. Por eso se revisaron uno por uno los 83 archivos del bloque.
- **Suite completa de integración (`pnpm test:int`).** Se detiene por el tiempo de arranque de los contenedores, como en B46. Corrí las pruebas del asistente, el recorrido de auditoría y el conteo de permisos.
- La CI confirma las dos cosas.
- La primera corrida de unitarias falló por sobrecarga del equipo (esperas vencidas y archivos que no se pudieron leer). Al repetir cada paquete por separado, todo pasó.

## Pendientes

1. **Revisión externa** (bloque crítico), antes de fusionar.
2. **Contrato de transmisión de datos con Anthropic.** También registrarlo en Privacidad › Encargados y actualizar la actividad de tratamiento. Es la sección 5 de la evaluación de impacto.
3. **Firmar la evaluación de impacto** (Oficial de datos y Director General). Calidad le asigna su código.
4. **Producción.** Poner `AI_GATEWAY_PROVIDER=anthropic` y la llave en el servidor y en el gestor de contraseñas, solo después de los puntos 2 y 3. No modifiqué `infra/compose/production.yml`: sin esas variables, producción arranca con el asistente apagado.
5. **Borradores de actas y propuestas comerciales** (decisión 4).
6. **Búsqueda por significado con vectores**, si se pide más adelante (ADR-027).
7. **Fusionar primero B46 (PR #102).** Este PR está encima de esa rama.
8. **Contraste de los botones principales en modo oscuro (sistema de diseño, no es de B47).** Con el puntero encima, el azul `--action-hover` (#2f7bff) con texto blanco mide unos 3,9:1, y la norma pide 4,5:1. Lo encontró la prueba nueva del asistente. Las pruebas revisan las pantallas en reposo, así que no lo detectaban. Cambiar el token es una decisión de diseño suya: no lo toqué.
