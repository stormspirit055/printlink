<script setup lang="ts">
import { ref } from 'vue';
import { Moon, Sun } from 'lucide-vue-next';
import { useTheme } from '../hooks/use-theme';
import { feedback } from '../naive-discrete';
import BrandMark from '../components/BrandMark.vue';

const { theme, toggle } = useTheme();
const showModal = ref(false);
const select = ref('');
const checked = ref(false);
const input = ref('');

const palette = [
  ['canvas', 'var(--color-canvas)'],
  ['surface', 'var(--color-surface)'],
  ['surface-raised', 'var(--color-surface-raised)'],
  ['field', 'var(--color-field)'],
  ['border', 'var(--color-border)'],
  ['text', 'var(--color-text)'],
  ['text-muted', 'var(--color-text-muted)'],
  ['primary', 'var(--color-primary)'],
  ['info', 'var(--color-info)'],
  ['warning', 'var(--color-warning)'],
  ['danger', 'var(--color-danger)'],
  ['success', 'var(--color-success)'],
] as const;

const tagTypes = ['default', 'primary', 'info', 'success', 'warning', 'error'] as const;
</script>

<template>
  <div class="app-shell dev-page">
    <header class="user-header">
      <div class="brand">
        <BrandMark /><span>印蛙<small>COMPONENT PREVIEW</small></span>
      </div>
      <div class="header-actions">
        <n-button quaternary circle :title="theme === 'dark' ? '切换浅色' : '切换深色'" @click="toggle">
          <template #icon>
            <Sun v-if="theme === 'dark'" :size="16" aria-hidden="true" />
            <Moon v-else :size="16" aria-hidden="true" />
          </template>
        </n-button>
      </div>
    </header>
    <main class="main-content">
      <div class="eyebrow">DESIGN TOKENS / PALETTE</div>
      <div class="palette">
        <div v-for="[name, value] in palette" :key="name" class="swatch">
          <span class="chip" :style="{ background: value }" />
          <small>{{ name }}</small>
          <code>{{ value }}</code>
        </div>
      </div>

      <div class="eyebrow">BUTTONS</div>
      <div class="row">
        <n-button type="primary">Primary</n-button>
        <n-button>Default</n-button>
        <n-button quaternary>Quaternary</n-button>
        <n-button type="error">Error</n-button>
        <n-button dashed>Dashed</n-button>
        <n-button type="primary" loading>Loading</n-button>
      </div>

      <div class="eyebrow">FORM CONTROLS</div>
      <div class="form-grid">
        <n-input v-model:value="input" placeholder="文本输入" />
        <n-select
          v-model:value="select"
          :options="[
            { label: '选项 A', value: 'a' },
            { label: '选项 B', value: 'b' },
          ]"
          placeholder="下拉选择"
        />
        <n-checkbox v-model:checked="checked">复选框</n-checkbox>
      </div>

      <div class="eyebrow">TAGS</div>
      <div class="row">
        <n-tag v-for="t in tagTypes" :key="t" :type="t" round bordered>{{ t }}</n-tag>
      </div>

      <div class="eyebrow">ALERTS</div>
      <div class="stack">
        <n-alert type="info" title="信息">一条信息提示。</n-alert>
        <n-alert type="success" title="成功">操作已完成。</n-alert>
        <n-alert type="warning" title="警告">请注意风险。</n-alert>
        <n-alert type="error" title="错误">操作失败。</n-alert>
      </div>

      <div class="eyebrow">STATISTIC / EMPTY / SPIN</div>
      <div class="form-grid">
        <n-statistic label="已发布需求" tabular-nums>
          <n-number-animation :from="0" :to="128" />
        </n-statistic>
        <n-empty description="空状态示例" />
        <n-spin size="large" />
      </div>

      <div class="eyebrow">FEEDBACK / DIALOG</div>
      <div class="row">
        <n-button @click="feedback.success('成功 toast')">Success toast</n-button>
        <n-button @click="feedback.error('错误 toast')">Error toast</n-button>
        <n-button
          @click="
            feedback.confirm({
              title: '确认操作？',
              content: '此操作不可撤销。',
              onPositiveClick: () => feedback.success('已确认'),
            })
          "
        >
          Confirm dialog
        </n-button>
        <n-button @click="showModal = true">Open modal</n-button>
      </div>

      <n-modal v-model:show="showModal" preset="card" title="示例弹窗" class="reject-modal">
        <p class="muted">这是一个 Naive UI NModal（preset=card）示例，含遮罩、关闭图标与 footer。</p>
        <template #footer>
          <div class="modal-actions">
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" @click="showModal = false">确定</n-button>
          </div>
        </template>
      </n-modal>
    </main>
  </div>
</template>

<style scoped>
.dev-page {
  min-height: 100vh;
}
.palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.swatch {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.swatch .chip {
  height: 40px;
  border: 1px solid var(--color-border);
}
.swatch code {
  font-size: 11px;
  color: var(--color-text-muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 24px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.stack {
  display: grid;
  gap: 10px;
  margin-bottom: 24px;
}
</style>
