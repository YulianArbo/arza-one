# ADR-023: Los módulos siguen los pasos de sus trámites dentro de la misma transacción

- Estado: propuesta (B19), pendiente de la aprobación del Director General al revisar el bloque
- Fecha: 17/10/2026
- Aprobó: pendiente

## Contexto

Desde B19 los documentos del SGC tienen su trámite en el motor de flujos (ADR-011): la Solicitud
de Acción Documental y la revisión, aprobación y publicación de cada versión. Una persona puede dar
el paso desde la ficha del documento o desde «Mis tareas». Si el módulo de documentos se enterara
del paso más tarde, por la bandeja de salida, por un momento el trámite diría «aprobado» y la
versión seguiría «en revisión»; y si el paso violara una regla del documento (quien elabora no
aprueba), el trámite ya habría avanzado. El numeral 13.2 pide que todo caso de uso que escribe sea
una sola transacción.

## Decisión

El motor avisa al módulo dueño del registro **dentro de la misma transacción** de la transición.
El módulo se inscribe una vez, al arrancar, con `onWorkflowTransition(tipoDeRegistro, oyente)` del
índice de `wf`; el motor no importa a ningún módulo. Si el oyente rechaza el paso, se revierte todo:
el trámite, sus tareas y el registro. Los eventos `wf.instance.*` de la bandeja de salida siguen
existiendo para lo que puede ocurrir después (avisos y otros módulos).

## Alternativas consideradas

- Solo la bandeja de salida · ya existe · el registro y su trámite quedan un momento en desacuerdo
  y una regla del módulo no puede impedir el paso · descartada.
- Que cada módulo dé los pasos solo desde su pantalla · simple · «Mis tareas» quedaría sin poder
  aprobar los trámites de los módulos · descartada.

## Consecuencias

El registro y su trámite cambian juntos o no cambian. El oyente debe ser corto: corre dentro de la
transacción de quien da el paso. La dependencia sigue apuntando de los módulos hacia el motor.

## Cumplimiento

Pruebas de integración de B19 (`apps/api/test/int/doc`): un paso dado desde «Mis tareas» cambia la
versión en la misma transacción, y quien elabora no puede aprobar ni desde allí. Las fronteras de
módulos las sigue revisando `pnpm boundaries`.
