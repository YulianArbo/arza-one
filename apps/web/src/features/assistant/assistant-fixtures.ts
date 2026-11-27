import type { AiAnswer, AiStatus, PermissionCode } from '@arza/contracts';

import { json, mockApi, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';

// Datos ficticios de las pruebas del asistente (B47).

export const AI_ID = (n: number): string =>
  `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export function status(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    provider: 'rehearsal',
    model: 'ensayo-local',
    enabled_use_cases: ['doc_search', 'doc_summary', 'ticket_summary', 'ticket_classify'],
    used_today: 3,
    daily_limit: 50,
    ...overrides,
  };
}

export function answer(overrides: Partial<AiAnswer> = {}): AiAnswer {
  return {
    request_id: AI_ID(90),
    use_case: 'doc_search',
    outcome: 'answered',
    text: 'Se solicita con el formato de cambios. [F1]',
    suggestion: null,
    sources: [
      { kind: 'document', id: AI_ID(10), code: 'PR-SGC-001', title: 'Control de documentos' },
    ],
    model: 'ensayo-local',
    rehearsal: true,
    truncated: false,
    ...overrides,
  };
}

export function serve(
  routes: Readonly<Record<string, (request: SentRequest) => Response>>,
  codes: readonly PermissionCode[],
): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    ...routes,
  });
}
