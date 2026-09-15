/**
 * Public UI primitive entrypoint.
 *
 * Re-exports the real Naive UI components used across the app so the existing
 * `<n-*>` templates resolve to genuine Naive components (registered globally in
 * `main.ts`). New code should prefer importing directly from `naive-ui`; this
 * barrel exists to keep the migration incremental and the global registry in
 * one place. Do not add custom control shims here — extend Naive instead.
 */
export {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NGlobalStyle,
  NButton,
  NInput,
  NInputNumber,
  NSelect,
  NForm,
  NFormItem,
  NCheckbox,
  NCheckboxGroup,
  NSpace,
  NAvatar,
  NBadge,
  NCard,
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NModal,
  NAlert,
  NNumberAnimation,
  NPopover,
  NUpload,
  NUploadDragger,
  NTag,
  NEmpty,
  NStatistic,
  NDataTable,
  NSpin,
  NSkeleton,
} from 'naive-ui';
