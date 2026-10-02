import { describe, expect, test } from 'vitest';
import { analyzeModelBuffer } from './analyze-model';
import { MODEL_ACCEPT, modelExtension, modelMime } from './model-formats';

const obj = `
v 0 0 0
v 10 0 0
v 0 10 0
v 0 0 10
f 1 3 2
f 1 2 4
f 1 4 3
f 2 3 4
`;

describe('model formats', () => {
  test('accepts every supported extension case-insensitively', () => {
    expect(MODEL_ACCEPT).toBe('.3mf,.obj,.glb,.stl,.fbx,.usdz,.abc,.3ds,.usdc,.mtl');
    expect(modelExtension('part.OBJ')).toBe('.obj');
    expect(modelExtension('part.step')).toBeNull();
    expect(modelMime('.glb')).toBe('model/gltf-binary');
  });

  test('parses OBJ geometry for preview and manufacturing estimates', async () => {
    const bytes = new TextEncoder().encode(obj);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const analysis = await analyzeModelBuffer(buffer, 'tetrahedron.obj');

    expect(analysis.quantity).toBe(1);
    expect(analysis.sizeX).toBe(10);
    expect(analysis.sizeY).toBe(10);
    expect(analysis.sizeZ).toBe(10);
    expect(analysis.volumeCm3).toBeCloseTo(1 / 6, 2);
    expect(analysis.parts[0].scene.userData.modelExtension).toBe('.obj');
  });

  test('rejects files outside the supported model formats', async () => {
    await expect(analyzeModelBuffer(new ArrayBuffer(0), 'part.step')).rejects.toThrow(
      '请选择 3MF、OBJ、GLB、STL、FBX、USDZ、ABC、3DS、USDC 或 MTL 格式的模型文件',
    );
  });

  test.each(['part.abc', 'part.mtl'])('accepts %s for upload but reports that preview is unavailable', async (name) => {
    await expect(analyzeModelBuffer(new ArrayBuffer(0), name)).rejects.toThrow('当前模型无法渲染');
  });
});
