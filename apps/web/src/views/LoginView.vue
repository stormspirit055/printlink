<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ShieldCheck, UserRound, Send } from 'lucide-vue-next';
import { useAuth } from '../composables/useAuth';
import BrandMark from '../components/BrandMark.vue';

const router = useRouter();
const auth = useAuth();

const phone = ref('');
const code = ref('');
const inviteCode = ref('');
const sendingCode = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | undefined;
const loginSubmitted = ref(false);
const loginError = ref('');
const demoAccounts = [
  { role: '平台管理员', phone: '13800000000', code: '000000', icon: ShieldCheck },
  { role: '平台用户 A', phone: '13900000001', code: '000000', icon: UserRound },
  { role: '平台用户 B', phone: '13900000002', code: '000000', icon: UserRound },
] as const;

const loginErrors = computed(() => ({
  phone: loginSubmitted.value && !/^1\d{10}$/.test(phone.value.trim()) ? '请输入有效的 11 位手机号' : '',
  code: loginSubmitted.value && !/^\d{6}$/.test(code.value.trim()) ? '请输入 6 位数字验证码' : '',
}));

async function sendCode() {
  if (!/^1\d{10}$/.test(phone.value.trim()) || sendingCode.value) return;
  sendingCode.value = true;
  try {
    const result = await auth.requestCode(phone.value.trim());
    loginError.value = result.devCode ? `开发环境验证码：${result.devCode}` : '';
    countdown.value = 60;
    countdownTimer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0 && countdownTimer) clearInterval(countdownTimer);
    }, 1000);
  } catch (e) {
    loginError.value = e instanceof Error ? e.message : '验证码发送失败';
  } finally {
    sendingCode.value = false;
  }
}

async function login() {
  loginSubmitted.value = true;
  loginError.value = '';
  if (Object.values(loginErrors.value).some(Boolean)) return;
  try {
    // Only send inviteCode when filled: the backend requires it for first-time
    // logins (new phone) and ignores it for returning users. Sending an empty
    // string would fail the route's min(4) validation.
    const trimmedInvite = inviteCode.value.trim();
    await auth.login({
      phone: phone.value.trim(),
      code: code.value.trim(),
      ...(trimmedInvite ? { inviteCode: trimmedInvite } : {}),
    });
    await router.push('/');
  } catch (e) {
    loginError.value = e instanceof Error ? e.message : '登录失败';
  }
}

function useDemoAccount(account: (typeof demoAccounts)[number]) {
  phone.value = account.phone;
  code.value = account.code;
  inviteCode.value = '';
  loginSubmitted.value = false;
  loginError.value = '';
}
</script>

<template>
  <main class="login-page app-shell">
    <section class="login-brand">
      <div class="brand">
        <BrandMark /><span>印蛙<small>PRINTLINK</small></span>
      </div>
      <h1>3D <span>打印</span></h1>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="brand mobile-brand">
          <BrandMark /><span>印蛙<small>PRINTLINK</small></span>
        </div>
        <div>
          <h2>登录</h2>
          <p class="muted">首次登录需填写邀请码。</p>
        </div>
        <n-form class="login-form" label-placement="top" novalidate @submit.prevent="login">
          <n-form-item
            label="手机号"
            :feedback="loginErrors.phone"
            :validation-status="loginErrors.phone ? 'error' : undefined"
          >
            <n-input size="large" v-model:value="phone" maxlength="11" placeholder="11 位手机号" autocomplete="tel" />
          </n-form-item>
          <n-form-item
            label="验证码"
            :feedback="loginErrors.code"
            :validation-status="loginErrors.code ? 'error' : undefined"
          >
            <div class="code-row">
              <n-input size="large" v-model:value="code" maxlength="6" placeholder="6 位验证码" inputmode="numeric" />
              <n-button
                size="large"
                :disabled="!/^1\d{10}$/.test(phone) || sendingCode || countdown > 0"
                @click="sendCode"
                ><template #icon><Send :size="16" /></template
                >{{ countdown > 0 ? `${countdown}s` : '获取验证码' }}</n-button
              >
            </div>
          </n-form-item>
          <n-form-item label="邀请码">
            <n-input
              size="large"
              v-model:value="inviteCode"
              maxlength="32"
              placeholder="首次登录填写，老用户可留空"
              autocomplete="off"
            />
          </n-form-item>
          <n-alert v-if="loginError" type="error">{{ loginError }}</n-alert>
          <n-button size="large" attr-type="submit" type="primary" block>登录</n-button>
        </n-form>
        <section class="demo-accounts" aria-labelledby="demo-accounts-title">
          <div class="demo-heading">
            <span id="demo-accounts-title">演示账号</span>
            <n-tag size="small" round>一键填充</n-tag>
          </div>
          <div class="demo-account-list">
            <n-button
              v-for="account in demoAccounts"
              :key="account.phone"
              secondary
              block
              class="demo-account"
              @click="useDemoAccount(account)"
            >
              <template #icon><component :is="account.icon" :size="16" /></template>
              <span>{{ account.role }}</span>
              <code>{{ account.phone }} / {{ account.code }}</code>
            </n-button>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.demo-accounts {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.demo-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.demo-account-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}
.demo-account :deep(.n-button__content) {
  display: grid;
  justify-items: start;
  min-width: 0;
  line-height: var(--leading-tight);
}
.demo-account code {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--text-3xs);
}
.login-switch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.switch-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: var(--weight-medium);
}
.switch-link:hover {
  color: var(--color-primary-hover);
}
@media (max-width: 640px) {
  .demo-account-list {
    grid-template-columns: 1fr;
  }
  .login-form :deep(.code-row .n-button) {
    min-width: 6.5rem;
  }
}
</style>
