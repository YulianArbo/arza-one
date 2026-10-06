# ADR-013: Archivos en almacenamiento S3 privado con enlaces temporales

- Estado: aceptada
- Fecha: 05/10/2026
- Aprobó: Director General (Manual Maestro MN-TEC-002, numeral 8.4)

## Contexto

Los documentos de clientes y colaboradores nunca deben quedar expuestos por una dirección pública.

## Decisión

Los archivos se guardan en Garage (interfaz S3) privado. Se suben y descargan por enlaces temporales emitidos tras verificar el permiso.

## Alternativas consideradas

- Archivos en el disco del servidor · simple · difícil de respaldar y escalar · descartado.
- Archivos en la base de datos · transaccional · la base crece y se vuelve lenta · descartado.

## Consecuencias

Ningún documento es público. Se agrega un servicio que operar.

## Cumplimiento

Pruebas del bloque B14.
