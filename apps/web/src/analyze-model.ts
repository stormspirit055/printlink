import { Box3, BufferGeometry, Color, Group, Material, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { analyze3mfBuffer, type ModelAnalysis, type ModelPartAnalysis } from './analyze-3mf';
import { MODEL_FORMAT_LABEL, modelExtension, type ModelExtension } from './model-formats';

function triangleVolume(geometry: BufferGeometry, matrix: Matrix4) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!position) return 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const cross = new Vector3();
  let volume = 0;
  const read = (target: Vector3, vertex: number) => target.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
  const count = index ? index.count : position.count;
  for (let offset = 0; offset + 2 < count; offset += 3) {
    read(a, index ? index.getX(offset) : offset);
    read(b, index ? index.getX(offset + 1) : offset + 1);
    read(c, index ? index.getX(offset + 2) : offset + 2);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return Math.abs(volume);
}

function analyzeScene(scene: Group, extension: ModelExtension): ModelAnalysis {
  scene.updateMatrixWorld(true);
  const box = new Box3();
  let volumeMm3 = 0;
  let colorHex: string | null = null;
  let meshCount = 0;
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || !object.visible) return;
    meshCount += 1;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    volumeMm3 += triangleVolume(mesh.geometry, mesh.matrixWorld);
    if (!colorHex) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const color = (material as Material & { color?: Color }).color;
      if (color) colorHex = `#${color.getHexString()}`;
    }
  });
  if (!meshCount || box.isEmpty()) throw new Error('当前模型无法渲染');
  const size = box.getSize(new Vector3());
  scene.userData.modelExtension = extension;
  const part: ModelPartAnalysis = {
    id: 'part-1',
    name: `模型${extension.toUpperCase()}`,
    sizeX: +size.x.toFixed(2),
    sizeY: +size.y.toFixed(2),
    sizeZ: +size.z.toFixed(2),
    volumeCm3: +(volumeMm3 / 1000).toFixed(2),
    colorHex,
    scene,
  };
  return { ...part, quantity: 1, parts: [part] };
}

function parseGlb(buffer: ArrayBuffer): Promise<Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

function normalizeUnits(scene: Group, extension: ModelExtension) {
  // glTF defines distances in metres. FBX's UnitScaleFactor is centimetres per
  // file unit (default 1), while OpenUSD defaults to centimetres. OBJ and STL
  // are unitless, so the printing workflow follows the common mm convention.
  const scale =
    extension === '.glb'
      ? 1000
      : extension === '.fbx'
        ? Number(scene.userData.unitScaleFactor || 1) * 10
        : extension === '.usdz' || extension === '.usdc'
          ? 10
          : 1;
  scene.scale.multiplyScalar(scale);
}

export async function analyzeModelBuffer(buffer: ArrayBuffer, filename: string): Promise<ModelAnalysis> {
  const extension = modelExtension(filename);
  if (!extension) throw new Error(`请选择 ${MODEL_FORMAT_LABEL} 格式的模型文件`);
  if (extension === '.3mf') {
    const analysis = analyze3mfBuffer(buffer);
    analysis.scene.userData.modelExtension = extension;
    analysis.parts.forEach((part) => (part.scene.userData.modelExtension = extension));
    return analysis;
  }

  let scene: Group;
  if (extension === '.obj') {
    scene = new OBJLoader().parse(new TextDecoder().decode(buffer));
  } else if (extension === '.glb') {
    scene = await parseGlb(buffer);
  } else if (extension === '.stl') {
    const geometry = new STLLoader().parse(buffer);
    scene = new Group();
    scene.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x8ba89d, roughness: 1, metalness: 0 })));
  } else if (extension === '.fbx') {
    scene = new FBXLoader().parse(buffer, '');
  } else if (extension === '.3ds') {
    scene = new TDSLoader().parse(buffer, '');
  } else if (extension === '.usdz' || extension === '.usdc') {
    scene = new USDLoader().parse(buffer);
  } else {
    throw new Error('当前模型无法渲染');
  }
  normalizeUnits(scene, extension);
  return analyzeScene(scene, extension);
}

export async function analyzeModel(file: File): Promise<ModelAnalysis> {
  return analyzeModelBuffer(await file.arrayBuffer(), file.name);
}
