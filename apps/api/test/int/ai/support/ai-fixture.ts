import {
  aiAnswerSchema,
  aiUseCaseListResponseSchema,
  createdResponseSchema,
  type AiAnswer,
  type AiUseCase,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import type { AiRequest } from '../../../../src/generated/prisma/client.js';
import { refreshAiIndex, type AiIndexResult } from '../../../../src/modules/ai/index.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Ayudas de las pruebas del asistente de IA (B47). Las pruebas corren con el modo de ensayo
// (iam-fixtures.ts): nada sale del equipo y las respuestas son predecibles.

export const ASSESSMENT = {
  assessment_reference: 'EIPD-IA-001',
  assessment_approved_on: '2026-11-26',
};

export function putAs(s: AccessScenario, path: string, person: Person, body: object): request.Test {
  return request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token)
    .send(body);
}

/** Versión vigente de la configuración de un uso (0 si nunca se configuró). */
export async function useCaseVersion(
  s: AccessScenario,
  officer: Person,
  useCase: AiUseCase,
): Promise<number> {
  const response = await s.get('/v1/ai/use-cases', officer.session);
  expect(response.status, response.text).toBe(200);
  const list = aiUseCaseListResponseSchema.parse(response.body);
  return list.data.find((item) => item.use_case === useCase)?.version ?? 0;
}

/** El Oficial de datos activa los usos con la evaluación de impacto aprobada (decisión 7). */
export async function enable(
  s: AccessScenario,
  officer: Person,
  useCases: readonly AiUseCase[],
): Promise<void> {
  for (const useCase of useCases) {
    const version = await useCaseVersion(s, officer, useCase);
    const body = { enabled: true, ...ASSESSMENT, version };
    const response = await putAs(s, `/v1/ai/use-cases/${useCase}`, officer, body);
    expect(response.status, response.text).toBe(204);
  }
}

export function answerOf(response: request.Response): AiAnswer {
  expect(response.status, response.text).toBe(200);
  return aiAnswerSchema.parse(response.body);
}

export async function ask(s: AccessScenario, person: Person, question: string): Promise<AiAnswer> {
  return answerOf(await s.post('/v1/ai/search', person.session, { question }));
}

export function assist(
  s: AccessScenario,
  person: Person,
  useCase: AiUseCase,
  targetId: string,
): request.Test {
  return s.post('/v1/ai/assist', person.session, { use_case: useCase, target_id: targetId });
}

export function createdId(response: request.Response): string {
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

export function refreshIndex(s: AccessScenario): Promise<AiIndexResult> {
  return refreshAiIndex({ database: apiDatabase(), clock: s.clock });
}

/** Lo que quedó en el registro de un uso, leído directo de la base. */
export async function requestRow(s: AccessScenario, id: string): Promise<AiRequest> {
  return s.inTenant((tx) => tx.aiRequest.findUniqueOrThrow({ where: { id } }));
}

/** Acciones de auditoría de un registro. */
export async function auditActions(s: AccessScenario, entityId: string): Promise<string[]> {
  const events = await s.inTenant((tx) => tx.auditEvent.findMany({ where: { entityId } }));
  return events.map((event) => event.action);
}
