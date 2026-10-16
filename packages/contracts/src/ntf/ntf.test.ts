import { describe, expect, it } from 'vitest';

import {
  notificationListQuerySchema,
  templateVariables,
  updateNotificationTemplateRequestSchema,
} from './notifications.js';
import { createCommentRequestSchema, MAX_MENTIONS } from './records.js';

const RECORD = { entity_type: 'party', entity_id: '0199e3a0-0000-7000-8000-000000000001' };

describe('contratos de los avisos', () => {
  it('lee las variables de una plantilla', () => {
    expect(templateVariables('{{nombre}}: {{ tarea }} y {{tarea}}')).toEqual([
      'nombre',
      'tarea',
      'tarea',
    ]);
  });

  it('la consulta de avisos entiende «solo no leídos» y limita la página', () => {
    expect(notificationListQuerySchema.parse({ unread: 'true' })).toEqual({
      unread: true,
      limit: 30,
    });
    expect(notificationListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('una plantilla exige asunto y texto con contenido', () => {
    const ok = { subject: 'Asunto', body: 'Un texto suficiente', urgent: false };
    expect(updateNotificationTemplateRequestSchema.safeParse(ok).success).toBe(true);
    expect(updateNotificationTemplateRequestSchema.safeParse({ ...ok, body: ' ' }).success).toBe(
      false,
    );
  });
});

describe('contratos de los comentarios', () => {
  it('un comentario sin menciones las deja vacías y limita cuántas', () => {
    expect(createCommentRequestSchema.parse({ ...RECORD, body: 'Hola' }).mention_ids).toEqual([]);
    const many = Array.from({ length: MAX_MENTIONS + 1 }, () => RECORD.entity_id);
    const parsed = createCommentRequestSchema.safeParse({
      ...RECORD,
      body: 'Hola',
      mention_ids: many,
    });
    expect(parsed.success).toBe(false);
  });

  it('solo admite registros conocidos', () => {
    const parsed = createCommentRequestSchema.safeParse({
      ...RECORD,
      entity_type: 'invoice',
      body: 'x',
    });
    expect(parsed.success).toBe(false);
  });
});
