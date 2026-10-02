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

export type ModelExtension = (typeof MODEL_EXTENSIONS)[number];

export const MODEL_ACCEPT = MODEL_EXTENSIONS.join(',');
export const MODEL_FORMAT_LABEL = '3MF、OBJ、GLB、STL、FBX、USDZ、ABC、3DS、USDC 或 MTL';

export const PREVIEWABLE_MODEL_EXTENSIONS: readonly ModelExtension[] = [
  '.3mf',
  '.obj',
  '.glb',
  '.stl',
  '.fbx',
  '.usdz',
  '.3ds',
  '.usdc',
];

export function modelExtension(filename: string): ModelExtension | null {
  const normalized = filename.toLowerCase();
  return MODEL_EXTENSIONS.find((extension) => normalized.endsWith(extension)) ?? null;
}

export function modelMime(extension: ModelExtension): string {
  return (
    {
      '.3mf': 'model/3mf',
      '.obj': 'model/obj',
      '.glb': 'model/gltf-binary',
      '.stl': 'model/stl',
      '.fbx': 'application/octet-stream',
      '.usdz': 'model/vnd.usdz+zip',
      '.abc': 'application/octet-stream',
      '.3ds': 'application/x-3ds',
      '.usdc': 'model/vnd.usd',
      '.mtl': 'model/mtl',
    } as Record<ModelExtension, string>
  )[extension];
}
