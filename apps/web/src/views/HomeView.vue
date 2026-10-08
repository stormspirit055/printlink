<script setup lang="ts">
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  Handshake,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
} from 'lucide-vue-next';
import { usePublishDemand } from '../composables/usePublishDemand';

const router = useRouter();
const { openPublishDemand } = usePublishDemand();
const values = [
  {
    title: '模型信息更清楚',
    description: '上传模型并补充用途、尺寸和要求，让打印方更容易判断是否适合承接。',
    icon: ScanSearch,
  },
  {
    title: '需求审核后展示',
    description: '发布的需求经过平台审核，再进入公开需求大厅供打印方查看。',
    icon: BadgeCheck,
  },
  { title: '按需决定联系对象', description: '打印方申请联系方式后，由你决定是否授权查看微信号。', icon: ShieldCheck },
  {
    title: '进度在工作台可查',
    description: '需求审核状态与联系方式申请集中展示，方便随时回来查看。',
    icon: ListChecks,
  },
] as const;
const steps = [
  { index: '01', title: '上传模型', description: '选择模型文件，补充用途和打印要求。', icon: UploadCloud },
  { index: '02', title: '提交审核', description: '确认需求信息，提交后等待平台审核。', icon: FileCheck2 },
  { index: '03', title: '等待申请', description: '审核通过后，打印方可在需求大厅查看并申请联系。', icon: Handshake },
  { index: '04', title: '自主授权', description: '查看申请，再决定是否向对方提供微信号。', icon: ShieldCheck },
] as const;

function scrollToProcess() {
  document.getElementById('home-process')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<template>
  <div class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="hero-kicker">印蛙 · 3D 打印需求撮合平台</p>
        <h1 id="home-title">模型交给印蛙，<br />找到合适的打印方</h1>
        <p class="hero-lead">把模型变成实物，从清楚表达需求开始。</p>
        <p class="hero-description">
          从创意摆件到实用零件，上传模型并说明打印需求。印蛙帮你展示给打印方，由你决定与谁建立联系。
        </p>
        <div class="hero-actions">
          <n-button type="primary" size="large" @click="openPublishDemand()">
            <template #icon><UploadCloud :size="18" aria-hidden="true" /></template>上传模型，发布需求
          </n-button>
          <n-button class="hero-secondary" size="large" @click="scrollToProcess">
            了解发布流程<template #icon><ArrowRight :size="18" aria-hidden="true" /></template>
          </n-button>
        </div>
        <p class="hero-note">提交前可先查看模型解析结果；发布后由你决定是否授权联系。</p>
      </div>
    </section>

    <section class="value-section" aria-labelledby="value-title">
      <header class="section-heading">
        <p class="section-kicker">为什么选择印蛙</p>
        <h2 id="value-title">从发布到联系，每一步都更清楚</h2>
      </header>
      <div class="value-grid">
        <article v-for="item in values" :key="item.title" class="value-item">
          <div class="feature-icon"><component :is="item.icon" :size="22" aria-hidden="true" /></div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </article>
      </div>
    </section>

    <section id="home-process" class="process-section" aria-labelledby="process-title">
      <div class="process-intro">
        <p class="section-kicker">发布流程</p>
        <h2 id="process-title">让模型遇见打印方，只需四步</h2>
        <p class="process-description">首次发布也能按步骤完成。审核状态和联系申请可在工作台查看。</p>
        <n-button secondary @click="router.push({ name: 'workspace' })">
          查看我的工作台<template #icon><ArrowRight :size="16" aria-hidden="true" /></template>
        </n-button>
      </div>
      <ol class="process-list">
        <li v-for="step in steps" :key="step.index">
          <span class="step-index">{{ step.index }}</span>
          <component :is="step.icon" :size="22" aria-hidden="true" />
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="home-cta" aria-label="开始发布打印需求">
      <div>
        <p class="section-kicker">开始下一步</p>
        <h2>让下一个想法，从模型走向实物</h2>
        <span>上传模型，告诉打印方你想做什么。</span>
      </div>
      <n-button type="primary" size="large" @click="openPublishDemand()">
        <template #icon><UploadCloud :size="18" aria-hidden="true" /></template>上传模型，发布需求
      </n-button>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: grid;
  gap: var(--space-16);
}
.home-hero {
  position: relative;
  min-height: min(36rem, calc(100svh - 10rem));
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: var(--space-16);
  border-radius: var(--radius-lg);
  background: url('/home-hero.jpg') center / cover no-repeat;
  color: var(--color-on-image);
}
.hero-shade {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-overlay) 48%, transparent);
}
.hero-copy {
  position: relative;
  z-index: 1;
  width: min(40rem, 100%);
}
.hero-kicker,
.section-kicker {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
}
.hero-kicker {
  color: var(--color-on-image-muted);
}
.hero-copy h1 {
  margin: 0;
  font-size: var(--text-display);
  line-height: var(--leading-tight);
  letter-spacing: 0;
}
.hero-lead {
  margin: var(--space-4) 0 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
}
.hero-description {
  max-width: 34rem;
  margin: var(--space-4) 0 0;
  color: var(--color-on-image-muted);
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-8);
}
.hero-secondary {
  --n-color: color-mix(in srgb, var(--color-canvas) 72%, transparent) !important;
  --n-color-hover: color-mix(in srgb, var(--color-canvas) 86%, transparent) !important;
  --n-color-pressed: var(--color-canvas) !important;
  --n-text-color: var(--color-on-image) !important;
  --n-text-color-hover: var(--color-on-image) !important;
  --n-text-color-pressed: var(--color-on-image) !important;
  --n-border: 1px solid color-mix(in srgb, var(--color-on-image) 38%, transparent) !important;
  --n-border-hover: 1px solid color-mix(in srgb, var(--color-on-image) 62%, transparent) !important;
}
.hero-note {
  margin: var(--space-4) 0 0;
  color: var(--color-on-image-muted);
  font-size: var(--text-xs);
}
.section-heading h2,
.process-intro h2,
.home-cta h2 {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-tight);
  letter-spacing: 0;
}
.process-description,
.home-cta span {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}
.value-section,
.process-section {
  padding: 0 var(--space-4);
}
.section-heading {
  margin-bottom: var(--space-8);
}
.value-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.value-item {
  min-width: 0;
  padding: var(--space-6);
}
.value-item + .value-item {
  border-left: 1px solid var(--color-border);
}
.feature-icon {
  width: var(--control-height-lg);
  height: var(--control-height-lg);
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-primary);
}
.value-item h3,
.process-list h3 {
  margin: var(--space-5) 0 var(--space-2);
  font-size: var(--text-lg);
  letter-spacing: 0;
}
.value-item p,
.process-list p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}
.process-section {
  display: grid;
  grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.5fr);
  gap: var(--space-16);
  align-items: start;
  scroll-margin-top: var(--space-8);
}
.process-description {
  margin-bottom: var(--space-6);
}
.process-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-border);
}
.process-list li {
  display: grid;
  grid-template-columns: 2.5rem 2rem minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  min-height: 6rem;
  border-bottom: 1px solid var(--color-border);
}
.process-list li > svg {
  color: var(--color-primary);
}
.step-index {
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: var(--text-xs);
}
.process-list h3 {
  margin: 0 0 var(--space-1);
}
.process-list p {
  font-size: var(--text-sm);
}
.home-cta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-10);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.home-cta span {
  display: block;
}
@media (max-width: 64rem) {
  .value-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .value-item:nth-child(3) {
    border-left: 0;
  }
  .value-item:nth-child(n + 3) {
    border-top: 1px solid var(--color-border);
  }
}
@media (max-width: 56rem) {
  .home-hero {
    min-height: 32rem;
    padding: var(--space-10);
    background-position: 58% center;
  }
  .process-section {
    grid-template-columns: 1fr;
    gap: var(--space-8);
  }
}
@media (max-width: 40rem) {
  .home-page {
    gap: var(--space-12);
  }
  .home-hero {
    min-height: 33rem;
    padding: var(--space-8) var(--space-6);
    background-position: 64% center;
  }
  .hero-shade {
    background: color-mix(in srgb, var(--color-overlay) 78%, transparent);
  }
  .hero-copy h1 {
    font-size: var(--text-3xl);
  }
  .hero-lead {
    font-size: var(--text-lg);
  }
  .value-section,
  .process-section {
    padding: 0;
  }
  .value-grid {
    grid-template-columns: 1fr;
  }
  .value-item {
    padding: var(--space-6) var(--space-2);
  }
  .value-item + .value-item {
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .home-cta {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--space-8) var(--space-6);
  }
}
</style>
