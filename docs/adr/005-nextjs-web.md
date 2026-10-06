# ADR-005: Next.js con React para las tres superficies web

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Hay un sitio público (necesita buen posicionamiento), una aplicación interna rica y un portal de clientes.

## Decisión

Una sola aplicación Next.js (enrutador de aplicaciones) con grupos `(public)`, `(app)` y `(portal)`. La web nunca accede a la base de datos.

## Alternativas consideradas

- Una aplicación por superficie · aislamiento · triplica configuración y componentes · descartado.
- Aplicación solo del lado del cliente · simple · mal posicionamiento del sitio público · descartado.

## Consecuencias

Componentes y sistema de diseño compartidos. La seguridad siempre está en la API.

## Cumplimiento

Regla `no-web-to-backend` de dependency-cruiser. El esqueleto se construye en B04.
