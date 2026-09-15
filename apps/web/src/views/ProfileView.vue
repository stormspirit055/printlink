<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Save, UserRound } from 'lucide-vue-next';
import { useAuth } from '../composables/useAuth';
import { feedback } from '../naive-discrete';

const { user, updateProfile } = useAuth();
const saving = reactive({ active: false });
const form = reactive({ nickname: '', wechatId: '', bio: '' });

watch(
  user,
  (value) => {
    if (value) Object.assign(form, { nickname: value.nickname, wechatId: value.wechatId || '', bio: value.bio || '' });
  },
  { immediate: true },
);

async function save() {
  if (form.nickname.trim().length < 2) return feedback.warning('昵称至少填写 2 个字符');
  if (!form.wechatId.trim()) return feedback.warning('请填写微信号，以便需求撮合后联系');
  saving.active = true;
  try {
    await updateProfile({ nickname: form.nickname.trim(), wechatId: form.wechatId.trim(), bio: form.bio.trim() });
    feedback.success('个人信息已保存');
  } catch (error) {
    feedback.error(error instanceof Error ? error.message : '保存失败，请稍后重试');
  } finally {
    saving.active = false;
  }
}
</script>

<template>
  <section class="profile-view">
    <div class="eyebrow">PERSONAL PROFILE</div>
    <div class="profile-title">
      <UserRound :size="22" aria-hidden="true" />
      <div>
        <h2>个人信息</h2>
        <p>微信号仅在你同意联系方式申请后发送给对应申请人。</p>
      </div>
    </div>
    <n-form class="profile-form" label-placement="top" @submit.prevent="save">
      <n-form-item label="昵称" required><n-input v-model:value="form.nickname" maxlength="30" /></n-form-item>
      <n-form-item label="微信号" required>
        <n-input v-model:value="form.wechatId" maxlength="50" placeholder="用于与接单方线下沟通" />
      </n-form-item>
      <n-form-item label="个人简介"
        ><n-input v-model:value="form.bio" type="textarea" maxlength="300" show-count
      /></n-form-item>
      <n-alert type="info">发布需求前需要填写微信号。平台不会在需求大厅公开展示你的联系方式。</n-alert>
      <n-button attr-type="submit" type="primary" :loading="saving.active">
        <template #icon><Save :size="16" aria-hidden="true" /></template>保存
      </n-button>
    </n-form>
  </section>
</template>

<style scoped>
.profile-view {
  max-width: 42rem;
}
.profile-title {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  color: var(--color-text);
}
.profile-title h2,
.profile-title p {
  margin: 0;
}
.profile-title h2 {
  font-size: var(--text-xl);
}
.profile-title p {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.profile-form {
  display: grid;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.profile-form .n-button {
  justify-self: start;
  margin-top: var(--space-5);
}
@media (max-width: 40rem) {
  .profile-form {
    padding: var(--space-4);
  }
}
</style>
