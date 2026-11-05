import { z } from 'zod';

import { dateTimeSchema, personRefSchema } from '../crm/common.js';
import { contractKindSchema, requiredText } from './common.js';

// Biblioteca de cláusulas aprobadas y plantillas CT-COM y OS-COM (B24, ficha 17.7). Cambiar una
// cláusula crea su versión siguiente: los contratos ya generados conservan la versión que usaron.

export const clauseKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{2,59}$/u, 'Use minúsculas, números y guiones: objeto-del-contrato')
  .describe('Clave de la cláusula');

const clauseFields = {
  title: requiredText(3, 120, 'Escriba el título de la cláusula.'),
  body: requiredText(10, 10000, 'Escriba el texto de la cláusula.'),
  numbered: z.boolean().describe('Lleva número (PRIMERA, SEGUNDA…); el encabezado no'),
  legal_validated: z.boolean().describe('El asesor jurídico ya validó el texto (numeral 19.4)'),
};

export const createClauseRequestSchema = z.strictObject({ key: clauseKeySchema, ...clauseFields });

/** Versión nueva de una cláusula: la anterior se conserva para los contratos que la usaron. */
export const clauseVersionRequestSchema = z.strictObject(clauseFields);

export const clauseSchema = z.object({
  key: clauseKeySchema,
  version: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  numbered: z.boolean(),
  legal_validated: z.boolean(),
  approved_by: personRefSchema.nullable().describe('Quien aprobó esta versión'),
  approved_at: dateTimeSchema,
  templates: z.array(z.string()).describe('Plantillas que la usan'),
});

export const clauseListSchema = z.object({ data: z.array(clauseSchema) });

export const templateSchema = z.object({
  id: z.uuid(),
  code: z.string().describe('Código del formato: CT-COM-001'),
  name: z.string(),
  kind: contractKindSchema,
  version: z.string().describe('Versión del formato: 01'),
  clauses: z.array(
    z.object({
      key: clauseKeySchema,
      title: z.string(),
      required: z.boolean().describe('No se puede quitar del contrato'),
    }),
  ),
});

export type CreateClauseRequest = z.infer<typeof createClauseRequestSchema>;
export type ClauseVersionRequest = z.infer<typeof clauseVersionRequestSchema>;
export type Clause = z.infer<typeof clauseSchema>;
export type ClauseList = z.infer<typeof clauseListSchema>;
export type ContractTemplate = z.infer<typeof templateSchema>;
