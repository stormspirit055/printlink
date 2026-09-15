# PrintLink Tailwind UI 规范

## 技术边界

- 页面使用 Vue 3 Single-File Components 和 `<script setup lang="ts">`。
- 样式只使用 Tailwind CSS、`apps/web/src/index.css` 的设计 token 和少量组件级 CSS。
- 图标只使用 `lucide-vue-next`，禁止 Unicode 图标、手绘 SVG 和 CSS `::before`/`::after` 图标。
- 控件放在 `apps/web/src/components/ui/`，业务页面不得重复定义同类控件外观。

## Token

- 页面背景：`bg-ink`，一级面板：`bg-panel`，二级面板：`bg-panel-2`。
- 边框：`border-line`，主文字：`text-fg`，辅助文字：`text-muted`。
- 主行动色：`bg-signal text-[#06120d]`，危险操作：`text-red-400`。
- 小圆角：2-6px；按钮和输入框不得使用大圆角胶囊样式。
- 快速反馈统一 180ms；只允许颜色、背景、边框、阴影、透明度、位移和滤镜过渡。

## 控件

- `Button`：默认最小高度 40px，主按钮必须有 hover、active、disabled、focus-visible 状态；图标通过 `lucide-vue-next` 的 icon slot 或前置组件提供。
- `IconButton`：固定 36x36px，必须有 `aria-label` 和 `title`，不得放长文本。
- `Field`：label 在输入框上方，错误信息紧邻输入框；输入框使用 `bg-field border-line`，focus 使用 signal ring。
- `Select`：原生 `<select>` 或共享 Select 组件，必须有明确 placeholder 和键盘焦点样式。
- `Checkbox`：使用原生 checkbox + Tailwind 样式，点击区域至少 36px。
- `Modal`：固定黑色半透明遮罩 + 10px blur，内容区最多 92vh 且内部滚动；支持 Escape、遮罩关闭和焦点恢复。
- `Popover`：点击和键盘 focus 均可打开，不能只依赖 hover。

## 页面布局

- 操作型页面采用顶部导航、最大宽度 1440px、移动端 16px 内边距。
- 重复数据使用统一 panel/card，禁止卡片嵌套卡片。
- 320px 到桌面宽度均不得出现文字遮挡、横向溢出或按钮换行破坏布局。
- 3D 预览保持稳定尺寸，空模型、空画布和无障碍标签都是发布阻塞问题。
