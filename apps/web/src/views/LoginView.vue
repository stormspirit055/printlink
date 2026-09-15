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
        <BrandMark /><span>印蛙<small>PRINTLINK NETWORK</small></span>
      </div>
      <div>
        <div class="eyebrow">DISTRIBUTED MANUFACTURING</div>
        <h1>把闲置算力<br />变成<span>制造网络</span></h1>
        <p>面向真实交易的个人 3D 打印协作平台。</p>
        <svg class="network-art" viewBox="0 0 320 120" fill="none" aria-hidden="true">
          <g stroke="currentColor" stroke-width="1" stroke-opacity="0.35">
            <line x1="40" y1="60" x2="120" y2="24" />
            <line x1="40" y1="60" x2="120" y2="96" />
            <line x1="120" y1="24" x2="210" y2="60" />
            <line x1="120" y1="96" x2="210" y2="60" />
            <line x1="210" y1="60" x2="288" y2="28" />
            <line x1="210" y1="60" x2="288" y2="92" />
          </g>
          <g fill="currentColor">
            <circle cx="40" cy="60" r="4" />
            <circle cx="120" cy="24" r="3" fill-opacity="0.7" />
            <circle cx="120" cy="96" r="3" fill-opacity="0.7" />
            <circle cx="210" cy="60" r="5" />
            <circle cx="288" cy="28" r="3" fill-opacity="0.7" />
            <circle cx="288" cy="92" r="3" fill-opacity="0.7" />
          </g>
        </svg>
      </div>
      <ul class="trust-row">
        <li><b>模型解析</b><small>参数估算</small></li>
        <li><b>需求审核</b><small>内容把关</small></li>
        <li><b>授权联系</b><small>隐私可控</small></li>
      </ul>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="brand mobile-brand">
          <BrandMark /><span>印蛙<small>PRINTLINK NETWORK</small></span>
        </div>
        <div>
          <div class="eyebrow">SECURE ACCESS</div>
          <h2>接入制造网络</h2>
          <p class="muted">手机号即账号，首次登录需邀请码完成注册。</p>
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
              <n-button size="large" :disabled="!/^1\d{10}$/.test(phone) || sendingCode || countdown > 0" @click="sendCode"
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
          <n-button size="large" attr-type="submit" type="primary" block>登录并进入平台</n-button>
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
.network-art {
  color: var(--color-primary);
  width: min(320px, 100%);
  margin-top: var(--space-8);
  opacity: 0.85;
}
.trust-row {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: var(--space-6);
}
.trust-row li {
  display: grid;
  gap: 2px;
}
.trust-row b {
  font-size: var(--text-sm);
  color: var(--color-text);
}
.trust-row small {
  font-size: var(--text-2xs);
  color: var(--color-text-subtle);
}
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
  .trust-row {
    gap: var(--space-4);
  }
  .demo-account-list {
    grid-template-columns: 1fr;
  }
  .login-form :deep(.code-row .n-button) {
    min-width: 6.5rem;
  }
}
</style>
