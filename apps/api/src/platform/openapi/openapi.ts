import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import type { Env } from '../config/env-schema.js';
import { API_DOCS_PATH } from '../security/security-headers.js';

/** Documento OpenAPI 3.1 generado desde los esquemas Zod de los contratos (ADR-010). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setOpenAPIVersion('3.1.0')
    .setTitle('ARZA ONE API')
    .setDescription('Interfaz de programación de ARZA ONE (capítulo 14 del Manual MN-TEC-002).')
    .setVersion('v1')
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, options), { version: '3.1' });
}

/** Publica la documentación solo en local y en pruebas (numeral 14.1). */
export function setupApiDocs(app: INestApplication, config: Env): void {
  if (config.APP_ENV === 'production') return;
  SwaggerModule.setup(API_DOCS_PATH.slice(1), app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${API_DOCS_PATH.slice(1)}/openapi.json`,
    yamlDocumentUrl: `${API_DOCS_PATH.slice(1)}/openapi.yaml`,
  });
}
