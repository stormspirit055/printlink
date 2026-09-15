<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { Box, Search } from 'lucide-vue-next';
import { api, type Demand } from '../api';
import { useAuth } from '../composables/useAuth';
import { money, statusText, tagTypeFor } from '../lib/format';
import QueryState from '../components/QueryState.vue';

const router = useRouter();
const { user } = useAuth();
const search = ref('');

const demandsQuery = useQuery({
  queryKey: ['demands'],
  queryFn: () => api<Demand[]>('/api/demands'),
  enabled: computed(() => !!user.value),
});

const demands = computed(() =>
  (demandsQuery.data.value || []).filter((d) =>
    [d.title, d.description, d.materialCode, d.colorName, d.nickname]
      .join(' ')
      .toLowerCase()
      .includes(search.value.trim().toLowerCase()),
  ),
);

const date = (s?: string) => (s ? new Date(s).toLocaleDateString('zh-CN') : '-');
function open(id: string) {
  void router.push({ name: 'demand-detail', params: { id } });
}
</script>

<template>
  <section>
    <div class="eyebrow">PUBLIC JOB BOARD / 实时更新</div>
    <n-input v-model:value="search" size="large" placeholder="搜索需求或材料" clearable class="search-box">
      <template #prefix><Search :size="16" aria-hidden="true" /></template>
    </n-input>
    <QueryState :query="demandsQuery" empty-text="暂无开放需求" skeleton="cards">
      <div class="demand-grid">
        <article
          v-for="d in demands"
          :key="d.id"
          class="demand-card panel"
          tabindex="0"
          @click="open(d.id)"
          @keydown.enter="open(d.id)"
        >
          <div class="demand-visual">
            <n-tag class="demand-status" :type="tagTypeFor(d.status)" size="small" round bordered>{{
              statusText(d.status)
            }}</n-tag>
            <Box :size="56" :stroke-width="1.2" class="cube" aria-hidden="true" />
            <small>{{ d.modelName || '3MF MODEL' }}</small>
          </div>
          <div class="demand-body">
            <div class="meta-line">
              <small>REQ-{{ d.id.slice(-6).toUpperCase() }}</small>
              <small>{{ date(d.createdAt) }}</small>
            </div>
            <h3>{{ d.title }}</h3>
            <p>{{ d.description || '无补充要求' }}</p>
            <div class="specs">
              <span>{{ d.materialCode }}</span>
              <span>{{ d.colorName }}</span>
              <span>{{ d.sizeX }}×{{ d.sizeY }}×{{ d.sizeZ }} mm</span>
            </div>
            <div class="demand-foot">
              <b>{{ money(d.budget) }}</b>
              <small>{{ d.acceptCount || 0 }} 个响应 ›</small>
            </div>
          </div>
        </article>
        <n-empty v-if="!demands.length" description="没有匹配的需求" class="demand-empty" />
      </div>
    </QueryState>
  </section>
</template>

<style scoped>
.demand-status {
  position: absolute;
  left: var(--space-3);
  top: var(--space-3);
}
.demand-empty {
  grid-column: 1 / -1;
  padding: var(--space-16) var(--space-5);
}
</style>
