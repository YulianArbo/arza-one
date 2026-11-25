# ADR-026: Vigilancia y errores en un servidor aparte del de producción

- Estado: aceptada
- Fecha: 24/11/2026
- Aprobó: Director General (decisiones 1 y 2 del plan del bloque B44)

## Contexto

El numeral 10.3 pone Uptime Kuma y GlitchTip dentro del servidor de producción. Pero si ese
servidor se cae por completo (falla del proveedor, disco lleno, reinicio que no vuelve), el vigilante
cae con él y nadie recibe la alerta «dos fallas seguidas en un minuto» del numeral 10.7. Además,
sumando los límites de memoria del numeral 10.3, GlitchTip con su base de datos y su cola no cabe en
los 8 GB de la capacidad inicial del numeral 10.2.

## Decisión

Uptime Kuma (con la página de estado `estado.[dominio]`) y GlitchTip corren en un **servidor de
vigilancia** aparte, pequeño y de otro proveedor o región, preparado con el mismo guion
(`provision.sh --role monitoring`) y el archivo `infra/compose/monitoring.yml`. Producción le envía
los errores (GLITCHTIP_DSN) y los avisos de copias y de capacidad (direcciones «push»); el
vigilante revisa producción desde fuera.

Como consecuencia, GlitchTip ya no comparte la base de datos de producción (la decisión 2 del plan,
«compartir PostgreSQL y Valkey con tope de memoria», queda reemplazada): en el servidor de vigilancia
tiene su propia base y su propia cola, con topes de memoria.

## Alternativas consideradas

- Todo en el servidor de producción · lo que dice el manual, sin costo extra · no avisa cuando más se
  necesita (caída total) y no cabe en 8 GB · descartada.
- En el servidor de pruebas · sin costo extra · los dos usan los puertos 80 y 443 y el ambiente de
  pruebas se reinicia y se rompe a propósito · descartada.
- Servicio de vigilancia en la nube (pago) · sin servidor que mantener · los errores llevarían datos
  de la aplicación a un tercero más, con su propio contrato de transmisión · descartada por ahora.

## Consecuencias

- Un servidor más que pagar y mantener (2 a 4 GB de memoria; unos 5 a 10 dólares al mes).
- El servidor de producción conserva el margen de memoria del numeral 10.2.
- El servidor de vigilancia guarda solo errores técnicos depurados (sin cookies, cuerpos ni datos
  personales: `apps/api/src/platform/ops/error-reporter.ts`) por 90 días.
- El numeral 10.3 del manual queda desactualizado en este punto: se tramita su cambio con
  FT-SGC-001.

## Cumplimiento

- `infra/compose/production.yml` no tiene Uptime Kuma ni GlitchTip; `infra/compose/monitoring.yml`
  sí, con `mem_limit` en cada servicio.
- Guía: `docs/runbooks/servidor-de-vigilancia.md`.
