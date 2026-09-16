<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  Boxes,
  Calculator,
  FileText,
  House,
  LogOut,
  Moon,
  Palette,
  Sun,
  Ticket,
  UserRound,
} from 'lucide-vue-next';
import { api, type Demand, type InvitationCode } from '../api';
import type { AdminConfig } from '../admin/types';
import { useAuth } from '../composables/useAuth';
import { useTheme } from '../hooks/use-theme';
import { avatarUrlFor, FALLBACK_AVATAR } from '../composables/useAvatar';
import { feedback } from '../naive-discrete';
import { money } from '../lib/format';
import BrandMark from '../components/BrandMark.vue';
import QueryState from '../components/QueryState.vue';

type Review = Demand & { modelUrl?: string | null };
type ConfigItem = {
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  pricePerGram?: number;
  value?: number;
  multiplier?: number;
};

const RemoteModelPreview = defineAsyncComponent(() => import('../components/RemoteModelPreview.vue'));

const router = useRouter();
const queryClient = useQueryClient();
const { user, logout } = useAuth();
const { theme, toggle } = useTheme();

const section = ref<'reviews' | 'materials' | 'rules' | 'colors' | 'invitations'>('reviews');
const adminDetail = ref<Review | null>(null);
const rejectShow = ref(false);
const rejectReason = ref('');
const inviteModalShow = ref(false);
const newMaxUses = ref(10);
const newExpiresAt = ref<number | null>(null);
const creating = ref(false);

const avatarSrc = computed(() => avatarUrlFor(user.value));
const maskedPhone = computed(() => {
  const phone = user.value?.phone;
  return phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : '';
});

async function onLogout() {
  await logout();
  await router.push('/login');
}

const reviewsQuery = useQuery({
  queryKey: ['admin-reviews'],
  queryFn: () => api<Review[]>('/api/admin/reviews'),
  enabled: computed(() => !!user.value?.isAdmin),
});
const adminConfigQuery = useQuery({
  queryKey: ['admin-config'],
  queryFn: () => api<AdminConfig>('/api/admin/config'),
  enabled: computed(() => !!user.value?.isAdmin),
});
const invitationsQuery = useQuery({
  queryKey: ['admin-invitations'],
  queryFn: () => api<InvitationCode[]>('/api/admin/invitations'),
  enabled: computed(() => !!user.value?.isAdmin),
});

const configItems = computed<ConfigItem[]>(() => {
  const cfg = adminConfigQuery.data.value;
  if (!cfg) return [];
  if (section.value === 'materials') return cfg.materials;
  if (section.value === 'rules') return cfg.rules;
  return cfg.colors;
});

const navItems = [
  { k: 'reviews', l: '需求审核', icon: FileText },
  { k: 'materials', l: '材料配置', icon: Boxes },
  { k: 'rules', l: '计价规则', icon: Calculator },
  { k: 'colors', l: '颜色配置', icon: Palette },
  { k: 'invitations', l: '邀请码管理', icon: Ticket },
] as const;

const configUnit = computed(() => {
  if (section.value === 'materials') return '元/克';
  if (section.value === 'colors') return '×';
  return '';
});

const detailParams = computed(() => {
  const r = adminDetail.value;
  if (!r) return [] as readonly (readonly [string, string])[];
  return [
    ['成品尺寸', `${r.sizeX} × ${r.sizeY} × ${r.sizeZ} mm`],
    ['模型数量', `${r.quantity} 件`],
    ['实体体积', `${r.volumeCm3 || 0} cm³`],
    ['识别颜色', r.colorName],
    ['计价材料', r.materialCode],
    ['预计耗材', `${r.estimatedWeight || 0} g`],
    ['预计时长', `${r.estimatedHours || 0} 小时`],
    ['平台参考价', money(r.budget)],
  ] as const;
});

function selectSection(k: typeof section.value) {
  section.value = k;
  adminDetail.value = null;
}

function startReject() {
  rejectReason.value = '';
  rejectShow.value = true;
}

async function doReview(action: 'approve' | 'reject', reason: string) {
  const target = adminDetail.value;
  if (!target) return;
  try {
    await api(`/api/demands/${target.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
    adminDetail.value = null;
    await queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    feedback.success(action === 'approve' ? '已通过该需求' : '已驳回该需求');
  } catch (e) {
    feedback.error(e instanceof Error ? e.message : '操作失败');
  }
}

function approve() {
  feedback.confirm({
    title: '确认通过需求？',
    content: '通过后该需求将进入公开大厅，打印方可以响应。',
    type: 'success',
    positiveText: '确认通过',
    onPositiveClick: () => doReview('approve', ''),
  });
}
function confirmReject() {
  rejectShow.value = false;
  void doReview('reject', rejectReason.value.trim());
}

type InviteStatus = 'active' | 'disabled' | 'expired' | 'exhausted';

function inviteStatus(inv: InvitationCode): InviteStatus {
  if (inv.disabled) return 'disabled';
  if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) return 'expired';
  if (inv.usedCount >= inv.maxUses) return 'exhausted';
  return 'active';
}

function inviteTagType(inv: InvitationCode): 'success' | 'default' | 'warning' | 'error' {
  const status = inviteStatus(inv);
  if (status === 'active') return 'success';
  if (status === 'expired') return 'warning';
  if (status === 'exhausted') return 'error';
  return 'default';
}

function inviteTagText(inv: InvitationCode): string {
  const status = inviteStatus(inv);
  if (status === 'active') return '可用';
  if (status === 'disabled') return '已停用';
  if (status === 'expired') return '已过期';
  return '已用尽';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN');
}

function openInviteModal() {
  newMaxUses.value = 10;
  newExpiresAt.value = null;
  inviteModalShow.value = true;
}

async function createInvite() {
  creating.value = true;
  try {
    const r = await api<InvitationCode>('/api/admin/invitations', {
      method: 'POST',
      body: JSON.stringify({
        maxUses: newMaxUses.value,
        expiresAt: newExpiresAt.value ? new Date(newExpiresAt.value).toISOString() : undefined,
      }),
    });
    await queryClient.invalidateQueries({ queryKey: ['admin-invitations'] });
    inviteModalShow.value = false;
    feedback.success(`邀请码已生成：${r.code}`);
  } catch (e) {
    feedback.error(e instanceof Error ? e.message : '生成失败');
  } finally {
    creating.value = false;
  }
}

async function doDisable(inv: InvitationCode) {
  try {
    await api(`/api/admin/invitations/${inv.id}/disable`, { method: 'POST', body: '{}' });
    await queryClient.invalidateQueries({ queryKey: ['admin-invitations'] });
    feedback.success('已停用该邀请码');
  } catch (e) {
    feedback.error(e instanceof Error ? e.message : '操作失败');
  }
}

function disableInvite(inv: InvitationCode) {
  feedback.confirm({
    title: '确认停用邀请码？',
    content: `邀请码 ${inv.code} 停用后将无法继续用于注册。`,
    type: 'warning',
    positiveText: '确认停用',
    onPositiveClick: () => doDisable(inv),
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="admin-header">
      <div class="brand">
        <BrandMark /><span>印蛙<small>ADMINISTRATION</small></span>
      </div>
      <span class="admin-badge">ADMIN PLATFORM</span>
      <div class="header-actions">
        <n-button quaternary circle :title="theme === 'dark' ? '切换浅色' : '切换深色'" @click="toggle">
          <template #icon>
            <Sun v-if="theme === 'dark'" :size="16" aria-hidden="true" />
            <Moon v-else :size="16" aria-hidden="true" />
          </template>
        </n-button>
        <n-popover trigger="click" placement="bottom-end" :width="280">
          <template #trigger>
            <button class="avatar-trigger" aria-label="账户菜单">
              <n-avatar round :src="avatarSrc || FALLBACK_AVATAR">{{ user?.nickname?.[0] }}</n-avatar>
            </button>
          </template>
          <div class="profile-pop">
            <div class="profile-head">
              <n-avatar round :size="44" :src="avatarSrc || FALLBACK_AVATAR">{{ user?.nickname?.[0] }}</n-avatar>
              <div>
                <b>{{ user?.nickname }}</b>
                <span>平台管理员</span>
                <small>{{ maskedPhone }}</small>
              </div>
            </div>
            <div class="account-actions">
              <n-button quaternary block @click="router.push('/')">
                <template #icon><House :size="16" aria-hidden="true" /></template>用户平台
              </n-button>
              <n-button quaternary block @click="router.push({ name: 'profile' })">
                <template #icon><UserRound :size="16" aria-hidden="true" /></template>个人信息
              </n-button>
            </div>
            <div class="account-actions account-actions-danger">
              <n-button quaternary block class="logout-btn" @click="onLogout">
                <template #icon><LogOut :size="16" aria-hidden="true" /></template>退出登录
              </n-button>
            </div>
          </div>
        </n-popover>
      </div>
    </header>
    <div class="admin-layout">
      <aside class="admin-nav">
        <button
          v-for="item in navItems"
          :key="item.k"
          :class="{ active: section === item.k }"
          @click="selectSection(item.k)"
        >
          <span class="admin-nav-label"> <component :is="item.icon" :size="16" aria-hidden="true" />{{ item.l }} </span>
          <span v-if="item.k === 'reviews'" class="admin-nav-count">{{ reviewsQuery.data.value?.length || 0 }}</span>
        </button>
      </aside>
      <main class="admin-content">
        <template v-if="section === 'reviews'">
          <button v-if="adminDetail" class="back-link" @click="adminDetail = null">
            <ArrowLeft :size="16" aria-hidden="true" />返回审核列表
          </button>
          <div v-if="!adminDetail">
            <QueryState :query="reviewsQuery" empty-text="暂无待审核需求" skeleton="list">
              <div class="review-list">
                <article
                  v-for="r in reviewsQuery.data.value || []"
                  :key="r.id"
                  class="review-card"
                  tabindex="0"
                  @click="adminDetail = r"
                  @keydown.enter="adminDetail = r"
                >
                  <div>
                    <small>REQ-{{ r.id.slice(-6).toUpperCase() }} · {{ r.nickname }}</small>
                    <h3>{{ r.title }}</h3>
                    <p>{{ r.description || '无补充要求' }}</p>
                    <div class="specs">
                      <span>{{ r.materialCode }}</span>
                      <span>{{ r.colorName }}</span>
                      <span>{{ money(r.budget) }}</span>
                    </div>
                  </div>
                  <b>›</b>
                </article>
              </div>
            </QueryState>
          </div>
          <article v-else class="panel review-detail">
            <div class="review-summary">
              <div>
                <small>REQ-{{ adminDetail.id.slice(-6).toUpperCase() }} · {{ adminDetail.nickname }}</small>
                <h2>{{ adminDetail.title }}</h2>
                <p>{{ adminDetail.description || '无补充要求' }}</p>
              </div>
              <div class="review-actions">
                <n-button @click="startReject">驳回</n-button>
                <n-button type="primary" @click="approve">通过</n-button>
              </div>
            </div>
            <RemoteModelPreview :url="adminDetail.modelUrl" :label="adminDetail.modelName" />
            <div class="parameter-grid">
              <div v-for="x in detailParams" :key="x[0]">
                <small>{{ x[0] }}</small>
                <b>{{ x[1] }}</b>
              </div>
            </div>
          </article>
        </template>

        <template v-else-if="section === 'invitations'">
          <div class="section-head">
            <h2>邀请码管理</h2>
            <n-button type="primary" @click="openInviteModal">
              <template #icon><Ticket :size="16" aria-hidden="true" /></template>生成邀请码
            </n-button>
          </div>
          <QueryState :query="invitationsQuery" empty-text="暂无邀请码" skeleton="list">
            <div class="invite-grid">
              <article v-for="inv in invitationsQuery.data.value || []" :key="inv.id" class="panel invite-card">
                <div class="invite-head">
                  <code class="invite-code">{{ inv.code }}</code>
                  <n-tag :type="inviteTagType(inv)" size="small" round>{{ inviteTagText(inv) }}</n-tag>
                </div>
                <dl class="invite-meta">
                  <div>
                    <small>使用次数</small><b>{{ inv.usedCount }} / {{ inv.maxUses }}</b>
                  </div>
                  <div>
                    <small>创建人</small><b>{{ inv.createdBy?.nickname ?? '-' }}</b>
                  </div>
                  <div>
                    <small>创建时间</small><b>{{ formatTime(inv.createdAt) }}</b>
                  </div>
                  <div>
                    <small>过期时间</small><b>{{ inv.expiresAt ? formatTime(inv.expiresAt) : '永久' }}</b>
                  </div>
                </dl>
                <div v-if="inviteStatus(inv) === 'active'" class="invite-actions">
                  <n-button size="small" @click="disableInvite(inv)">停用</n-button>
                </div>
              </article>
            </div>
          </QueryState>
        </template>

        <div v-else class="config-grid">
          <article v-for="item in configItems" :key="item.id || item.key" class="panel config-card">
            <span class="config-label">{{ item.name || item.label || item.key }}</span>
            <b class="config-value">
              {{ item.pricePerGram ?? item.value ?? item.multiplier }}<small v-if="configUnit">{{ configUnit }}</small>
            </b>
          </article>
        </div>
      </main>
    </div>

    <n-modal v-model:show="rejectShow" preset="card" title="确认驳回需求" class="reject-modal">
      <n-input
        v-model:value="rejectReason"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-count
        placeholder="驳回原因（将通知需求方修改后重新提交）"
      />
      <template #footer>
        <div class="modal-actions">
          <n-button @click="rejectShow = false">取消</n-button>
          <n-button type="error" @click="confirmReject">确认驳回</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal v-model:show="inviteModalShow" preset="card" title="生成邀请码" class="invite-modal">
      <n-form label-placement="top">
        <n-form-item label="可邀请次数">
          <n-input-number v-model:value="newMaxUses" :min="1" :max="1000" />
        </n-form-item>
        <n-form-item label="过期时间（可选）">
          <n-date-picker v-model:value="newExpiresAt" type="datetime" clearable />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-actions">
          <n-button @click="inviteModalShow = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="createInvite">生成</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.reject-modal {
  width: min(460px, 94vw);
}
.invite-modal {
  width: min(420px, 94vw);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.section-head h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}
.invite-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}
.invite-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}
.invite-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.invite-code {
  font-family: var(--font-family-mono);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  letter-spacing: 1px;
  color: var(--color-primary);
}
.invite-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin: 0;
}
.invite-meta div {
  display: grid;
  gap: 2px;
}
.invite-meta small {
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}
.invite-meta b {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.invite-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
