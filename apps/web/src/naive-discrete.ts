import { computed, type ComputedRef } from 'vue';
import { createDiscreteApi, type ConfigProviderProps } from 'naive-ui';
import { useNaiveTheme } from './naive-theme';

/**
 * Feedback API usable outside component setup (e.g. from module-level helpers
 * or plain stores). Backed by Naive UI's `createDiscreteApi`, which mounts its
 * own provider subtree bound to the same theme as the app, so toasts and
 * dialogs stay themed after light/dark toggles.
 *
 * Inside setup, prefer the injected `useMessage` / `useDialog` hooks instead;
 * reserve this module for places that cannot reach a provider via injection.
 */
const naiveTheme = useNaiveTheme();

const configProviderProps: ComputedRef<ConfigProviderProps> = computed(() => ({
  theme: naiveTheme.value.theme,
  themeOverrides: naiveTheme.value.themeOverrides,
}));

const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps,
});

export interface ConfirmOptions {
  title: string;
  content?: string | (() => string);
  positiveText?: string;
  negativeText?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  onPositiveClick?: () => void | Promise<void>;
}

export const feedback = {
  success: (content: string) => message.success(content, { duration: 3000 }),
  info: (content: string) => message.info(content, { duration: 3000 }),
  warning: (content: string) => message.warning(content, { duration: 3500 }),
  error: (content: string) => message.error(content, { duration: 4000 }),
  confirm: (opts: ConfirmOptions) =>
    dialog.create({
      title: opts.title,
      content: typeof opts.content === 'function' ? opts.content() : opts.content,
      positiveText: opts.positiveText || '确认',
      negativeText: opts.negativeText || '取消',
      type: opts.type || 'warning',
      onPositiveClick: opts.onPositiveClick,
    }),
};
