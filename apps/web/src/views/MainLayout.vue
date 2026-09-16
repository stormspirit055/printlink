<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQueryClient } from '@tanstack/vue-query';
import { useDialog } from 'naive-ui';
import { LogOut, Moon, Plus, ShieldCheck, Sun, UserRound } from 'lucide-vue-next';
import { useAuth } from '../composables/useAuth';
import { useTheme } from '../hooks/use-theme';
import { avatarUrlFor, FALLBACK_AVATAR } from '../composables/useAvatar';
import { useRealtime } from '../hooks/use-realtime';
import BrandMark from '../components/BrandMark.vue';
import NotificationCenter from '../components/NotificationCenter.vue';
// Lazy-load: PublishDemandModal pulls in 3MF parsing + three.js.
const PublishDemandModal = defineAsyncComponent(() => import('../components/PublishDemandModal.vue'));

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const dialog = useDialog();
const { user, logout } = useAuth();
const { theme, toggle } = useTheme();

// SSE keeps system notifications and related business data fresh while signed in.
useRealtime(() => !!user.value);

const showPublish = ref(false);
const navItems = [
  { k: 'hall', l: '需求大厅' },
  { k: 'workspace', l: '工作台' },
  { k: 'printers', l: '打印设备' },
  { k: 'notifications', l: '消息通知' },
] as const;

const avatarSrc = computed(() => avatarUrlFor(user.value));
const maskedPhone = computed(() => {
  const phone = user.value?.phone;
  return phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : '';
});

function openPublish() {
  if (!user.value?.wechatId) {
    dialog.info({
      title: '需要先填写微信号',
      content: '微信号用于需求通过审核后与打印方建立联系。是否现在前往个人信息填写？',
      positiveText: '去填写',
      negativeText: '暂不填写',
      onPositiveClick: () => router.push({ name: 'profile' }),
    });
    return;
  }
  showPublish.value = true;
}

async function onLogout() {
  await logout();
  await router.push('/login');
}
function onSubmitted() {
  void queryClient.invalidateQueries({ queryKey: ['demands'] });
  void queryClient.invalidateQueries({ queryKey: ['my-demands'] });
}
</script>

<template>
  <div class="app-shell">
    <header class="user-header">
      <button class="brand brand-button" @click="router.push('/')">
        <BrandMark /><span>印蛙<small>PRINTLINK</small></span>
      </button>
      <nav>
        <button
          v-for="item in navItems"
          :key="item.k"
          :class="{ active: route.name === item.k }"
          @click="router.push({ name: item.k })"
        >
          {{ item.l }}
        </button>
      </nav>
      <div class="header-actions">
        <n-button type="primary" @click="openPublish">
          <template #icon><Plus :size="16" aria-hidden="true" /></template>发布需求
        </n-button>
        <n-button quaternary circle :title="theme === 'dark' ? '切换浅色' : '切换深色'" @click="toggle">
          <template #icon>
            <Sun v-if="theme === 'dark'" :size="16" aria-hidden="true" />
            <Moon v-else :size="16" aria-hidden="true" />
          </template>
        </n-button>
        <NotificationCenter @view-all="router.push({ name: 'notifications' })" />
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
                <span>{{ user?.isAdmin ? '平台管理员' : '平台用户' }}</span>
                <small>{{ maskedPhone }}</small>
              </div>
            </div>
            <div class="account-actions">
              <n-button v-if="user?.isAdmin" quaternary block @click="router.push('/admin')">
                <template #icon><ShieldCheck :size="16" aria-hidden="true" /></template>管理员平台
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
    <main class="main-content">
      <router-view />
    </main>
    <n-button class="publish-fab" type="primary" size="large" circle aria-label="发布需求" @click="openPublish">
      <template #icon><Plus :size="22" aria-hidden="true" /></template>
    </n-button>
    <PublishDemandModal v-model:show="showPublish" @submitted="onSubmitted" />
  </div>
</template>
