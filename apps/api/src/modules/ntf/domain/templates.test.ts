import { NOTIFICATION_KIND_KEYS, templateVariables } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATES, fillTemplate, unknownVariables } from './templates.js';

describe('plantillas de los avisos', () => {
  it('reemplaza cada variable, con o sin espacios entre las llaves', () => {
    const text = 'Hola {{nombre}}: la tarea «{{ tarea }}» vence {{vence}}.';
    expect(fillTemplate(text, { nombre: 'Ana', tarea: 'Revisar', vence: 'hoy' })).toBe(
      'Hola Ana: la tarea «Revisar» vence hoy.',
    );
  });

  it('una variable sin valor queda vacía, nunca con las llaves', () => {
    expect(fillTemplate('Hola {{nombre}}.', {})).toBe('Hola .');
  });

  it('no interpreta el valor como otra plantilla', () => {
    expect(fillTemplate('{{comentario}}', { comentario: '{{nombre}}' })).toBe('{{nombre}}');
  });

  it('detecta las variables que el tipo de aviso no ofrece', () => {
    expect(
      unknownVariables('task_assigned', ['{{tarea}} {{monto}}', '{{nombre}} {{monto}}']),
    ).toEqual(['monto']);
    expect(unknownVariables('task_assigned', ['{{tarea}} vence {{vence}}'])).toEqual([]);
  });

  it('las plantillas iniciales solo usan las variables de su tipo', () => {
    for (const kind of NOTIFICATION_KIND_KEYS) {
      const { subject, body } = DEFAULT_TEMPLATES[kind];
      expect(unknownVariables(kind, [subject, body]), kind).toEqual([]);
      expect(templateVariables(body).length, kind).toBeGreaterThan(0);
    }
  });

  it('solo la alerta de seguridad es urgente al empezar', () => {
    const urgent = Object.entries(DEFAULT_TEMPLATES).filter(([, template]) => template.urgent);
    expect(urgent.map(([kind]) => kind)).toEqual(['security_alert']);
  });
});
