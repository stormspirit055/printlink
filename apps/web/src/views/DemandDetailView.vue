<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Check, Copy, MessageCircleMore } from 'lucide-vue-next';
import { api, type Demand } from '../api';
import { useAuth } from '../composables/useAuth';
import { feedback } from '../naive-discrete';
import { money, statusText, tagTypeFor } from '../lib/format';
import QueryState from '../components/QueryState.vue';

// Lazy-load three.js-backed preview so the 3D library only loads on demand.
const RemoteModelPreview = defineAsyncComponent(() => import('../components/RemoteModelPreview.vue'));

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { user } = useAuth();

const id = computed(() => String(route.params.id));
const isOwner = computed(() => demandQuery.data.value?.userId === user.value?.id);
const demandNumber = computed(() => `REQ-${id.value.slice(-6).toUpperCase()}`);

const demandQuery = useQuery({
  queryKey: computed(() => ['demand', id.value]),
  queryFn: () => api<Demand>(`/api/demands/${id.value}`),
  enabled: computed(() => !!id.value),
});
type ContactRequest = {
  id: string;
  status: 'PENDING' | 'APPROVED';
  createdAt: string;
  requester?: { nickname: string };
};
const requestsQuery = useQuery({
  queryKey: computed(() => ['contact-requests', id.value]),
  queryFn: () => api<ContactRequest[]>(`/api/demands/${id.value}/contact-requests`),
  enabled: computed(() => Boolean(isOwner.value)),
});
const myRequestQuery = useQuery({
  queryKey: computed(() => ['my-contact-request', id.value]),
  queryFn: () => api<ContactRequest | null>(`/api/demands/${id.value}/contact-request`),
  enabled: computed(() => Boolean(user.value && !isOwner.value)),
});

const params = computed(() => {
  const d = demandQuery.data.value;
  if (!d) return [] as readonly (readonly [string, string])[];
  return [
    ['成品尺寸', `${d.sizeX} × ${d.sizeY} × ${d.sizeZ} mm`],
    ['模型数量', `${d.quantity} 件`],
    ['实体体积', `${d.volumeCm3 || 0} cm³`],
    ['识别颜色', d.colorName],
    ['计价材料', d.materialCode],
    ['预计耗材', `${d.estimatedWeight || 0} g`],
    ['预计时长', `${d.estimatedHours || 0} 小时`],
    ['心理价位', money(d.budget)],
  ] as const;
});

async function requestContact() {
  try {
    await api(`/api/demands/${id.value}/contact-requests`, { method: 'POST', body: '{}' });
    await myRequestQuery.refetch();
    feedback.success('申请已发送，需求方同意后会通过消息通知你');
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('已经执行过') || message.includes('CONCURRENT_MODIFICATION')) {
      feedback.warning('你已经申请过该需求的联系方式');
      return;
    }
    feedback.error(message.replace(/^\[[A-Z_]+\]\s*/, '') || '操作失败，请稍后重试');
  }
}

async function approveContact(requestId: string) {
  try {
    await api(`/api/contact-requests/${requestId}/approve`, { method: 'POST', body: '{}' });
    await requestsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    feedback.success('已同意，微信号已通过消息通知发送给申请人');
  } catch (error) {
    feedback.error(error instanceof Error ? error.message : '操作失败，请稍后重试');
  }
}

async function copyDemandNumber() {
  try {
    await navigator.clipboard.writeText(demandNumber.value);
    feedback.success('订单号已复制');
  } catch {
    feedback.error('复制失败，请稍后重试');
  }
}
</script>

<template>
  <section>
    <button class="back-link" @click="router.back()"><ArrowLeft :size="16" aria-hidden="true" />返回大厅</button>
    <QueryState :query="demandQuery" empty-text="需求不存在或已关闭" skeleton="detail">
      <article v-if="demandQuery.data.value" class="panel review-detail">
        <div class="review-summary">
          <div class="summary-copy">
            <div class="summary-title">
              <h2>{{ demandQuery.data.value.title }}</h2>
              <n-tag :type="tagTypeFor(demandQuery.data.value.status)" size="small" round bordered>
                {{ statusText(demandQuery.data.value.status) }}
              </n-tag>
            </div>
            <p>{{ demandQuery.data.value.description || '无补充要求' }}</p>
          </div>
          <div class="review-actions">
            <n-button secondary @click="copyDemandNumber">
              <template #icon><Copy :size="16" aria-hidden="true" /></template>
              复制订单号
            </n-button>
            <template v-if="demandQuery.data.value.userId !== user?.id">
              <n-button v-if="!myRequestQuery.data.value" type="primary" @click="requestContact">
                <template #icon><MessageCircleMore :size="16" aria-hidden="true" /></template>申请微信联系方式
              </n-button>
              <n-tag v-else :type="myRequestQuery.data.value.status === 'APPROVED' ? 'success' : 'warning'" round>
                {{ myRequestQuery.data.value.status === 'APPROVED' ? '需求方已同意' : '等待需求方同意' }}
              </n-tag>
            </template>
          </div>
        </div>
        <div v-if="isOwner" class="contact-requests" aria-label="联系方式申请">
          <div class="contact-heading"><MessageCircleMore :size="18" aria-hidden="true" /><b>微信联系方式申请</b></div>
          <div v-if="requestsQuery.data.value?.length" class="request-list">
            <div v-for="request in requestsQuery.data.value" :key="request.id" class="request-row">
              <div>
                <b>{{ request.requester?.nickname }}</b
                ><small>{{ new Date(request.createdAt).toLocaleString('zh-CN') }}</small>
              </div>
              <n-button
                v-if="request.status === 'PENDING'"
                type="primary"
                size="small"
                @click="approveContact(request.id)"
              >
                <template #icon><Check :size="15" aria-hidden="true" /></template>同意并发送微信号
              </n-button>
              <n-tag v-else type="success" size="small" round>已同意</n-tag>
            </div>
          </div>
          <n-empty v-else description="暂无联系方式申请" size="small" />
        </div>
        <RemoteModelPreview :url="demandQuery.data.value.modelUrl" :label="demandQuery.data.value.modelName" />
        <div class="parameter-grid">
          <div v-for="x in params" :key="x[0]">
            <small>{{ x[0] }}</small>
            <b>{{ x[1] }}</b>
          </div>
        </div>
      </article>
    </QueryState>
  </section>
</template>

<style scoped>
.review-summary {
  align-items: flex-start;
  gap: var(--space-5);
}
.summary-copy {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}
.summary-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.summary-title h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-xl);
  line-height: var(--leading-tight);
}
.summary-copy p {
  max-width: 48rem;
  margin: 0;
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}
.review-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}
.contact-requests {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
}
.contact-heading,
.request-row,
.request-row > div {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  gap: var(--space-2);
}
.contact-heading {
  color: var(--color-text);
}
.request-list {
  display: grid;
  gap: var(--space-2);
}
.request-row {
  justify-content: space-between;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.request-row > div {
  display: grid;
}
.request-row small {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
@media (max-width: 40rem) {
  .request-row {
    align-items: stretch;
    flex-direction: column;
  }
}
@media (max-width: 40rem) {
  .review-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
