<script setup lang="ts">
import { computed, h } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { NTag, type DataTableColumns } from 'naive-ui';
import { PackageOpen } from 'lucide-vue-next';
import { api, type Demand } from '../api';
import { useAuth } from '../composables/useAuth';
import { money, statusText, tagTypeFor } from '../lib/format';
import QueryState from '../components/QueryState.vue';

const router = useRouter();
const { user } = useAuth();

const mineQuery = useQuery({
  queryKey: ['my-demands'],
  queryFn: () => api<Demand[]>('/api/demands?mine=1'),
  enabled: computed(() => !!user.value),
});
const date = (s?: string) => (s ? new Date(s).toLocaleDateString('zh-CN') : '-');

const columns: DataTableColumns<Demand> = [
  { title: '需求编号', key: 'id', render: (row) => `REQ-${row.id.slice(-6).toUpperCase()}` },
  { title: '标题', key: 'title' },
  {
    title: '状态',
    key: 'status',
    render: (row) =>
      h(
        NTag,
        { type: tagTypeFor(row.status), size: 'small', round: true, bordered: true },
        { default: () => statusText(row.status) },
      ),
  },
  { title: '预算', key: 'budget', render: (row) => money(row.budget) },
  { title: '接单意向', key: 'acceptCount', render: (row) => String(row.acceptCount || 0) },
  {
    title: '预算偏低',
    key: 'raiseCount',
    render: (row) =>
      h(
        NTag,
        { type: row.raiseCount ? 'warning' : 'default', size: 'small', round: true, bordered: true },
        { default: () => String(row.raiseCount || 0) },
      ),
  },
  { title: '发布时间', key: 'createdAt', render: (row) => date(row.createdAt) },
];

const rowProps = (row: Demand) => ({
  style: 'cursor: pointer',
  onClick: () => void router.push({ name: 'demand-detail', params: { id: row.id } }),
});
</script>

<template>
  <section>
    <div class="stats">
      <div class="stat-card panel">
        <span class="stat-icon"><PackageOpen :size="22" aria-hidden="true" /></span>
        <n-statistic label="发布需求" tabular-nums>
          <n-number-animation :from="0" :to="mineQuery.data.value?.length || 0" />
        </n-statistic>
      </div>
    </div>
    <div class="eyebrow">我的需求</div>
    <QueryState :query="mineQuery" empty-text="还没有发布需求" skeleton="list">
      <n-data-table
        :columns="columns"
        :data="mineQuery.data.value || []"
        :row-props="rowProps"
        :bordered="false"
        size="large"
      />
    </QueryState>
  </section>
</template>
