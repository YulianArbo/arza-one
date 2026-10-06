<!-- Plantilla de pull request (PR-TEC-001). Complete todas las secciones; escriba "No aplica" cuando corresponda. -->

## Qué cambia

Bloque: Bnn — nombre del bloque

Resumen en lenguaje claro de lo que se construyó o corrigió.

## Cómo se probó

- Verificaciones automáticas: resultado de `pnpm check`.
- Pruebas nuevas: cuáles y qué demuestran.
- Prueba manual: pasos seguidos en el navegador.

## Capturas de pantalla

Pantallas nuevas o modificadas, en escritorio y celular.

## Impacto en datos

Tablas nuevas o modificadas, migraciones y datos semilla. ¿La migración aplica desde cero y sobre la
versión anterior?

## Impacto en seguridad

Puntos de la API nuevos con su autenticación, permiso y esquema de validación. Datos personales
tratados. Dependencias nuevas con su licencia y justificación.

## Definición de terminado (capítulo 21.3)

- [ ] Criterios de aceptación del bloque cumplidos
- [ ] `pnpm check` en verde
- [ ] Pruebas de permiso denegado y de aislamiento entre empresas
- [ ] Toda escritura genera evento de auditoría, comprobado por prueba
- [ ] Migraciones aplican desde cero y sobre la versión anterior
- [ ] Pantallas con todos los estados del numeral 16.5 y accesibilidad sin violaciones graves
- [ ] Documentación del módulo y OpenAPI actualizados
- [ ] Cierre del bloque escrito en `docs/bloques/Bnn-cierre.md`
