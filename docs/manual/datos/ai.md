# Asistente de inteligencia artificial · B47

El módulo M20 apoya a las personas con búsqueda, resúmenes, borradores y clasificaciones sugeridas, sin sustituir decisiones ni controles (ficha 17.21). Toda llamada a un modelo pasa por la **pasarela de IA** (ADR-022). En la web está en **Asistente** (grupo Trabajo diario del menú) y como panel en las fichas de documento, tiquete y PQRSF.

> La IA propone; el sistema valida permisos; la persona aprueba; el sistema ejecuta; la plataforma audita.

## Dónde vive cada parte

- **Pasarela y usos** (`apps/api/src/modules/ai`): `application/gateway.ts` admite (uso activo y límite del día), minimiza, llama al modelo, valida la respuesta y registra. `application/assist.ts` arma cada uso. `application/governance.ts` y `application/usage.ts` cubren la activación, las instrucciones y el registro.
- **Lo que el asistente lee** lo publica el módulo dueño por su `index.ts`, con sus propias reglas de acceso:
  - Gestión documental: `doc/application/assistant-sources.ts`. Solo documentos vigentes que la persona puede abrir; nunca los restringidos.
  - Servicio: `service/application/assistant-sources.ts`. El tiquete como lo ve la persona; la PQRSF solo con `service.pqrsf.read`.
- **Proveedor** (`infrastructure/`): `rehearsal-model.ts` (modo de ensayo, sin IA) y `anthropic-model.ts` (Claude, con `fetch` a una dirección fija). Sin proveedor, el asistente queda apagado.
- **Índice**: el worker corre `ai.index-work` cada 5 minutos (`refreshAiIndex`). Parte en fragmentos el texto que Gestión documental ya extrajo (B21) y borra los fragmentos de versiones que dejaron de estar vigentes o pasaron a ser restringidas.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `ai_use_cases` | Activación de cada uso, con el código y la fecha de aprobación de la evaluación de impacto. Sin fila, el uso está apagado. Un uso activo sin evaluación lo rechaza la base de datos. |
| `ai_prompts` | Instrucciones con versiones. Rige la última aprobada; sin ninguna, la de fábrica (`domain/default-prompts.ts`). La base de datos no deja aprobar a quien la escribió. |
| `ai_requests` | Registro de cada uso. Guarda la persona, el uso, el proveedor, el modelo, la versión de la instrucción, la clase de lo enviado, los tamaños y tokens, los datos borrados, el resultado, el registro de destino, las fuentes citadas y lo que la persona decidió. **No guarda la pregunta, el texto enviado ni la respuesta** (decisión 5). La aplicación solo puede leer, agregar y cambiar la decisión. |
| `ai_index_chunks` | Fragmentos de hasta 1.500 caracteres del texto vigente de documentos públicos, internos y confidenciales, con índice de búsqueda en español. Quién puede leerlos se decide al consultar; no guarda permisos. |

Todas llevan `tenant_id` y RLS. Migración `20261129000000_ai_assistant_gateway`. También agrega la función `doc_tenants_with_ready_texts()` para el worker.

## Usos (decisión 4)

| Uso | Qué hace | Lee |
| --- | --- | --- |
| `doc_search` | Responde una pregunta con pasajes de documentos | Documentos vigentes que la persona abre |
| `doc_summary` | Resume un documento | Su texto vigente |
| `ticket_summary` · `ticket_reply` · `ticket_classify` | Resume la conversación, redacta la respuesta o sugiere la categoría y la prioridad | El tiquete y su conversación, como los ve la persona |
| `pqrsf_reply` · `pqrsf_classify` | Redacta la respuesta o sugiere el tipo | Tipo, asunto y descripción |

Los borradores de actas y de propuestas comerciales quedan para después.

## Reglas

- **Lo que no ve en la aplicación, no lo ve por el asistente.** Cada uso lee con las reglas del módulo dueño y con los permisos de la persona. Otra empresa responde «no existe».
- **Nunca recibe lo restringido (decisión 9)**, aunque la persona pueda verlo. Tampoco recibe las PQRSF sobre datos personales. El intento queda en el registro como «Bloqueado».
- **Minimización.** Antes de enviar:
  - se borran correos, teléfonos y números de 7 o más dígitos (`domain/redaction.ts`);
  - la búsqueda envía solo los pasajes que coinciden;
  - todo uso se recorta a `AI_GATEWAY_MAX_INPUT_CHARS`, y la respuesta lo avisa.
- **Búsqueda (decisión 3).** Funciona en dos pasos, sin vectores ni pgvector. Primero, el modelo convierte la pregunta en palabras clave, con sinónimos. Después, esas palabras buscan con la búsqueda en español de B21 sobre `ai_index_chunks`.
- **Toda respuesta cita sus fuentes.** Solo cuentan las citas a fuentes que de verdad se enviaron. Una pregunta sin fuentes responde «No encontré…» y ni siquiera llama al modelo.
- **Instrucciones ocultas (numeral 15.5).** Las reglas de seguridad del marco son fijas (`domain/prompt-frame.ts`). Lo que viene de un registro va marcado como dato, sin los signos `<` y `>`. El asistente no tiene herramientas ni acciones.
- **Límites (decisión 8).** Cada persona tiene `AI_GATEWAY_DAILY_LIMIT` usos al día (50), contados en hora de Colombia. Al llegar al límite, el asistente responde 429.
- **Activación (decisión 7).** Cada uso arranca apagado y solo el Oficial de datos lo activa, con la evaluación de impacto aprobada (`docs/privacidad/evaluacion-impacto-ia.md`).

## Proveedor (decisión 2)

| `AI_GATEWAY_PROVIDER` | Qué pasa |
| --- | --- |
| `off` (por defecto) | El asistente no está disponible (503). |
| `rehearsal` | Respuestas armadas con el mismo texto, sin IA y sin enviar nada. Se marcan «Modo de ensayo». La configuración lo rechaza con `APP_ENV=production`. |
| `anthropic` | Claude (`AI_GATEWAY_MODEL`, por defecto `claude-opus-5-5`) con salida JSON validada y modelo de respaldo si el primero declina. Exige `AI_GATEWAY_API_KEY`. |

## Acceso (decisión 6)

| Permiso | Quién lo tiene | Para qué |
| --- | --- | --- |
| `ai.assist.use` | Todos los roles internos; los clientes del portal no | Usar el asistente |
| `ai.prompt.manage` | Administrador de plataforma, Calidad | Escribir y aprobar instrucciones |
| `ai.use_case.manage` | Oficial de datos | Activar y apagar usos |
| `ai.request.read` | Oficial de datos, Auditor, Administrador de plataforma | Ver el registro de usos |

Cada uso deja el evento `ai.request.create` en la auditoría, en la misma transacción que su registro. También se auditan la activación de usos, las instrucciones, la decisión de la persona y la consulta del registro (`ai.request.read`).

## Rutas de la API

- `GET /v1/ai/status` · `POST /v1/ai/search` · `POST /v1/ai/assist` · `POST /v1/ai/requests/{id}/review`
- `GET /v1/ai/use-cases` · `PUT /v1/ai/use-cases/{useCase}`
- `GET|POST /v1/ai/prompts` · `POST /v1/ai/prompts/{id}/approve`
- `GET /v1/ai/requests`
