import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';
import { versionConflict, versionFromIfMatch } from './if-match.js';

describe('versión del registro en If-Match', () => {
  it('acepta «3», «"3"» y la forma débil W/"3"', () => {
    expect(['3', '"3"', 'W/"3"'].map(versionFromIfMatch)).toEqual([3, 3, 3]);
  });

  it('sin versión válida responde 400 VERSION_REQUIRED', () => {
    for (const header of [undefined, '', '0', 'abc', '"-1"']) {
      expect(() => versionFromIfMatch(header)).toThrow(AppError);
    }
    expect(versionConflict()).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });
});
