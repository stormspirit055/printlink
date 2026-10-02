import { describe, expect, test } from 'vitest';
import { isSupportedModelName, MODEL_EXTENSION_PATTERN, MODEL_EXTENSIONS } from './model-formats.js';

describe('model formats', () => {
  test('accepts the public upload formats case-insensitively', () => {
    expect(MODEL_EXTENSIONS).toEqual([
      '.3mf',
      '.obj',
      '.glb',
      '.stl',
      '.fbx',
      '.usdz',
      '.abc',
      '.3ds',
      '.usdc',
      '.mtl',
    ]);
    for (const extension of MODEL_EXTENSIONS) expect(isSupportedModelName(`part${extension.toUpperCase()}`)).toBe(true);
  });

  test('rejects unsupported and disguised file extensions', () => {
    expect(isSupportedModelName('part.step')).toBe(false);
    expect(isSupportedModelName('part.obj.exe')).toBe(false);
  });

  test('matches every supported direct-upload object extension', () => {
    const pattern = new RegExp(`^model\\.${MODEL_EXTENSION_PATTERN}$`, 'i');
    for (const extension of MODEL_EXTENSIONS) expect(pattern.test(`model${extension}`)).toBe(true);
    expect(pattern.test('model.step')).toBe(false);
  });
});
