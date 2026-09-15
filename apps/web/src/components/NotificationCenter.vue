<script setup lang="ts">
import { computed, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useDialog } from 'naive-ui';
import { api } from '../api';
import { Bell } from 'lucide-vue-next';
type Notice = {
  id: string;
  demandId: string | null;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};
const dialog = useDialog();
const emit = defineEmits<{ viewAll: [] }>();
const qc = useQueryClient();
const query = useQuery({
  queryKey: ['notifications', 'popover'],
  queryFn: () => api<{ items: Notice[]; unreadCount: number }>('/api/notifications?page=1&limit=20'),
  refetchInterval: 15000,
});
const unread = computed(() => query.data.value?.unreadCount || 0);
/** 点击消息在弹层内展示详情；未读自动标记已读，不跳转业务页面。 */
function open(item: Notice) {
  if (!item.readAt) {
    void api(`/api/notifications/${item.id}/read`, { method: 'POST', body: '{}' })
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => undefined);
  }
  dialog.info({
    title: item.title,
    content: `${item.body}\n\n${new Date(item.createdAt).toLocaleString('zh-CN')}`,
    positiveText: '知道了',
  });
}
async function all() {
  await api('/api/notifications/read-all', { method: 'POST', body: '{}' });
  await qc.invalidateQueries({ queryKey: ['notifications'] });
}
// Refetch the whole list page when new notifications arrive via SSE.
watch(
  () => query.data.value?.unreadCount,
  () => void qc.invalidateQueries({ queryKey: ['notifications', 'list'] }),
);
</script>
<template>
  <n-popover trigger="click" placement="bottom-end" :width="360"
    ><template #trigger
      ><n-badge :value="unread" :max="99"
        ><n-button quaternary circle title="消息通知"
          ><template #icon><Bell :size="17" aria-hidden="true" /></template> </n-button></n-badge
    ></template>
    <div class="notice-head">
      <strong>消息通知</strong>
      <div class="notice-head-actions">
        <n-button text type="primary" @click="all">全部已读</n-button>
        <n-button text type="primary" @click="emit('viewAll')">查看全部</n-button>
      </div>
    </div>
    <div class="notice-list">
      <button
        v-for="item in query.data.value?.items || []"
        :key="item.id"
        class="notice-item"
        :class="{ unread: !item.readAt }"
        @click="open(item)"
      >
        <b>{{ item.title }}</b
        ><span>{{ item.body }}</span
        ><small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small>
      </button>
      <div v-if="!query.data.value?.items.length" class="notice-empty">暂无消息通知</div>
    </div></n-popover
  >
</template>
<style scoped>
.notice-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}
.notice-head-actions {
  display: flex;
  gap: var(--space-2);
}
.notice-list {
  max-height: 420px;
  overflow: auto;
}
.notice-item {
  position: relative;
  display: grid;
  width: 100%;
  gap: 5px;
  padding: 12px 10px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  text-align: left;
}
.notice-item:hover {
  background: var(--color-surface-raised);
}
.notice-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.notice-item.unread:before {
  content: '';
  position: absolute;
  left: 0;
  top: 18px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary);
}
.notice-item span,
.notice-item small {
  color: var(--color-text-muted);
}
.notice-item small {
  font-size: var(--text-3xs);
}
.notice-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-muted);
}
</style>
