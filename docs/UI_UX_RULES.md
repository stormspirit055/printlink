# UI / UX Rules

These rules are mandatory for new and modified frontend features.

## Frontend Stack

- Implement frontend features as Vue 3 Single-File Components using `<script setup lang="ts">` and the Composition API.
- Use **Naive UI** as the component framework for controls, forms, navigation, feedback, and dialogs. Do not add React, JSX/TSX components, or a second component framework. Tailwind CSS is used for layout and spacing utilities only, not as a replacement for Naive components.
- Use `lucide-vue-next` for every icon. Icon-only controls must include a `title` or `aria-label`.
- Import Naive components either directly from `naive-ui` or via the `apps/web/src/components/ui/` barrel. Do not introduce custom control shims; when a shared product behavior is needed, wrap or configure a Naive component.

## Design Tokens

- `apps/web/src/styles/tokens.css` is the single source of truth for color, typography, radius, shadow, and motion. Do not hardcode hex values, pixel radii, or font stacks in components; reference the tokens.
- Canonical tokens: `--color-canvas`, `--color-surface`, `--color-surface-raised`, `--color-field`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-primary` (+ `-hover`/`-active`/`-strong`/`-on-primary`), `--color-info`/`-warning`/`-danger`/`-success`, `--radius-xs/sm/md/lg`, `--shadow-sm/md/lg`, `--motion-fast/standard/slow`, `--ease-enter`, `--ease-exit`.
- The `--app-*` and short aliases (`--green`, `--bg`, etc.) are deprecated bridges for legacy CSS still being migrated; new code uses the canonical names above.
- Light and dark themes are switched via `data-theme` on `<html>`. Both themes must look correct; verify every visual change in both.

## Naive UI Theme

- The app is wrapped in `<n-config-provider>` bound to `useNaiveTheme()` from `apps/web/src/naive-theme.ts`, which projects the design tokens onto Naive UI's `GlobalThemeOverrides`. Every Naive component therefore follows the brand tokens automatically.
- Change colors, radii, and fonts by editing `tokens.css` (and the `buildOverrides` mapping if a new Naive component needs specific theming). Never override Naive component styles with hardcoded values in component CSS.
- Pass `:theme`, `:theme-overrides`, `:locale="zhCN"`, and `:date-locale="dateZhCN"` from `useNaiveTheme()`; do not construct theme overrides ad hoc in components.

## Feedback And Dialogs

- For toasts and confirmations inside `setup`, use the injected `useMessage()` / `useDialog()` from Naive UI.
- For feedback outside `setup` (module-level helpers, stores, plain functions), use the `feedback` object from `apps/web/src/naive-discrete.ts` (`feedback.success/info/warning/error` and `feedback.confirm`). It is theme-bound via `createDiscreteApi`.
- Never use `window.alert`, `window.confirm`, or `window.prompt`. These bypass theming, animation, and focus management.
- Use Naive UI `NModal` or `NDialog`; do not create ad-hoc fixed overlays.
- Open with a 200-240 ms fade, slight vertical movement, and subtle scale. Close in 180 ms.
- Use a translucent black overlay with a 10 px backdrop blur. The dialog surface itself stays opaque and readable.
- Close from the close icon, secondary cancel action, `Escape`, or a click on the backdrop. Clicking inside never closes it.
- Lock page scrolling while open and restore focus to the triggering control after close.
- Set `role="dialog"`, `aria-modal="true"`, and connect the visible heading through `aria-labelledby`.
- Respect `prefers-reduced-motion`; functional state changes must never depend on animation.

## Interaction

- Every interactive control needs hover, active, disabled, and keyboard focus states.
- Every button hover state must transition through the global 180 ms motion rule; never introduce an instantaneous button hover change.
- Button transitions are limited to color, background, border, shadow, opacity, transform, and filter so hover feedback cannot reflow the layout.
- Use Naive UI `NButton`, `NSelect`, `NCheckbox`, `NRadioGroup`, and modal patterns before adding a new control style.
- Use icon-only controls for familiar actions and provide `title` or `aria-label` text.
- Do not require confirmation for reversible navigation or presentation changes. Confirm only destructive, costly, or irreversible actions.
- Account actions belong in an avatar menu. Support hover on pointer devices, focus for keyboard users, and click for touch devices; never make hover the only way to reach an action.
- Account menus should identify the signed-in user with an avatar, display name, role, and masked account identifier before listing account actions. Keep destructive actions visually separated and reveal their risk color on interaction.

## Layout And Content

- Keep compact operational interfaces; avoid cards nested inside cards.
- Dialogs must fit within 92% of the viewport height and scroll internally when necessary.
- Maintain usable controls and non-overlapping text from 320 px mobile width through wide desktop.
- Do not expose derived system values as manual inputs when they can be calculated reliably.
- Messaging interfaces must keep conversation context visible, distinguish sent and received messages without relying on color alone, preserve line breaks, and constrain long content without horizontal overflow.
- Notification badges show unread counts, notification lists distinguish unread items, and opening an actionable notification routes to its relevant order context.
- Successfully parsed 3D model files must render an interactive preview with stable dimensions, automatic camera framing, orbit/zoom controls, and a reset-view action. Empty or blank canvases are release blockers.
- Chinese shipping addresses use linked province, city, and district selects backed by the complete administrative division dataset. Changing a parent selection clears incompatible descendants; free-text administrative divisions are not allowed.
- Demand review uses a summary-list-to-detail flow. The whole summary row opens its detail; do not add an inline model-expansion trigger. The detail must expose the submitted 3D model and parsed manufacturing parameters before approval or rejection, keeping heavy model loading out of the queue view.
- Demand hall cards open a detail view. The detail shows the real model and manufacturing parameters before presenting quotation controls; owners cannot quote their own demand, and makers without a device are routed to device entry.

## Motion Tokens

- Fast feedback: 120-180 ms.
- Standard component transition: 180-240 ms.
- Large view transition: at most 320 ms.
- Default entrance easing: `cubic-bezier(.16, 1, .3, 1)`.
- Default exit easing: `ease-in`.
- Animate opacity and transforms; avoid layout-affecting properties.
- Render statistical counts with Naive UI `NNumberAnimation`. Do not apply it to identifiers, phone numbers, dimensions, dates, or ordinary monetary values.
- Statistical counts animate on initial render and subsequent data refreshes; respect the operating system's reduced-motion preference.

## Performance

- Heavy, conditionally-rendered components (3D model preview, large modals) must be lazy-loaded with `defineAsyncComponent(() => import(...))` so their dependencies (notably `three`) stay out of the initial bundle for screens that do not need them.
- Stable vendor libraries are split into separate cacheable chunks via `vite.config.ts` `manualChunks`; do not bundle them inline.
- Keep the login and demand-hall initial payload as small as possible; these are the first screens users reach.

## Component Priority

- Default to Naive UI components for every control, container, and overlay.
- Only wrap a Naive component in a thin product-specific shell when shared behavior is needed; never reimplement a control that Naive already provides.
- When migrating legacy screens that still use `.control`/`.button`/`.panel` custom classes, replace them with the corresponding Naive component plus token-driven layout, and remove the custom class.

## Layout And Architecture

- The app uses `vue-router` with real routes; each screen is an SFC under `apps/web/src/views/`. `App.vue` is only the provider shell (`NConfigProvider` + `NDialogProvider` + `NMessageProvider` + `<router-view />`). Do not re-collapse screens into a single component or a manual `active` ref.
- Authentication is shared via `useAuth()` (Vue Query dedupes on the `['me']` key) and enforced by the router guard `ensureAuth()`. Components read `user` from `useAuth()`, not from props drilled through a shell.
- Spacing must use the `--space-1 … --space-24` token scale; typography must use `--text-3xs … --text-3xl` (`--text-3xs`/`--text-2xs` are for monospace technical captions only). Do not introduce ad-hoc pixel padding/margins/font-sizes in new code.
- Status copy and tag color come from `lib/format.ts`: `statusText(status)` for the label, `tagTypeFor(status)` for the `NTag` `type`. Do not hand-roll per-screen status maps.
- Async data UIs use the shared `QueryState` component for loading / empty / error + retry. Do not reinvent empty-state markup per screen.
- Real-time updates flow through `useRealtime()` in `MainLayout` (SSE on `/api/events`), which invalidates the `conversations`, `messages`, and `notifications` query keys. Keep those keys stable so SSE refreshes keep working.
- A `/dev` route renders a component + token preview page for theme verification; it is public and excluded from the auth guard.
