import { describe, expect, it } from 'vitest';

import { escapeHtml, noticeEmail } from './notice-email.js';

describe('correo de un aviso', () => {
  const email = noticeEmail({
    subject: 'Nueva tarea: Revisar <contrato>',
    body: 'Le asignaron la tarea «Revisar <contrato>».\n\nVence mañana.',
    url: 'https://app.arza.test/app/mis-tareas/1?a=1&b=2',
  });

  it('el texto lleva el cuerpo, el enlace y la firma', () => {
    expect(email.text).toContain('Le asignaron la tarea «Revisar <contrato>».');
    expect(email.text).toContain(
      'Abrir en ARZA ONE: https://app.arza.test/app/mis-tareas/1?a=1&b=2',
    );
    expect(email.text).toContain('ARZA TECH S.A.S.');
  });

  it('el HTML escapa lo que escribió una persona', () => {
    expect(email.html).not.toContain('<contrato>');
    expect(email.html).toContain('Revisar &lt;contrato&gt;');
    expect(email.html).toContain('href="https://app.arza.test/app/mis-tareas/1?a=1&amp;b=2"');
    expect(email.html).toContain('<p style="margin:0 0 16px">Vence mañana.</p>');
  });

  it('sin enlace no hay botón', () => {
    const plain = noticeEmail({ subject: 'Hola', body: 'Texto', url: null });
    expect(plain.html).not.toContain('<a ');
    expect(plain.text).not.toContain('Abrir en ARZA ONE');
  });

  it('escapa comillas y el signo &', () => {
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
});
