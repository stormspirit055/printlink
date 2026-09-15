<script setup lang="ts">
import { markRaw, ref, watch } from 'vue';
import { analyze3mfBuffer, type ModelPartAnalysis } from '../analyze-3mf';
import ModelPreview from './ModelPreview.vue';
const props = defineProps<{ url?: string | null; label?: string }>();
const parts = ref<ModelPartAnalysis[]>([]),
  loading = ref(false),
  error = ref('');
watch(
  () => props.url,
  async (url) => {
    parts.value = [];
    error.value = '';
    if (!url) return;
    loading.value = true;
    try {
      // Same-origin keeps the session cookie for local /uploads paths while
      // cross-origin OSS signed URLs stay credential-free (bucket CORS does
      // not allow credentialed requests).
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('模型文件加载失败');
      parts.value = analyze3mfBuffer(await response.arrayBuffer()).parts.map((part) => ({
        ...part,
        scene: markRaw(part.scene),
      }));
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '模型预览加载失败';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>
<template>
  <section v-if="parts.length" class="remote-parts" aria-label="模型预览">
    <article v-for="part in parts" :key="part.id" class="remote-part">
      <ModelPreview :model="part.scene" :label="parts.length > 1 ? part.name : label" :compact="parts.length > 1" />
    </article>
  </section>
  <div v-else class="remote-state">
    <strong>{{ loading ? '正在加载 3MF 模型…' : error || '暂无可预览模型' }}</strong
    ><span v-if="label">{{ label }}</span>
  </div>
</template>
<style scoped>
.remote-parts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-raised);
}
.remote-parts:has(.remote-part:only-child) {
  grid-template-columns: 1fr;
  padding: 0;
}
.remote-part {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.remote-part:only-child {
  border: 0;
  border-radius: 0;
}
.remote-state {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
}
.remote-state span {
  font-family: var(--font-family-mono);
  font-size: var(--text-2xs);
}
@media (max-width: 48rem) {
  .remote-parts {
    grid-template-columns: 1fr;
  }
}
</style>
