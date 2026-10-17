import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { wordFile } from './support/doc-scenario.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Casos del trámite de la versión (B19): la fecha de vigencia elegida al publicar, la devolución de
// Dirección y el envío desde «Mis tareas» de un Word que aún no tiene su PDF.

const scenario = new SgcScenario('trámite de versiones: casos');

beforeAll(async () => {
  await scenario.seed();
});

async function inApproval() {
  const author = await scenario.quality('elabora');
  const reviewer = await scenario.quality('revisa');
  const id = await scenario.createDocument(author);
  await scenario.step(author, await scenario.latest(author, id), 'submit');
  await scenario.step(reviewer, await scenario.latest(reviewer, id), 'approve');
  return { author, reviewer, id };
}

describe('aprobación de Dirección', () => {
  it('Dirección devuelve la versión con su motivo y vuelve al borrador', async () => {
    const { author, id } = await inApproval();
    const director = await scenario.director();
    const note = 'Falta el alcance del procedimiento';
    const back = await scenario.step(director, await scenario.latest(director, id), 'reject', {
      note,
    });
    expect(back.status, back.text).toBe(204);
    const draft = await scenario.latest(author, id);
    expect(draft).toMatchObject({ status: 'draft', review_note: note, step: 'Elaboración' });
  });

  it('publicar con una fecha de vigencia la deja como fecha del documento', async () => {
    const { reviewer, id } = await inApproval();
    const director = await scenario.director();
    await scenario.step(director, await scenario.latest(director, id), 'approve');
    const body = { effective_date: '2026-11-03' };
    const published = await scenario.step(
      reviewer,
      await scenario.latest(reviewer, id),
      'publish',
      body,
    );
    expect(published.status, published.text).toBe(204);
    expect((await scenario.latest(reviewer, id)).effective_date).toBe('2026-11-03');
  });
});

describe('enviar desde «Mis tareas»', () => {
  it('un Word sin su PDF no se envía a revisión ni desde la bandeja', async () => {
    const author = await scenario.quality('elabora');
    const source = await scenario.sourceFile(author, wordFile());
    const id = await scenario.createDocument(author, { source_file_id: source });
    const draft = await scenario.latest(author, id);
    expect(draft.render_status).toBe('pending');
    const taskId = await scenario.openTask(draft.workflow_instance_id ?? '');
    const sent = await scenario.post(`/v1/tasks/${taskId}/actions/complete`, author.session, {
      action: 'submit',
    });
    expect(errorCode(sent)).toBe('DOC_PDF_NOT_READY');
    expect((await scenario.latest(author, id)).status).toBe('draft');
  });
});
