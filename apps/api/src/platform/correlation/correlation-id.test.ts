import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import { assignCorrelationId, resolveCorrelationId } from './correlation-id.js';

const UUID_V7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

describe('identificador de correlación', () => {
  it('genera un UUID v7 cuando no llega ninguno', () => {
    expect(resolveCorrelationId(undefined)).toMatch(UUID_V7);
  });

  it('reutiliza el identificador recibido si es un UUID válido', () => {
    const received = '0192F3A1-7C2E-7B11-9A55-2D1C6F0E4A10';
    expect(resolveCorrelationId(received)).toBe(received.toLowerCase());
  });

  it('descarta un valor que no es UUID para evitar inyección en los registros', () => {
    const forged = 'abc\n{"level":"fatal"}';
    expect(resolveCorrelationId(forged)).toMatch(UUID_V7);
  });

  it('usa el primero cuando llegan varios', () => {
    const first = '0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10';
    expect(resolveCorrelationId([first, 'otro'])).toBe(first);
  });

  it('escribe el identificador en la respuesta', () => {
    const request = new IncomingMessage(new Socket());
    const response = new ServerResponse(request);
    const id = assignCorrelationId(request, response);
    expect(response.getHeader('x-correlation-id')).toBe(id);
  });
});
