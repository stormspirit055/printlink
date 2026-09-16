<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query';
import { useMessage, NPagination, useDialog } from 'naive-ui';
import { CheckCheck, Bell } from 'lucide-vue-next';
import { api, fetchNotifications, type AppNotification } from '../api';
import QueryState from '../components/QueryState.vue';

const message = useMessage();
const dialog = useDialog();
const qc = useQueryClient();

const page = ref(1);
const limit = 10;
const unreadOnly = ref(false);

const query = useQuery({
  queryKey: computed(() => ['notifications', 'list', { page: page.value, limit }]),
  queryFn: () => fetchNotifications({ page: page.value, limit }),
  placeholderData: keepPreviousData,
});

const rows = computed(() => {
  const items = query.data.value?.items ?? [];
  return unreadOnly.value ? items.filter((item) => !item.readAt) : items;
});
const itemCount = computed(() => {
  const total = query.data.value?.total ?? 0;
  if (!unreadOnly.value) return total;
  // Unread filter happens client-side over the current page; show per-page count.
  return rows.value.length;
});
const pagination = computed(() => ({
  page: page.value,
  pageSize: limit,
  itemCount: itemCount.value,
  showSizePicker: false,
  onChange: (target: number) => {
    page.value = target;
  },
  prefix: ({ itemCount: count }: { itemCount: number | undefined }) => (count ? `共 ${count} 条` : ''),
}));

const dateTime = (s: string) => new Date(s).toLocaleString('zh-CN');

const marking = ref(false);
/** 打开单条消息详情弹层：未读自动标记已读，不跳转业务页面。 */
function open(item: AppNotification) {
  if (!item.readAt) {
    void api(`/api/notifications/${item.id}/read`, { method: 'POST', body: '{}' })
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : '操作失败'));
  }
  dialog.info({
    title: item.title,
    content: `${item.body}\n\n${new Date(item.createdAt).toLocaleString('zh-CN')}`,
    positiveText: '知道了',
  });
}

async function readAll() {
  marking.value = true;
  try {
    await api('/api/notifications/read-all', { method: 'POST', body: '{}' });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
    message.success('已全部标记为已读');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '操作失败');
  } finally {
    marking.value = false;
  }
}

function rowProps(row: AppNotification) {
  return {
    style: 'cursor: pointer',
    onClick: () => open(row),
  };
}

const columns = [
  { title: '标题', key: 'title', ellipsis: { tooltip: true } },
  { title: '内容', key: 'body', ellipsis: { tooltip: true } },
  { title: '时间', key: 'createdAt', width: 180, render: (row: AppNotification) => dateTime(row.createdAt) },
  {
    title: '状态',
    key: 'readAt',
    width: 90,
    render: (row: AppNotification) => (row.readAt ? '已读' : h('span', { class: 'unread-cell' }, '未读')),
  },
] as const;
</script>

<template>
  <section class="notifications-view">
    <div class="page-head">
      <div class="page-title">
        <Bell :size="22" aria-hidden="true" />
        <div>
          <h2>消息通知</h2>
        </div>
      </div>
      <div class="page-actions">
        <n-checkbox v-model:checked="unreadOnly">只看未读</n-checkbox>
        <n-button secondary :loading="marking" :disabled="!query.data.value?.unreadCount" @click="readAll">
          <template #icon><CheckCheck :size="16" aria-hidden="true" /></template>
          全部已读{{ query.data.value?.unreadCount ? `（${query.data.value.unreadCount}）` : '' }}
        </n-button>
      </div>
    </div>
    <div class="panel table-wrap">
      <QueryState :query="query" :bare="unreadOnly" empty-text="暂无消息通知" skeleton="list">
        <n-data-table :columns="columns" :data="rows" :row-props="rowProps" :bordered="false" size="large" />
        <div class="table-footer">
          <n-pagination v-bind="pagination" />
        </div>
      </QueryState>
    </div>
  </section>
</template>

<style scoped>
.notifications-view {
  display: grid;
  gap: var(--space-5);
}
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}
.page-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.page-title h2 {
  margin: 0;
}
.page-title p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.page-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.table-wrap {
  padding: var(--space-2) var(--space-4) var(--space-4);
}
.table-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-4);
}
.unread-cell {
  color: var(--color-primary);
  font-weight: var(--weight-medium);
}
</style>
