import path from 'node:path';

export const MODEL_EXTENSIONS = [
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
] as const;
export const MODEL_EXTENSION_PATTERN = '(?:3mf|obj|glb|stl|fbx|usdz|abc|3ds|usdc|mtl)';
export const MODEL_FORMAT_LABEL = '3MF、OBJ、GLB、STL、FBX、USDZ、ABC、3DS、USDC 或 MTL';

export function isSupportedModelName(filename: string): boolean {
  return MODEL_EXTENSIONS.includes(path.extname(filename).toLowerCase() as (typeof MODEL_EXTENSIONS)[number]);
}
