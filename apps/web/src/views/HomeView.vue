<script setup lang="ts">
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  BadgeCheck,
  Box,
  FileCheck2,
  MessageCircleMore,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
} from 'lucide-vue-next';
import { useAuth } from '../composables/useAuth';
import { usePublishDemand } from '../composables/usePublishDemand';

const router = useRouter();
const { user } = useAuth();
const { openPublishDemand } = usePublishDemand();

const responsibilities = [
  {
    title: '把需求说清楚',
    description: '把模型、尺寸、用途和补充要求整理成打印方能快速判断的信息。',
    icon: ScanSearch,
  },
  {
    title: '让合适的人看见',
    description: '审核通过后进入需求大厅，让有设备、有经验的打印方主动申请。',
    icon: BadgeCheck,
  },
  {
    title: '把联系权交给你',
    description: '微信号默认隐藏，只有你确认授权后，对方才能看到联系方式。',
    icon: ShieldCheck,
  },
] as const;

const steps = [
  { index: '01', title: '上传模型', description: '支持 3MF、OBJ、GLB、STL、FBX、USDZ 等 10 种格式', icon: UploadCloud },
  { index: '02', title: '补充要求', description: '填写用途、要求与收货地区', icon: Box },
  { index: '03', title: '审核展示', description: '需求通过后进入公开大厅', icon: FileCheck2 },
  { index: '04', title: '选择联系', description: '查看申请，再决定授权给谁', icon: MessageCircleMore },
] as const;
</script>

<template>
  <div class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="hero-kicker">欢迎回来，{{ user?.nickname || '创作者' }}</p>
        <h1 id="home-title">印蛙</h1>
        <p class="hero-lead">把一个想法，变成握在手里的实物。</p>
        <p class="hero-description">
          上传 3D 模型，说明用途和要求。印蛙帮你整理需求、公开展示，并在双方确认后建立联系。
        </p>
        <div class="hero-actions">
          <n-button type="primary" size="large" @click="openPublishDemand">
            发布打印需求
            <template #icon><UploadCloud :size="18" aria-hidden="true" /></template>
          </n-button>
          <n-button class="hero-secondary" size="large" @click="router.push({ name: 'hall' })">
            逛逛需求大厅
            <template #icon><ArrowRight :size="18" aria-hidden="true" /></template>
          </n-button>
        </div>
        <div class="hero-facts" aria-label="平台特点">
          <span>10 种模型格式</span>
          <span>需求发布前审核</span>
          <span>联系方式按需授权</span>
        </div>
      </div>
    </section>

    <section class="responsibility-section" aria-labelledby="responsibility-title">
      <header class="section-heading">
        <p>平台职责</p>
        <h2 id="responsibility-title">让一次陌生协作，变得清楚、可控</h2>
      </header>
      <div class="responsibility-grid">
        <article v-for="item in responsibilities" :key="item.title" class="responsibility-item">
          <div class="feature-icon"><component :is="item.icon" :size="22" aria-hidden="true" /></div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </article>
      </div>
    </section>

    <section class="process-section" aria-labelledby="process-title">
      <div class="process-intro">
        <p>主要功能</p>
        <h2 id="process-title">从模型到联系，四步完成</h2>
        <p class="process-description">每个节点都有明确状态，你随时知道需求走到了哪里。</p>
        <n-button secondary @click="router.push({ name: 'workspace' })">
          查看我的工作台
          <template #icon><ArrowRight :size="16" aria-hidden="true" /></template>
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

    <section class="home-cta" aria-label="开始使用印蛙">
      <div>
        <p>有模型，也有想法？</p>
        <h2>把下一件作品交给印蛙连接。</h2>
      </div>
      <n-button type="primary" size="large" @click="openPublishDemand">
        现在发布
        <template #icon><ArrowRight :size="18" aria-hidden="true" /></template>
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
  background: color-mix(in srgb, var(--color-overlay) 28%, transparent);
}

.hero-copy {
  position: relative;
  z-index: 1;
  width: min(32rem, 100%);
}

.hero-kicker,
.section-heading > p,
.process-intro > p:first-child,
.home-cta > div > p {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0;
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
  margin: var(--space-3) 0 0;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
}

.hero-description {
  max-width: 30rem;
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
  --n-border-pressed: 1px solid var(--color-on-image) !important;
}

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-5);
  margin-top: var(--space-8);
  color: var(--color-on-image-muted);
  font-size: var(--text-xs);
}

.hero-facts span {
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-primary);
}

.responsibility-section,
.process-section {
  padding: 0 var(--space-4);
}

.section-heading {
  max-width: 38rem;
  margin-bottom: var(--space-8);
}

.section-heading h2,
.process-intro h2,
.home-cta h2 {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-tight);
  letter-spacing: 0;
}

.responsibility-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.responsibility-item {
  padding: var(--space-8);
}

.responsibility-item + .responsibility-item {
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

.responsibility-item h3,
.process-list h3 {
  margin: var(--space-5) 0 var(--space-2);
  font-size: var(--text-lg);
  letter-spacing: 0;
}

.responsibility-item p,
.process-description,
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
}

.process-description {
  margin: var(--space-4) 0 var(--space-6);
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

@media (max-width: 56rem) {
  .home-hero {
    min-height: 32rem;
    padding: var(--space-10);
    background-position: 58% center;
  }

  .responsibility-grid {
    grid-template-columns: 1fr;
  }

  .responsibility-item + .responsibility-item {
    border-top: 1px solid var(--color-border);
    border-left: 0;
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
    background: color-mix(in srgb, var(--color-overlay) 68%, transparent);
  }

  .hero-copy h1 {
    font-size: var(--text-3xl);
  }

  .hero-lead {
    font-size: var(--text-xl);
  }

  .hero-facts {
    gap: var(--space-2) var(--space-4);
  }

  .responsibility-section,
  .process-section {
    padding: 0;
  }

  .responsibility-item {
    padding: var(--space-6) var(--space-2);
  }

  .home-cta {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--space-8) var(--space-6);
  }
}
</style>
