import { z } from 'zod';

import { actionOriginRefSchema } from './actions.js';
import { qmsIdSchema, qmsRefSchema, qmsTextSchema } from './common.js';

// Lecciones aprendidas (B38, ficha 17.15). Las registra Calidad, con su proceso y, si sale de
// una, la no conformidad; las lee todo el personal interno (decisión 3).

export const lessonSchema = z.object({
  id: qmsIdSchema,
  title: z.string(),
  context: z.string(),
  lesson: z.string(),
  process: qmsRefSchema.nullable(),
  nonconformity: actionOriginRefSchema.nullable(),
  recorded_by: qmsRefSchema,
  recorded_on: z.iso.date(),
  version: z.number().int().positive(),
});
export const lessonListResponseSchema = z.object({ data: z.array(lessonSchema) });

export const saveLessonSchema = z.strictObject({
  title: qmsTextSchema(5, 200).describe('Título'),
  context: qmsTextSchema(5, 2000).describe('Qué pasó'),
  lesson: qmsTextSchema(5, 2000).describe('Qué aprendimos y qué haremos distinto'),
  process_id: qmsIdSchema.nullable().default(null),
  nonconformity_id: qmsIdSchema.nullable().default(null),
});

export type Lesson = z.infer<typeof lessonSchema>;
export type SaveLesson = z.infer<typeof saveLessonSchema>;
