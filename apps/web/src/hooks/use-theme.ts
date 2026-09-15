import { ref } from 'vue';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'printlink-theme';

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0e0f' : '#f3f6f4');
}

/**
 * Module-level singleton so every consumer (App.vue, naive-theme, naive-discrete)
 * shares one source of truth for the active theme. A plain composable that
 * created a fresh ref per call would desync the Naive discrete API from the app.
 */
const theme = ref<Theme>(
  typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark',
);
applyTheme(theme.value);

export function useTheme() {
  const toggle = () => {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark';
    theme.value = next;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return { theme, toggle };
}
