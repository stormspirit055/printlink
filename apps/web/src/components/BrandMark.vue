<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 28 });
</script>
<template>
  <svg class="brand-mark" :width="size" :height="size" viewBox="0 0 28 28" fill="none" role="img" aria-label="印蛙">
    <rect x="1.5" y="1.5" width="25" height="25" rx="3" stroke="currentColor" stroke-width="2" />
    <rect x="6" y="12.5" width="16" height="2.4" rx="1.2" fill="currentColor" />
    <rect x="12.8" y="6" width="2.4" height="16" rx="1.2" fill="currentColor" />
  </svg>
</template>

<style scoped>
.brand-mark {
  color: var(--color-primary);
  flex: 0 0 auto;
}
</style>
