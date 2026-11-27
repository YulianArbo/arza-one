# ADR-027: Búsqueda del asistente de IA con palabras clave, sin vectores, y adaptador sin biblioteca

- Estado: aceptada
- Fecha: 26/11/2026
- Aprobó: Director General (decisiones 2 y 3 del plan del bloque B47)

## Contexto

El numeral 12.3 pone una columna `embedding` en `ai_index_chunks`, y el capítulo 9 nombra pgvector
para la búsqueda semántica «a futuro». Pero la imagen de PostgreSQL que usan el equipo local, las
pruebas, la CI y producción (infra/postgres/Dockerfile) no trae pgvector. Cambiarla es un cambio de
infraestructura en todos los ambientes. Además, el proveedor elegido (Claude, de Anthropic) no ofrece
el servicio que convierte textos en vectores: haría falta un segundo proveedor, con su propio
contrato de transmisión de datos.

## Decisión

1. **Búsqueda en dos pasos, sin vectores.**
   - El modelo convierte la pregunta en palabras clave, con sinónimos (`KEYWORDS_PROMPT`).
   - Con esas palabras se busca, en español y sin tildes, sobre el texto que Gestión documental ya
     extrae (B21) y que el asistente parte en fragmentos en `ai_index_chunks`.
   - Primero se eligen los documentos que la persona puede abrir; después, los pasajes que mejor
     coinciden.
   - `ai_index_chunks` no tiene la columna `embedding`.
2. **Adaptador sin biblioteca nueva.** La pasarela llama a la API de mensajes de Anthropic con
   `fetch`, a una dirección fija, detrás de la interfaz `AiModel`. Así se cambia de proveedor sin
   tocar los casos de uso.

## Alternativas consideradas

- **pgvector con un proveedor de vectores.**
  - A favor: búsqueda por significado.
  - En contra: cambiar la imagen de la base en los cuatro ambientes; un segundo proveedor con
    contrato y evaluación de impacto; más datos enviados fuera.
  - Pospuesta.
- **Biblioteca oficial de Anthropic (`@anthropic-ai/sdk`, licencia MIT).**
  - A favor: tipos y reintentos listos.
  - En contra: una dependencia más para una sola petición. El dueño pidió no agregar dependencias
    sin necesidad.
  - Puede adoptarse después sin cambiar la pasarela.

## Consecuencias

- **La búsqueda depende de las palabras.** El paso de palabras clave con sinónimos reduce esa
  limitación. Si se pide una búsqueda por significado, se hará con una ADR nueva: pgvector en la
  imagen y una columna nueva en `ai_index_chunks`.
- **No sale nada adicional para indexar.** Solo se envían al modelo la pregunta y los pasajes
  elegidos.
- **El adaptador lleva lo mínimo:** salida JSON validada, modelo de respaldo si el primero declina y
  tiempo máximo de espera.

## Cumplimiento

Pruebas de `apps/api/src/modules/ai` y `apps/api/test/int/ai`; revisión externa del bloque B47.
