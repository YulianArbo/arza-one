# Evaluación de impacto en la privacidad — Asistente de inteligencia artificial (M20)

> **Borrador para aprobación (B47, decisión 11).** Lo revisa y firma el Oficial de Protección de
> Datos. Mientras no esté aprobado, ningún uso del asistente debe activarse con un proveedor real
> (Claude). En el equipo local y en el servidor de pruebas se usa el **modo de ensayo**, que no envía
> nada fuera del servidor.

| Campo                       | Valor                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Código sugerido             | EIPD-IA-001 (lo asigna Calidad en el Listado Maestro)                    |
| Tratamiento evaluado        | Asistente de inteligencia artificial de ARZA ONE (M20, ficha 17.21)      |
| Responsable del tratamiento | ARZA TECH S.A.S.                                                         |
| Encargado propuesto         | Anthropic (modelo Claude), por la pasarela de IA (ADR-022)               |
| Marco                       | Ley 1581 de 2012, Decreto 1377 de 2013, Circular Externa 002 de 2024 SIC |
| Elaboró                     | Equipo de desarrollo (B47), 26/11/2026                                   |
| Revisa y aprueba            | Oficial de Protección de Datos                                           |
| Fecha de aprobación         | dd/mm/aaaa                                                               |

## 1. Qué hace el asistente y con qué datos

| Uso                                        | Qué lee                                                  | Datos personales posibles                          |
| ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| Preguntas sobre los documentos             | Pasajes de documentos vigentes internos y confidenciales | Nombres de responsables y cargos en procedimientos |
| Resumen de un documento                    | El texto vigente de un documento interno o confidencial  | Igual que el anterior                              |
| Resumen y borrador de respuesta de tiquete | Asunto, descripción y conversación del tiquete           | Nombre, correo y teléfono de quien reporta         |
| Clasificación sugerida de un tiquete       | Igual que el anterior                                    | Igual que el anterior                              |
| Borrador y clasificación de una PQRSF      | Tipo, asunto y descripción (no los datos de contacto)    | Lo que la persona escribió en la descripción       |

**Nunca se envía:**

- **Lo restringido** (numeral 12.4): salud ocupacional, procesos disciplinarios, salarios, cuentas
  bancarias y secretos. Esto se cumple aunque la persona tenga permiso de verlo.
- **Las PQRSF sobre datos personales** (consultas y reclamos de la Ley 1581): las atiende Privacidad.
- **Los datos de otra empresa** de la plataforma.

## 2. Necesidad y proporcionalidad

- **Necesidad.** El asistente ahorra tiempo en búsqueda, lectura y redacción. No es necesario para
  ningún proceso: todo se puede hacer sin él.
- **Proporcionalidad.**
  - Solo se envía lo indispensable: los pasajes que responden la pregunta, no el documento entero.
  - Hay un tope de 24.000 caracteres por uso.
  - Antes de enviar se borran correos, teléfonos y números de 7 o más dígitos (documentos, cuentas,
    tarjetas). En su lugar queda «[correo]» o «[número]».
- **Finalidad.** Apoyo a la persona usuaria. El asistente **no toma decisiones** laborales,
  financieras, contractuales ni disciplinarias. **No ejecuta acciones**: propone y la persona decide.

## 3. Privacidad desde el diseño (controles implementados en B47)

| Control                                                                                     | Dónde se comprueba                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Toda llamada pasa por la pasarela (ADR-022)                                                 | `apps/api/src/modules/ai`                               |
| La IA hereda los permisos de la persona: lo que no ve en la pantalla, no lo ve el asistente | Pruebas de integración `test/int/ai`                    |
| Cada uso se activa por separado, con la evaluación aprobada (decisión 7)                    | Pantalla Asistente › Usos activos; tabla `ai_use_cases` |
| Borrado de datos personales antes de enviar                                                 | `domain/redaction.ts` y sus pruebas                     |
| Los textos de los documentos se tratan como datos, no como órdenes                          | `domain/prompt-frame.ts` y sus pruebas                  |
| Toda respuesta cita sus fuentes; solo cuentan las fuentes que de verdad se enviaron         | `domain/answer-rules.ts` y sus pruebas                  |
| Registro de cada uso sin guardar la pregunta, el texto enviado ni la respuesta (decisión 5) | Tabla `ai_requests`; pantalla Registro de usos          |
| Límite de 50 usos por persona al día (decisión 8)                                           | Variable `AI_GATEWAY_DAILY_LIMIT`                       |
| Apagado por defecto; el modo de ensayo nunca en producción                                  | `AI_GATEWAY_PROVIDER`; validación al arrancar           |

## 4. Riesgos y tratamiento

| Riesgo                                                                   | Probabilidad | Impacto | Tratamiento                                                              | Riesgo residual |
| ------------------------------------------------------------------------ | ------------ | ------- | ------------------------------------------------------------------------ | --------------- |
| El asistente muestra información que la persona no puede ver             | Baja         | Alto    | Permisos aplicados antes de leer; pruebas de permiso y de aislamiento    | Bajo            |
| Datos personales llegan al proveedor                                     | Media        | Medio   | Borrado automático; exclusión de lo restringido; contrato de transmisión | Medio-bajo      |
| Instrucciones ocultas en un documento manipulan al asistente             | Media        | Medio   | Marco fijo; el asistente no tiene acciones; citas validadas              | Bajo            |
| Respuesta inventada o equivocada                                         | Media        | Medio   | Cita obligatoria; aviso «es una propuesta»; la persona decide            | Medio-bajo      |
| Transferencia internacional (servidores del proveedor fuera de Colombia) | Alta         | Medio   | Contrato de transmisión con cláusulas de la SIC; registrar en Encargados | Medio-bajo      |
| Uso excesivo o abuso                                                     | Baja         | Bajo    | Límite diario; registro de usos para el Oficial y el Auditor             | Bajo            |

**El borrado automático no es perfecto.** Un nombre propio escrito en un texto no se borra, porque
no tiene una forma reconocible. Por eso se exigen además el contrato de transmisión y la exclusión de
lo restringido.

## 5. Antes de activar con un proveedor real (pendientes del responsable)

1. Firmar con Anthropic el **contrato de transmisión de datos personales**. Debe incluir el país de
   tratamiento, la conservación de los datos y la prohibición de usarlos para entrenar modelos.
2. Registrar a Anthropic en **Privacidad › Encargados** con el contrato y la fecha de revisión.
3. Actualizar la **actividad de tratamiento** correspondiente en Privacidad: finalidad «apoyo con IA»
   y transferencia internacional.
4. Aprobar este documento. Después, activar uso por uso en **Asistente › Usos activos**, con el
   código y la fecha de aprobación.
5. Poner la llave del proveedor en el gestor de contraseñas y en el servidor (`AI_GATEWAY_API_KEY`),
   nunca en el repositorio.

## 6. Revisión

Esta evaluación se revisa una vez al año, o antes en cualquiera de estos casos:

- se agrega un uso nuevo;
- cambia el proveedor o el modelo;
- ocurre un incidente con datos personales relacionado con el asistente.

## Aprobación

| Rol                            | Nombre | Firma | Fecha      |
| ------------------------------ | ------ | ----- | ---------- |
| Oficial de Protección de Datos |        |       | dd/mm/aaaa |
| Director General               |        |       | dd/mm/aaaa |
