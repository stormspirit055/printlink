import { Box3, BufferGeometry, Color, Group, Material, Mesh, MeshStandardMaterial, Matrix4, Object3D, Vector3 } from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type ModelAnalysis = {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  quantity: number;
  volumeCm3: number;
  colorHex: string | null;
  scene: Group;
  parts: ModelPartAnalysis[];
};
export type ModelPartAnalysis = {
  id: string;
  name: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  volumeCm3: number;
  colorHex: string | null;
  scene: Group;
};
const triangleVolume = (geometry: BufferGeometry, matrix: Matrix4) => {
  const position = geometry.getAttribute('position'),
    index = geometry.index;
  if (!position) return 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    cross = new Vector3();
  let volume = 0;
  const read = (target: Vector3, i: number) => target.fromBufferAttribute(position, i).applyMatrix4(matrix);
  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = index ? index.getX(i) : i,
      ib = index ? index.getX(i + 1) : i + 1,
      ic = index ? index.getX(i + 2) : i + 2;
    read(a, ia);
    read(b, ib);
    read(c, ic);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return Math.abs(volume);
};
export async function analyze3mf(file: File): Promise<ModelAnalysis> {
  if (!file.name.toLowerCase().endsWith('.3mf')) throw new Error('请选择 3MF 格式的模型文件');
  return analyze3mfBuffer(await file.arrayBuffer());
}

export function analyze3mfBuffer(buffer: ArrayBuffer): ModelAnalysis {
  const bambuBuffer = normalizeBambu3mf(buffer);
  const group: Group = new ThreeMFLoader().parse(bambuBuffer);
  group.updateMatrixWorld(true);
  // The 3MFLoader builds MeshPhongMaterial(flatShading) with a specular term, so
  // faces toward the light pick up a white sheen and the same hex reads unevenly
  // across a part. Swap to a matte PBR material (roughness 1, metalness 0) so
  // the filament color shows the same value on every face, matching Bambu
  // Studio's flat matte shading. Done on the parsed group so every downstream
  // clone (groupByExtruder, analyzePart) inherits the matte material.
  makeMatte(group);
  const buildItems = group.children.length ? [...group.children] : [group];
  // Group by each build item's own extruder (its dominant filament color) so a
  // multicolor-painted part stays in a single pile instead of being cloned into
  // every color it paints. Falls back to per-mesh color grouping for files that
  // lack Bambu extruder metadata.
  const meta = readBambuMeta(buffer);
  const colorItems = meta.buildExtruders
    ? groupByExtruder(buildItems, meta.buildExtruders, meta.colors)
    : groupByColor(buildItems);
  const parts = (colorItems.length ? colorItems : buildItems).map((item, index) => analyzePart(item, index));
  const box = new Box3().setFromObject(group);
  const size = box.getSize(new Vector3());
  if (box.isEmpty() || !parts.length) throw new Error('3MF 文件中没有可解析的网格模型');
  return {
    sizeX: +size.x.toFixed(2),
    sizeY: +size.y.toFixed(2),
    sizeZ: +size.z.toFixed(2),
    quantity: parts.length,
    volumeCm3: +parts.reduce((sum, part) => sum + part.volumeCm3, 0).toFixed(2),
    colorHex: parts.find((part) => part.colorHex)?.colorHex || null,
    scene: group,
    parts,
  };
}

function normalizeBambu3mf(buffer: ArrayBuffer): ArrayBuffer {
  const files = unzipSync(new Uint8Array(buffer));
  const config = files['Metadata/project_settings.config'];
  if (!config) return buffer;
  const text = strFromU8(config);
  const match = text.match(/"filament_colour"\s*:\s*\[([\s\S]*?)\]/);
  const colors = match ? [...match[1].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((item) => item[1]) : [];
  if (!colors.length) return buffer;
  // Build a per-mesh-object extruder map so each <object> can fall back to its
  // own filament color for faces without an explicit face_property. Bambu stores
  // the extruder (1-based filament index) on the composite object in
  // model_settings.config, while the actual mesh lives in a sub .model referenced
  // from 3dmodel.model's <component p:path=... objectid=...>. We resolve that
  // composite -> sub-object relationship here.
  const extruderByPathObject = resolveExtruders(files);
  const palette = `<basematerials id="9000">${colors.map((color, index) => `<base name="Bambu ${index + 1}" displaycolor="${color}"/>`).join('')}</basematerials>`;
  const normalized: Record<string, Uint8Array> = { ...files };
  for (const [path, data] of Object.entries(files)) {
    if (!path.endsWith('.model')) continue;
    let xml = strFromU8(data);
    const hasFaceProperty = xml.includes('face_property=') || xml.includes('face_property =');
    const objectIds = [...xml.matchAll(/<object\b[^>]*\bid="(\d+)"/g)].map((item) => item[1]);
    // Skip files that neither paint faces nor have a known extruder: nothing to
    // inject, so leave them untouched and let the loader use its default material.
    const knownExtruders = objectIds.filter((id) => extruderByPathObject[path]?.[id] !== undefined);
    if (!hasFaceProperty && !knownExtruders.length) continue;
    xml = xml.replace('<resources>', `<resources>${palette}`);
    const faceValues = [...xml.matchAll(/face_property\s*=\s*"(\d+)"/g)].map((item) => parseInt(item[1], 10));
    // Bambu's face_property is a 0-based internal extruder index (0 = first
    // filament), while the model_settings extruder metadata is 1-based. Only
    // shift indices down by 1 as a fallback when a value would otherwise fall
    // outside the palette, which is the signature of a 1-based file. This keeps
    // the common 0-based Bambu export (e.g. face_property="3" in a 4-color file)
    // mapped to the 4th filament instead of being shifted to the 3rd.
    const offset = faceValues.length && Math.max(...faceValues) >= colors.length ? 1 : 0;
    xml = xml.replace(/<object\b([^>]*?)(\/?)>/g, (_match, attrs, slash) => {
      const id = attrs.match(/\bid="(\d+)"/)?.[1] ?? '';
      // pindex: the object's own extruder color (1-based -> 0-based) when known,
      // otherwise the dominant face_property so unpainted faces still resolve.
      const extruder = extruderByPathObject[path]?.[id];
      const pindex = extruder !== undefined ? extruder - 1
        : faceValues.length ? Math.min(...faceValues) - offset : 0;
      return `<object${attrs} pid="9000" pindex="${pindex}"${slash}>`;
    });
    xml = xml.replace(/face_property\s*=\s*"(\d+)"/g, (_match, value) => `p1="${parseInt(value, 10) - offset}"`);
    normalized[path] = strToU8(xml);
  }
  const out = zipSync(normalized);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/**
 * Resolves each sub-model mesh object to the 1-based extruder (filament index)
 * Bambu Studio records on its composite parent in model_settings.config.
 * Returns a map keyed by zip entry path, then by object id.
 */
function resolveExtruders(files: Record<string, Uint8Array>): Record<string, Record<string, number>> {
  const settings = files['Metadata/model_settings.config'];
  if (!settings) return {};
  const settingsXml = strFromU8(settings);
  // object id -> extruder (the extruder lives on the composite object entry)
  const extruderByObjectId: Record<string, number> = {};
  for (const block of settingsXml.split(/<object\s+id=/).slice(1)) {
    const id = block.match(/^"(\d+)"/)?.[1];
    const extruder = block.match(/key="extruder"\s+value="(\d+)"/)?.[1];
    if (id && extruder) extruderByObjectId[id] = parseInt(extruder, 10);
  }
  const modelFile = Object.keys(files).find((path) => path === '3D/3dmodel.model' || path.endsWith('/3dmodel.model'));
  if (!modelFile) return {};
  const modelXml = strFromU8(files[modelFile]);
  // composite object id -> [{ path, objectid }] components
  const result: Record<string, Record<string, number>> = {};
  for (const composite of modelXml.matchAll(/<object\s+id="(\d+)"[^>]*>\s*<components>([\s\S]*?)<\/components>/g)) {
    const extruder = extruderByObjectId[composite[1]];
    if (extruder === undefined) continue;
    for (const component of composite[2].matchAll(/p:path="([^"]+)"\s+objectid="(\d+)"/g)) {
      const path = component[1].replace(/^\/+/, '');
      (result[path] ??= {})[component[2]] = extruder;
    }
  }
  return result;
}

function analyzePart(item: Object3D, index: number): ModelPartAnalysis {
  const scene = new Group();
  scene.add(item.clone(true));
  scene.updateMatrixWorld(true);
  const box = new Box3();
  const size = new Vector3();
  let volumeMm3 = 0;
  // groupByExtruder names each pile with its filament hex; use that as the
  // representative color so a painted part reports its dominant filament, not
  // whichever sub-mesh the traversal happens to meet first.
  const namedColor = /^#[0-9a-fA-F]{6}$/.test(item.name?.trim() || '') ? item.name!.trim() : null;
  let colorHex: string | null = namedColor;
  let meshCount = 0;
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // groupByColor keeps one color per group by toggling visibility on cloned
    // meshes; only the visible ones belong to this part, so bounding box,
    // volume and the representative color must all skip hidden meshes.
    if (!object.visible) return;
    meshCount += 1;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      const worldBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      box.union(worldBox);
    }
    volumeMm3 += triangleVolume(mesh.geometry, mesh.matrixWorld);
    if (!colorHex) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const color = (material as Material & { color?: Color }).color;
      if (color) colorHex = `#${color.getHexString()}`;
    }
  });
  if (box.isEmpty() || meshCount === 0) throw new Error(`3MF 文件中的单件 ${index + 1} 没有可解析网格`);
  box.getSize(size);
  return {
    id: `part-${index + 1}`,
    name: item.name?.trim() || `单件 ${String(index + 1).padStart(2, '0')}`,
    sizeX: +size.x.toFixed(2),
    sizeY: +size.y.toFixed(2),
    sizeZ: +size.z.toFixed(2),
    volumeCm3: +(volumeMm3 / 1000).toFixed(2),
    colorHex,
    scene,
  };
}

function meshColor(object: Mesh): string {
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  const color = (material as Material & { color?: Color }).color;
  return color ? `#${color.getHexString()}` : 'default';
}

/**
 * Replaces each mesh's material with a matte MeshStandardMaterial (roughness 1,
 * metalness 0, flat shading) that preserves the filament color, opacity and
 * name. The 3MFLoader produces MeshPhongMaterial whose specular term makes the
 * same color read brighter on light-facing faces; a matte surface reads the
 * color value evenly so it matches Bambu Studio's flat matte shading.
 */
function makeMatte(group: Object3D) {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const oldMats = Array.isArray(object.material) ? object.material : [object.material];
    const matte = oldMats.map((material) => {
      const source = material as Material & {
        color: Color; opacity: number; transparent: boolean; name: string;
      };
      return new MeshStandardMaterial({
        color: source.color.clone(),
        opacity: source.opacity,
        transparent: source.transparent,
        name: source.name,
        roughness: 1,
        metalness: 0,
        flatShading: true,
      });
    });
    object.material = Array.isArray(object.material) ? matte : matte[0];
  });
}

function groupByColor(items: Object3D[]): Object3D[] {
  const colors = new Set<string>();
  items.forEach((item) => item.traverse((object) => { if (object instanceof Mesh) colors.add(meshColor(object)); }));
  if (colors.size <= 1) return items;
  return [...colors].map((color) => {
    const root = new Group();
    items.forEach((item) => {
      const clone = item.clone(true);
      clone.traverse((object) => { if (object instanceof Mesh) object.visible = meshColor(object) === color; });
      root.add(clone);
    });
    root.name = color === 'default' ? '默认颜色' : color;
    return root;
  });
}

/**
 * Reads Bambu's filament palette and the extruder assigned to each top-level
 * build item, so parts can be grouped by each piece's dominant filament color.
 * The extruder is recorded on the composite object in model_settings.config,
 * and the build items in 3dmodel.model reference those composite object ids.
 */
function readBambuMeta(buffer: ArrayBuffer): { colors: string[]; buildExtruders: (number | null)[] | null } {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(buffer)); } catch { return { colors: [], buildExtruders: null }; }
  const config = files['Metadata/project_settings.config'];
  if (!config) return { colors: [], buildExtruders: null };
  const match = strFromU8(config).match(/"filament_colour"\s*:\s*\[([\s\S]*?)\]/);
  const colors = match ? [...match[1].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((item) => item[1]) : [];
  if (!colors.length) return { colors, buildExtruders: null };
  const settings = files['Metadata/model_settings.config'];
  if (!settings) return { colors, buildExtruders: null };
  const extruderByObject: Record<string, number> = {};
  for (const block of strFromU8(settings).split(/<object\s+id=/).slice(1)) {
    const id = block.match(/^"(\d+)"/)?.[1];
    const extruder = block.match(/key="extruder"\s+value="(\d+)"/)?.[1];
    if (id && extruder) extruderByObject[id] = parseInt(extruder, 10);
  }
  if (!Object.keys(extruderByObject).length) return { colors, buildExtruders: null };
  const modelFile = Object.keys(files).find((path) => path === '3D/3dmodel.model' || path.endsWith('/3dmodel.model'));
  if (!modelFile) return { colors, buildExtruders: null };
  const buildObjectIds = [...strFromU8(files[modelFile]).matchAll(/<item\s+[^>]*objectid="(\d+)"/g)].map((item) => item[1]);
  if (!buildObjectIds.length) return { colors, buildExtruders: null };
  const buildExtruders = buildObjectIds.map((id) => extruderByObject[id] ?? null);
  // Only group when there is more than one extruder in use; a single-extruder
  // file stays as one pile per build item.
  return { colors, buildExtruders: new Set(buildExtruders.filter((e): e is number => e !== null)).size > 1 ? buildExtruders : null };
}

/**
 * Groups build items by their extruder (dominant filament color) and repaints
 * every mesh in the pile to that filament's solid color. Bambu paints
 * face-level detail onto parts (e.g. a purple-extruder part with blue accents),
 * which would bleed other filaments' colors into a pile and break the
 * "one pile = one color" rendering Bambu Studio's filament split shows. Since a
 * part must stay in a single pile (no cross-scene duplication), we override each
 * mesh material to the pile's filament color so the pile renders as a solid
 * block of that color.
 */
function groupByExtruder(items: Object3D[], buildExtruders: (number | null)[], colors: string[]): Object3D[] {
  const byExtruder = new Map<number, Object3D[]>();
  items.forEach((item, index) => {
    const extruder = buildExtruders[index];
    if (extruder === null || extruder === undefined) return;
    const list = byExtruder.get(extruder) ?? [];
    list.push(item);
    byExtruder.set(extruder, list);
  });
  return [...byExtruder.entries()].map(([extruder, list]) => {
    const hex = colors[extruder - 1] || '#cccccc';
    const color = new Color(hex);
    const root = new Group();
    list.forEach((item) => {
      const clone = item.clone(true);
      clone.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        // Clone the material (Mesh.clone shares the reference) before recoloring
        // so the original build tree the loader produced stays untouched.
        const oldMats = Array.isArray(object.material) ? object.material : [object.material];
        const repainted = oldMats.map((material) => {
          const copy = (material as Material & { color: Color; vertexColors?: boolean }).clone();
          copy.color = color.clone();
          if ('vertexColors' in copy) copy.vertexColors = false;
          return copy as Material;
        });
        object.material = Array.isArray(object.material) ? repainted : repainted[0];
      });
      root.add(clone);
    });
    root.name = hex;
    return root;
  });
}
export function nearestColor(hex: string | null, colors: { name: string; hex: string }[]) {
  if (!colors.length) return '';
  if (!hex) return colors[0].name;
  const source = new Color(hex);
  let best = colors[0],
    distance = Infinity;
  for (const item of colors) {
    const color = new Color(item.hex),
      next = (source.r - color.r) ** 2 + (source.g - color.g) ** 2 + (source.b - color.b) ** 2;
    if (next < distance) {
      distance = next;
      best = item;
    }
  }
  return best.name;
}
