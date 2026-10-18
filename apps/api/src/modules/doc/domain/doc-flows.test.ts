import { definitionProblems } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  CHANGE_REQUEST_FLOW_DATA,
  CHANGE_REQUEST_STATES,
  VERSION_FLOW_DATA,
  VERSION_STATES,
} from './doc-flows.js';

describe('flujos de la gestión documental', () => {
  it('la solicitud y la versión se pueden publicar en el motor sin problemas', () => {
    expect(definitionProblems(CHANGE_REQUEST_FLOW_DATA)).toEqual([]);
    expect(definitionProblems(VERSION_FLOW_DATA)).toEqual([]);
  });

  it('tienen los estados que el módulo reconoce', () => {
    const requestKeys = CHANGE_REQUEST_FLOW_DATA.states.map((state) => state.key);
    expect(requestKeys).toEqual(Object.values(CHANGE_REQUEST_STATES));
    const versionKeys = VERSION_FLOW_DATA.states.map((state) => state.key);
    expect(versionKeys).toEqual(Object.values(VERSION_STATES));
  });

  it('devolver y rechazar exigen comentario', () => {
    const rejections = [...CHANGE_REQUEST_FLOW_DATA.transitions, ...VERSION_FLOW_DATA.transitions]
      .filter((transition) => transition.action === 'reject')
      .map((transition) => transition.requires_comment);
    expect(rejections).toEqual([true, true, true]);
  });
});
