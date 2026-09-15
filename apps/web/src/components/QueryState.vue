<script setup lang="ts">
import { computed } from 'vue';
import type { UseQueryResult } from '@tanstack/vue-query';

type AnyQuery = Pick<UseQueryResult, 'isLoading' | 'isError' | 'data'> & { refetch?: () => unknown };
type SkeletonVariant = 'cards' | 'list' | 'detail';

const props = defineProps<{
  query: AnyQuery;
  emptyText?: string;
  /** When true, an empty list renders the default slot instead of the empty state (for inline tables). */
  bare?: boolean;
  /** Content-shaped loading placeholder. Omit to fall back to a centered spinner. */
  skeleton?: SkeletonVariant;
}>();

defineEmits<{ retry: [] }>();

const status = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (props.query.isLoading.value) return 'loading';
  if (props.query.isError.value) return 'error';
  const data = props.query.data.value;
  if (Array.isArray(data) ? data.length === 0 : !data) return 'empty';
  return 'ready';
});
</script>

<template>
  <!-- Content-shaped skeletons mirror each layout so loading never jumps. -->
  <div v-if="status === 'loading' && skeleton === 'cards'" class="skeleton-grid">
    <div v-for="i in 6" :key="i" class="skeleton-card panel">
      <n-skeleton height="170px" :sharp="false" />
      <div class="skeleton-body">
        <n-skeleton text :repeat="2" />
        <n-skeleton text width="60%" />
      </div>
    </div>
  </div>
  <div v-else-if="status === 'loading' && skeleton === 'list'" class="skeleton-list">
    <div v-for="i in 5" :key="i" class="skeleton-row panel">
      <n-skeleton circle />
      <div class="skeleton-row-body">
        <n-skeleton text width="40%" />
        <n-skeleton text width="80%" />
      </div>
      <n-skeleton text width="24px" />
    </div>
  </div>
  <div v-else-if="status === 'loading' && skeleton === 'detail'" class="skeleton-detail">
    <n-skeleton text width="50%" />
    <n-skeleton text :repeat="3" />
    <n-skeleton height="280px" :sharp="false" />
    <div class="skeleton-detail-grid">
      <n-skeleton v-for="i in 8" :key="i" height="56px" :sharp="false" />
    </div>
  </div>
  <div v-else-if="status === 'loading'" class="query-state">
    <n-spin size="large" />
  </div>
  <div v-else-if="status === 'error'" class="query-state query-error">
    <n-empty description="加载失败，请重试">
      <template #extra>
        <n-button size="small" @click="query.refetch?.()">重试</n-button>
      </template>
    </n-empty>
  </div>
  <div v-else-if="status === 'empty' && !bare" class="query-state query-empty">
    <n-empty :description="emptyText || '暂无数据'" />
  </div>
  <slot v-else />
</template>

<style scoped>
.query-state {
  display: grid;
  place-items: center;
  padding: var(--space-16) var(--space-5);
  min-height: 200px;
  text-align: center;
}
.query-error,
.query-empty {
  color: var(--color-text-muted);
}

/* Card skeleton mirrors the demand / printer grid. */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  width: 100%;
}
.skeleton-card {
  overflow: hidden;
  padding: 0;
}
.skeleton-body {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
}

/* Row skeleton for lists (orders, reviews). */
.skeleton-list {
  display: grid;
  gap: var(--space-3);
  width: 100%;
}
.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
}
.skeleton-row-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--space-2);
}

/* Detail skeleton. */
.skeleton-detail {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) 0;
}
.skeleton-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-top: var(--space-3);
}

@media (max-width: 900px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .skeleton-detail-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .skeleton-grid {
    grid-template-columns: 1fr;
  }
  .skeleton-detail-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
