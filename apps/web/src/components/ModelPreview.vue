<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RotateCcw } from 'lucide-vue-next';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Group,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const props = defineProps<{ model: Group | null; label?: string; compact?: boolean }>();
// shallowRef: a plain `ref` would wrap the cloned Group in a reactive Proxy,
// which breaks three.js internals (read-only matrix props) and the model never renders.
const currentModel = shallowRef<Group | null>(null);
const host = ref<HTMLDivElement>();
let renderer: WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let camera: PerspectiveCamera | undefined;
let scene: Scene | undefined;
let observer: ResizeObserver | undefined;
let visibilityObserver: IntersectionObserver | undefined;
let frame = 0;
let rendererStarted = false;

function fit() {
  if (!camera || !controls || !currentModel.value) return;
  const box = new Box3().setFromObject(currentModel.value);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  camera.position.set(center.x + span * 1.25, center.y + span, center.z + span * 1.6);
  camera.near = Math.max(span / 1000, 0.01);
  camera.far = span * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
}

function rebuild() {
  if (!scene) return;
  scene.children.filter((item) => item.userData.model).forEach((item) => scene?.remove(item));
  currentModel.value = props.model ? markRaw(props.model.clone(true)) : null;
  if (currentModel.value) {
    // 3MF uses Z-up coordinates while the Three.js preview uses Y-up.
    currentModel.value.rotation.set(-Math.PI / 2, 0, 0);
    currentModel.value.position.set(0, 0, 0);
    currentModel.value.updateMatrixWorld(true);
    const modelBox = new Box3().setFromObject(currentModel.value);
    const modelCenter = modelBox.getCenter(new Vector3());
    currentModel.value.position.set(-modelCenter.x, -modelBox.min.y, -modelCenter.z);
    currentModel.value.updateMatrixWorld(true);
    currentModel.value.userData.model = true;
    scene.add(currentModel.value);
    fit();
  }
}

function startRenderer() {
  if (rendererStarted) return;
  rendererStarted = true;
  if (!host.value) return;
  scene = new Scene();
  scene.background = new Color(0x000000);
  scene.background = null;
  camera = new PerspectiveCamera(42, 1, 0.01, 10000);
  renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // Tone-map lit highlights so bright faces don't clip to white and wash out the
  // filament color. Without this, a ~6.0 ambient+directional sum saturates every
  // color channel toward 1 and the part reads pale instead of its real hex.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.className = 'model-canvas';
  host.value.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // three r155+ dropped useLegacyLights: intensities are physical units now, so they
  // must be ~PIx higher than the old values to keep the model clearly lit.
  // Keep ambient low so the material's own color dominates (a high ambient
  // floods every face with white and desaturates the filament color); rely on
  // the key/fill directional pair and tone mapping for shape and exposure.
  scene.add(new HemisphereLight(0xffffff, 0x202828, 1.2));
  scene.add(new AmbientLight(0xffffff, 0.5));
  const key = new DirectionalLight(0xffffff, 2.6);
  key.position.set(4, 7, 5);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 1.3);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  const grid = new GridHelper(500, 20, 0x6b8f82, 0x6b8f82);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);
  const resize = () => {
    if (!host.value || !renderer || !camera) return;
    const { width, height } = host.value.getBoundingClientRect();
    // Skip 0-size (modal transition / layout not settled); a retry catches the real size.
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  observer = new ResizeObserver(resize);
  observer.observe(host.value);
  resize();
  rebuild();
  // Layout (esp. inside an animated NModal) may not be settled on the first frame;
  // retry until the host reports a real size, then re-frame the camera.
  let retries = 0;
  const ensureSized = () => {
    const rect = host.value?.getBoundingClientRect();
    if ((!rect || rect.width === 0 || rect.height === 0) && retries++ < 60) {
      requestAnimationFrame(ensureSized);
      return;
    }
    resize();
    fit();
  };
  requestAnimationFrame(ensureSized);
  const render = () => {
    controls?.update();
    if (scene && camera) renderer?.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();
}

onMounted(() => {
  if (!host.value || typeof IntersectionObserver === 'undefined') {
    startRenderer();
    return;
  }
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        startRenderer();
        visibilityObserver?.disconnect();
      }
    },
    { threshold: 0.01 },
  );
  visibilityObserver.observe(host.value);
});
watch(() => props.model, rebuild);
onBeforeUnmount(() => {
  observer?.disconnect();
  visibilityObserver?.disconnect();
  cancelAnimationFrame(frame);
  controls?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <section class="model-preview" :class="{ compact }" aria-label="三维模型预览">
    <div class="model-preview-label">
      <span>3D PREVIEW</span><small>{{ label || '需求模型.3mf' }}</small>
    </div>
    <n-button quaternary circle class="model-reset" title="重置视角" @click="fit"
      ><template #icon><RotateCcw :size="18" aria-hidden="true" /></template>
    </n-button>
    <div ref="host" class="model-host"></div>
  </section>
</template>

<style scoped>
.model-preview {
  position: relative;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}
.model-preview.compact {
  min-height: 220px;
}
.model-host {
  position: absolute;
  inset: 0;
}
.model-preview-label {
  position: absolute;
  z-index: 2;
  top: 12px;
  left: 12px;
  display: grid;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
}
.model-preview-label span {
  color: var(--color-primary);
  font-family: var(--font-family-mono);
  font-size: var(--text-3xs);
}
.model-preview-label small {
  color: var(--color-text);
}
.model-reset {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
}
.model-reset {
  font-size: 0;
}
:deep(.model-canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
:deep(.model-canvas) {
  cursor: grab;
}
:deep(.model-canvas:active) {
  cursor: grabbing;
}
@media (max-width: 640px) {
  .model-preview {
    min-height: 220px;
  }
}
</style>
