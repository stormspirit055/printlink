# 印蛙 PrintLink UI 整体优化方案（地基阶段）

> 阶段：地基 + 2 个范式页　|　方向：真正接入 Naive UI　|　推进：先打地基，再逐页推进
> 本文件为实施计划，落地后可转为开发记录。

---

## 0. 背景与核心问题

经代码核查发现以下偏离「业内最高标准」与项目硬规范（`AGENTS.md` / `UI_UX_RULES.md`）的事实：

1. **`naive-ui` 根本未安装**。`apps/web/package.json` 无该依赖，`node_modules` 也无。但模板中 `n-button`/`n-input`/`n-select`/`n-modal`/`n-config-provider` 等 24 类组件全部来自 `components/tailwind-ui.ts` 的**手写桩**——它们渲染原生 `<button>`/`<input>`/`<select>`，仅套 Tailwind 类。直接违反 `AGENTS.md`「Use Naive UI as the frontend component framework. Reuse and extend Naive UI components before introducing custom controls or modal shells.」
2. **反馈能力降级**：`App.vue` 顶层 `dialog.success`/`dialog.create` 直接用 `window.alert`/`window.confirm`，违反 `UI_UX_RULES.md`「Use Naive UI NModal or NDialog」与动效/焦点要求。
3. **`NNumberAnimation` 不动画**：桩只渲染 `<strong>{to}</strong>`，违反规则「Statistical counts animate on initial render and subsequent data refreshes」。
4. **`NConfigProvider`/`NDialogProvider`/`NMessageProvider` 是空壳**：无主题注入、无 message/dialog 上下文。
5. **三套样式并行**：`public/styles.css`（旧 `:root` + `.shell`/`.topbar` 等）+ `apps/web/src/styles/tokens.css`（新令牌）+ `index.css`（桥接 + Tailwind + `.control`/`.button` 组件层）。变量别名（`--app-*`/`--green` 等）重叠，Naive UI 主题未与令牌统一。
6. **关键利好**：所有 `n-*` 模板**已按真实 Naive UI 的 API 编写**（`preset="card"`、`trigger="hover"`、`placement`、`:width`、`attr-type`、`label-placement="top"`、`:feedback`/`:validation-status`、`size="large"`、`block`/`quaternary`/`circle`、`:from`/`:to`、`default-upload`/`show-file-list`/`on-before-upload`）。桩即是按 Naive API 设计的过渡品，**替换为真组件风险低**。

---

## 1. 本轮范围

### In-scope（本轮交付）

- 安装并接入真实 Naive UI，建立「令牌 → Naive 主题」单源桥接。
- 用真 `NConfigProvider`/`NDialogProvider`/`NMessageProvider` 装配应用。
- 用 `createDiscreteApi` 提供 setup 外可用的 `message`/`dialog`，替换 `window.alert`/`window.confirm`。
- `components/ui/index.ts` 改为 re-export 真 Naive 组件，删除 `tailwind-ui.ts`。
- 令牌单源化：移除 `public/styles.css` 依赖，收敛别名，统一 `tokens.css` 为唯一源。
- **2 个范式页**打磨到最高标准：**登录页** + **需求大厅**（含需求卡片）。覆盖 light/dark、320px–宽桌面。
- 更新 `docs/UI_UX_RULES.md`：补 Naive 主题约定、令牌映射表、反馈 API 约定。

### Out-of-scope（后续逐页轮，本轮仅保证可用、不深打磨）

工作台、消息、打印设备、后台、需求详情弹窗、`PublishDemandModal`、`PrinterEntryModal`、`MessagesView`、`NotificationCenter`、`ModelPreview` 的视觉打磨。本轮组件层换真 Naive 后它们应继续可用（API 兼容），仅可能存在需后续微调的视觉差异。交易订单不属于当前上线范围，待功能完整实现后另行设计。

---

## 2. 实施步骤

### 步骤 1 · 安装 Naive UI

- `apps/web/package.json` `dependencies` 增加 `"naive-ui": "^2.44.0"`（与 Vue 3.5 / Vite 7 兼容；CSS-in-JS，无需额外 CSS 引入）。
- `npm install`（在 workspace 根执行）。
- 无需 `unplugin-vue-components`：保持显式 `import { NButton } from 'naive-ui'` 或经 `components/ui` 统一出口。

### 步骤 2 · 令牌单源化

- `apps/web/src/index.css`：**移除** `@import '../../../public/styles.css';`，将其仍被引用的少量必要规则（`.boot`/`.pulse` 启动占位等）迁入 `index.css` 或 `tokens.css`。
- `tokens.css` 确认为唯一令牌源；`--app-*`/`--green`/`--bg` 等旧别名保留并标注 `/* deprecated alias, migrate callers */`，待逐页轮清理后删除。
- `index.css` 的 `.control`/`.button`/`.panel`/`.tag`/`.eyebrow` 组件层：保留供未迁移页面使用，但新增 `docs/UI_UX_RULES.md` 指引「新页面优先用 Naive 组件 + 令牌，不再新增自定义控件类」。

### 步骤 3 · 新建 Naive 主题桥 `src/naive-theme.ts`

- 从 `tokens.css` 的令牌值导出 `GlobalThemeOverrides`（common、Button、Input、Select、Card、Modal、Popover、Form、Tag、Avatar、Badge、Alert 等常用块）：
  - `common.primaryColor` = `--color-primary`，`primaryColorHover`/`primaryColorPressed`/`primaryColorSuppl` 对应令牌。
  - `common.bodyColor` = `--color-canvas`，`cardColor`/`modalColor`/`popoverColor` = `--color-surface`，`inputColor` = `--color-field`，`borderColor`/`borderColorStrong`、`textColor`/`textColor2`/`textColor3` 对应 text/muted/subtle。
  - `common.borderRadius` = `--radius-md`，`fontFamily` = `--font-family-sans`。
- 导出 `darkOverrides` 与 `lightOverrides`（浅色用 `:root[data-theme='light']` 的值）。
- 导出 composable `useNaiveTheme()`：读 `useTheme()` 的当前主题，返回 `{ theme: darkTheme | null, themeOverrides: darkOverrides | lightOverrides, locale: zhCN, dateLocale: dateZhCN }`。

### 步骤 4 · 新建 setup 外反馈 `src/naive-discrete.ts`

- 用 `createDiscreteApi(['message', 'dialog', 'notification'], { configProviderProps: computed(() => ({ theme, themeOverrides })) })` 创建 `message`/`dialog`/`notification`，主题随 `useNaiveTheme()` 响应式绑定。
- 导出 `feedback` 对象：`feedback.success(content)`、`feedback.confirm({ title, content, positiveText, onPositiveClick })` 等，封装当前 `dialog.success`/`dialog.create` 的调用形态。
- 说明：`createDiscreteApi` 自带独立 `NConfigProvider` 上下文，解决「模块顶层 helper 无法调用 `useDialog`」的问题。

### 步骤 5 · App.vue 装配真 Provider

- `import { NConfigProvider, NDialogProvider, NMessageProvider, NGlobalStyle } from 'naive-ui'`，`import { useNaiveTheme } from './naive-theme'`。
- 顶层 `<n-config-provider :theme="naiveTheme.theme" :theme-overrides="naiveTheme.themeOverrides" :locale="zhCN" :date-locale="dateZhCN">`，内包 `<n-message-provider><n-dialog-provider>…</n-dialog-provider></n-message-provider>` 与可选 `<n-global-style />`。
- 评估 `NGlobalStyle` 与现有 `index.css` base 重置的冲突；若冲突则不用 `NGlobalStyle`，保留令牌 base。

### 步骤 6 · 组件层换真 Naive

- 重写 `components/ui/index.ts`：`export { NButton, NInput, NInputNumber, NSelect, NForm, NFormItem, NCheckbox, NCheckboxGroup, NSpace, NAvatar, NBadge, NCard, NLayout, NLayoutHeader, NLayoutContent, NModal, NAlert, NNumberAnimation, NPopover, NUpload, NUploadDragger } from 'naive-ui';`
- **删除** `components/tailwind-ui.ts` 与 `components/UiIcon.vue`（未被引用）。
- `main.ts` 仍 `import * as ui from './components/ui'` 全局注册，保持模板零改动可用。
- 逐一核对桩与真组件的 API 差异并修正（预期极少）：
  - `NButton`：桩 `loading` 渲染文字「处理中...」，真组件渲染 spinner——属增强，无需改模板。
  - `NCheckbox`：桩用 `label` prop + 默认插槽，真组件用默认插槽作 label——核对 `PrinterEntryModal` 用法。
  - `NUpload`：`PublishDemandModal` 已用 `default-upload`/`show-file-list`/`on-before-upload` + `n-upload-dragger`，**已匹配真 Naive**；仅核对 `choose` 返回值是否符合 `on-before-upload` 契约。
  - `NModal preset="card"` + `#footer`：真组件原生支持，需求详情弹窗无改动。

### 步骤 7 · 替换 window.alert/confirm

- `App.vue` 删除模块级 `dialog` 对象，改 `import { feedback } from './naive-discrete'`。
- 将 `review('approve'/'reject')`、`demandAction(...)`、`logout` 等处的 `dialog.*` 调用替换为 `feedback.*`；成功提示用 `feedback.success`，确认用 `feedback.confirm`。
- 业务错误展示优先沿用 `n-alert`（已存在）。

### 步骤 8 · 范式页打磨（登录页 + 需求大厅）

遵循 `UI_UX_RULES.md`，用真 Naive 组件 + 令牌把两页打磨到最高标准：

- **登录页**：双栏（品牌宣言 + 表单），`n-form` + `n-form-item` + `n-input` + `n-button`；验证码行 `n-input` + `n-button` 组合；错误用 `n-alert`；移动端单栏（隐藏左侧品牌或置顶）。focus 环、明暗、`prefers-reduced-motion` 全部达标。
- **需求大厅**：`n-input size="large"` 搜索框带搜索图标 `prefix`；需求卡片网格用令牌卡片样式（`--color-surface` + `--color-border` + hover 上浮 220ms），状态 `n-tag`；空态用统一 `empty` 规范；移动端单列。
- 两页统一：间距梯度（4/8/12/16/24/32）、字号梯度（xs/sm/base/lg/xl/2xl）、圆角（`--radius-*`）、阴影（`--shadow-sm/md/lg`）全部取自令牌，禁止硬编码颜色/尺寸。

### 步骤 9 · 更新 `docs/UI_UX_RULES.md`

新增章节：
- **设计令牌**：列出 color/type/radius/shadow/motion 令牌表与用途。
- **Naive 主题约定**：`NConfigProvider` 必须绑定 `useNaiveTheme()`；颜色/圆角/字体只改 `tokens.css`，不在组件内硬编码；`themeOverrides` 是令牌→Naive 的唯一桥。
- **反馈 API 约定**：setup 内用 `useMessage`/`useDialog`，setup 外（模块级 helper）用 `naive-discrete` 的 `feedback`，禁止 `window.alert`/`confirm`。
- **组件优先级**：新页面优先 Naive 组件；仅当 Naive 无对应能力且经评审后才可封装自定义控件。

### 步骤 10 · 清理与回归

- 删除 `components/tailwind-ui.ts`、`components/UiIcon.vue`。
- `public/styles.css` 若仅剩启动占位等少量用途，迁入后删除文件并移除 `index.css` 的 `@import`。
- 运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build -w @printlink/web`（按 `AGENTS.md` 要求：UI 改动后跑 TS 检查与生产构建）。
- 手动核验：登录页 + 大厅在 light/dark、320/768/1280/1920 宽度下达标；其余页面可正常进入且无控制台报错。

---

## 3. 文件变更清单

| 文件 | 操作 |
| --- | --- |
| `apps/web/package.json` | 增 `naive-ui` 依赖 |
| `apps/web/src/naive-theme.ts` | 新建：主题桥 + `useNaiveTheme` |
| `apps/web/src/naive-discrete.ts` | 新建：`createDiscreteApi` 反馈 |
| `apps/web/src/components/ui/index.ts` | 重写：re-export 真 Naive |
| `apps/web/src/components/tailwind-ui.ts` | 删除 |
| `apps/web/src/components/UiIcon.vue` | 删除 |
| `apps/web/src/App.vue` | 真 Provider 装配；`dialog`→`feedback`；登录页+大厅打磨 |
| `apps/web/src/index.css` | 移除 `public/styles.css` 引入；迁入残留规则 |
| `apps/web/src/styles/tokens.css` | 别名标注 deprecated（值不变） |
| `public/styles.css` | 迁移后删除 |
| `docs/UI_UX_RULES.md` | 增令牌/主题/反馈约定章节 |

---

## 4. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 真 Naive 与桩 API 细微差异致回归 | 桩已按 Naive API 设计；逐组件核对（步骤 6），每步跑 typecheck |
| `createDiscreteApi` 主题不随切换更新 | `configProviderProps` 用 `computed` 绑定 `useNaiveTheme`，验证切换明暗后弹窗主题正确 |
| `NGlobalStyle` 与现有 base 重置冲突 | 默认不启用 `NGlobalStyle`，保留令牌 base；必要时局部覆盖 |
| NUpload 在 `PublishDemandModal` 行为变化 | 已确认用法匹配真 Naive；本轮保留该弹窗可用即可，深度打磨留后续轮 |
| Bundle 体积增加 | Naive UI 按需 tree-shake；Vite 生产构建后观察 chunk 体积，必要时配 `build.rollupOptions.output.manualChunks` |

---

## 5. 验收标准

1. `naive-ui` 已安装，`tailwind-ui.ts` 已删除，全站 `n-*` 为真 Naive 组件。
2. `NConfigProvider` 绑定令牌派生的 `themeOverrides`，明/暗切换时 Naive 组件配色同步。
3. `window.alert`/`confirm` 全部移除，反馈走 `feedback`（真 message/dialog，带动画与焦点管理）。
4. `NNumberAnimation` 真实动画生效（工作台统计数字），尊重 `prefers-reduced-motion`。
5. 登录页 + 需求大厅在 light/dark、320/768/1280/1920 下视觉达标，交互态（hover/active/focus/disabled）齐全。
6. `npm run typecheck`、`npm run lint`、`npm test`、`npm run build -w @printlink/web` 全绿。
7. 其余页面可正常进入、无控制台报错（视觉微调留待逐页轮）。
8. `docs/UI_UX_RULES.md` 新增约定章节可指导后续逐页迁移。

---

## 6. 后续轮次（逐页推进，本轮不做）

按优先级：需求详情弹窗 → `PublishDemandModal` → 工作台 → 消息（`MessagesView`）→ 打印设备 + `PrinterEntryModal` → 后台审核/配置 → `NotificationCenter`/`ModelPreview` 收尾。每轮沿用本轮范式：Naive 组件 + 令牌 + `UI_UX_RULES.md`，跑 typecheck/lint/test/build，覆盖明暗与响应式。
