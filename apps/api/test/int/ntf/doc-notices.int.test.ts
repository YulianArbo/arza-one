import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { NtfScenario } from './support/ntf-scenario.js';

// Avisos de la gestión documental (B19): la lectura pedida al publicar una versión y la decisión de
// una Solicitud de Acción Documental llegan a cada persona con su plantilla.

const scenario = new NtfScenario('avisos documentales');

/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');

describe('lectura pedida', () => {
  it('cada persona de los cargos destinatarios recibe el aviso con el código y la versión', async () => {
    const readers = [
      await scenario.people('lector-uno', ['COLABORADOR']),
      await scenario.people('lector-dos', ['COLABORADOR']),
    ];
    const documentId = uuidv7();
    const payload = {
      document_id: documentId,
      code: 'PR-SGC-007',
      version_label: '02',
      user_ids: readers.map((reader) => reader.id),
    };
    const eventId = await scenario.event('doc.acknowledgement.requested', payload, WORKDAY);
    await scenario.publishOutbox();
    const notices = await scenario.inTenant((tx) =>
      tx.notification.findMany({ where: { eventId } }),
    );
    expect(notices.map((notice) => notice.userId).sort()).toEqual(
      readers.map((reader) => reader.id).sort(),
    );
    expect(notices[0]?.title).toBe('Lea el documento PR-SGC-007');
    expect(notices[0]?.body).toContain('versión 02');
    expect(notices[0]?.link).toBe(`/app/documentos/${documentId}`);
  });
});

describe('solicitud decidida', () => {
  it('quien pidió el cambio sabe si se aprobó o se rechazó', async () => {
    const requester = await scenario.people('solicitante', ['COMERCIAL']);
    const requestId = uuidv7();
    const payload = {
      request_id: requestId,
      code: 'SAD-2026-0007',
      requester_id: requester.id,
      outcome: 'rejected',
    };
    const eventId = await scenario.event('doc.request.decided', payload, WORKDAY);
    await scenario.publishOutbox();
    const notice = await scenario.inTenant((tx) =>
      tx.notification.findFirstOrThrow({ where: { eventId, userId: requester.id } }),
    );
    expect(notice.title).toBe('Su solicitud documental SAD-2026-0007 fue rechazada');
    expect(notice.link).toBe(`/app/documentos/solicitudes/${requestId}`);
  });
});
