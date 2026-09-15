import { computed, type ComputedRef } from 'vue';
import { darkTheme, zhCN, dateZhCN, type GlobalThemeOverrides, type GlobalTheme } from 'naive-ui';
import { useTheme } from './hooks/use-theme';

/**
 * Naive UI theme bridge.
 *
 * `src/styles/tokens.css` is the single source of truth for color, typography,
 * radius, shadow and motion. This module reads those CSS custom properties at
 * runtime and projects them onto Naive UI's `GlobalThemeOverrides`, so every
 * real Naive component stays in lockstep with the brand tokens and with the
 * legacy CSS that still consumes the same variables. When the active theme
 * switches (data-theme on <html>), the computed re-reads and Naive re-themes.
 */

/** Fallback palette mirroring `tokens.css` so theming works before CSS hydrates. */
const FALLBACK = {
  primary: '#4be0a0',
  primaryHover: '#65e8b2',
  primaryActive: '#32c889',
  primaryStrong: '#1d8e65',
  onPrimary: '#06120d',
  canvas: '#0b0e0f',
  surface: '#111617',
  surfaceRaised: '#161d1e',
  field: '#0b0f10',
  border: '#263032',
  borderStrong: '#3a4748',
  text: '#e8f0ed',
  textMuted: '#8d9b98',
  textSubtle: '#687572',
  info: '#67a7ff',
  warning: '#ffc857',
  danger: '#ff6b6b',
  success: '#4be0a0',
  focus: 'rgba(75, 224, 160, 0.38)',
  overlay: 'rgba(0, 0, 0, 0.58)',
  radius: '6px',
  radiusSmall: '3px',
  fontFamily:
    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontFamilyMono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;

interface TokenSet {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryStrong: string;
  onPrimary: string;
  canvas: string;
  surface: string;
  surfaceRaised: string;
  field: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  info: string;
  warning: string;
  danger: string;
  success: string;
  focus: string;
  overlay: string;
  radius: string;
  radiusSmall: string;
  fontFamily: string;
  fontFamilyMono: string;
}

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readTokens(): TokenSet {
  return {
    primary: readVar('--color-primary', FALLBACK.primary),
    primaryHover: readVar('--color-primary-hover', FALLBACK.primaryHover),
    primaryActive: readVar('--color-primary-active', FALLBACK.primaryActive),
    primaryStrong: readVar('--color-primary-strong', FALLBACK.primaryStrong),
    onPrimary: readVar('--color-on-primary', FALLBACK.onPrimary),
    canvas: readVar('--color-canvas', FALLBACK.canvas),
    surface: readVar('--color-surface', FALLBACK.surface),
    surfaceRaised: readVar('--color-surface-raised', FALLBACK.surfaceRaised),
    field: readVar('--color-field', FALLBACK.field),
    border: readVar('--color-border', FALLBACK.border),
    borderStrong: readVar('--color-border-strong', FALLBACK.borderStrong),
    text: readVar('--color-text', FALLBACK.text),
    textMuted: readVar('--color-text-muted', FALLBACK.textMuted),
    textSubtle: readVar('--color-text-subtle', FALLBACK.textSubtle),
    info: readVar('--color-info', FALLBACK.info),
    warning: readVar('--color-warning', FALLBACK.warning),
    danger: readVar('--color-danger', FALLBACK.danger),
    success: readVar('--color-success', FALLBACK.success),
    focus: readVar('--color-focus', FALLBACK.focus),
    overlay: readVar('--color-overlay', FALLBACK.overlay),
    radius: readVar('--radius-md', FALLBACK.radius),
    radiusSmall: readVar('--radius-sm', FALLBACK.radiusSmall),
    fontFamily: readVar('--font-family-sans', FALLBACK.fontFamily),
    fontFamilyMono: readVar('--font-family-mono', FALLBACK.fontFamilyMono),
  };
}

function withAlpha(color: string, alpha: number): string {
  // Naive expects rgba for translucent overlays; pass through if already a rgb()/rgba() function.
  if (color.startsWith('rgb')) {
    return color.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = body.split(',').map((p: string) => p.trim());
      const rgb = parts.slice(0, 3).join(', ');
      return `rgba(${rgb}, ${alpha})`;
    });
  }
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function buildOverrides(t: TokenSet): GlobalThemeOverrides {
  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryActive,
      primaryColorSuppl: t.primary,
      infoColor: t.info,
      infoColorHover: withAlpha(t.info, 0.85),
      infoColorPressed: withAlpha(t.info, 0.7),
      infoColorSuppl: t.info,
      successColor: t.success,
      successColorHover: withAlpha(t.success, 0.85),
      successColorPressed: t.primaryActive,
      successColorSuppl: t.success,
      warningColor: t.warning,
      warningColorHover: withAlpha(t.warning, 0.85),
      warningColorPressed: withAlpha(t.warning, 0.7),
      warningColorSuppl: t.warning,
      errorColor: t.danger,
      errorColorHover: withAlpha(t.danger, 0.85),
      errorColorPressed: withAlpha(t.danger, 0.7),
      errorColorSuppl: t.danger,

      bodyColor: t.canvas,
      cardColor: t.surface,
      modalColor: t.surface,
      popoverColor: t.surface,
      tableColor: t.surface,
      tableHeaderColor: t.surfaceRaised,
      actionColor: t.surfaceRaised,
      hoverColor: withAlpha(t.primary, 0.08),
      inputColor: t.field,
      inputColorDisabled: t.surfaceRaised,

      textColorBase: t.text,
      textColor1: t.text,
      textColor2: t.textMuted,
      textColor3: t.textSubtle,
      textColorDisabled: withAlpha(t.textSubtle, 0.5),
      placeholderColor: t.textSubtle,
      placeholderColorDisabled: withAlpha(t.textSubtle, 0.4),
      iconColor: t.textMuted,
      iconColorHover: t.text,

      borderColor: t.border,
      dividerColor: t.border,

      borderRadius: t.radius,
      borderRadiusSmall: t.radiusSmall,
      fontFamily: t.fontFamily,
      fontFamilyMono: t.fontFamilyMono,
      fontWeight: '400',
      fontWeightStrong: '600',

      boxShadow1: '0 1px 2px rgba(0, 0, 0, 0.18)',
      boxShadow2: '0 12px 30px rgba(0, 0, 0, 0.2)',
      boxShadow3: '0 24px 80px rgba(0, 0, 0, 0.38)',
      clearColor: t.danger,
      clearColorHover: withAlpha(t.danger, 0.85),
      clearColorPressed: withAlpha(t.danger, 0.7),
    },
    Button: {
      textColorPrimary: t.onPrimary,
      textColorHoverPrimary: t.onPrimary,
      textColorPressedPrimary: t.onPrimary,
      textColorFocusPrimary: t.onPrimary,
      colorPrimary: t.primary,
      colorHoverPrimary: t.primaryHover,
      colorPressedPrimary: t.primaryActive,
      colorFocusPrimary: t.primary,
      borderPrimary: `1px solid ${t.primaryStrong}`,
      borderHoverPrimary: `1px solid ${t.primaryHover}`,
      borderPressedPrimary: `1px solid ${t.primaryActive}`,
      borderFocusPrimary: `1px solid ${t.primary}`,
      borderRadiusLarge: t.radius,
      borderRadiusMedium: t.radiusSmall,
      fontWeight: '600',
    },
    Input: {
      color: t.field,
      colorFocus: t.field,
      border: `1px solid ${t.border}`,
      borderHover: `1px solid ${t.borderStrong}`,
      borderFocus: `1px solid ${t.primary}`,
      borderDisabled: `1px solid ${t.border}`,
      boxShadowFocus: `0 0 0 2px ${t.focus}`,
      borderRadius: t.radiusSmall,
      placeholderColor: t.textSubtle,
      textColor: t.text,
      caretColor: t.primary,
    },
    InputNumber: {
      borderRadius: t.radiusSmall,
    },
    Select: {
      peers: {
        InternalSelection: {
          color: t.field,
          colorActive: t.field,
          border: `1px solid ${t.border}`,
          borderHover: `1px solid ${t.borderStrong}`,
          borderActive: `1px solid ${t.primary}`,
          borderFocus: `1px solid ${t.primary}`,
          boxShadowFocus: `0 0 0 2px ${t.focus}`,
          boxShadowActive: `0 0 0 2px ${t.focus}`,
          borderRadius: t.radiusSmall,
          textColor: t.text,
          placeholderColor: t.textSubtle,
        },
        InternalSelectMenu: { optionColorPending: withAlpha(t.primary, 0.1) },
      },
    },
    Card: {
      color: t.surface,
      colorModal: t.surface,
      colorPopover: t.surface,
      borderColor: t.border,
      borderRadius: t.radius,
      titleFontWeight: '600',
    },
    Modal: {
      color: t.surface,
    },
    Dialog: {
      color: t.surface,
      borderRadius: t.radius,
    },
    Popover: {
      color: t.surface,
      textColor: t.text,
      borderRadius: t.radius,
    },
    Form: {
      labelTextColor: t.textMuted,
      labelFontWeight: '500',
      feedbackTextColorError: t.danger,
    },
    Tag: {
      borderRadius: t.radiusSmall,
    },
    Avatar: {
      color: t.primary,
      textColor: t.onPrimary,
    },
    Badge: {
      color: t.danger,
      textColor: '#fff',
    },
    Alert: {
      titleFontWeight: '600',
      borderRadius: t.radiusSmall,
    },
    Message: {
      borderRadius: t.radiusSmall,
    },
    Upload: {
      draggerColor: t.field,
      draggerBorder: `1px dashed ${t.borderStrong}`,
      draggerBorderHover: `1px dashed ${t.primary}`,
      draggerColorHover: withAlpha(t.primary, 0.06),
      borderRadius: t.radius,
    },
    DataTable: {
      thColor: t.surfaceRaised,
      thColorHover: t.surfaceRaised,
      thTextColor: t.textMuted,
      tdColor: t.surface,
      tdColorHover: withAlpha(t.primary, 0.05),
      borderColor: t.border,
      borderRadius: t.radius,
    },
    Layout: {
      color: t.canvas,
      headerColor: t.surface,
      siderColor: t.surface,
    },
    Menu: {
      itemTextColor: t.textMuted,
      itemTextColorHover: t.text,
      itemTextColorActive: t.text,
      itemColorActive: t.surfaceRaised,
      itemColorActiveHover: t.surfaceRaised,
      borderRadius: t.radiusSmall,
    },
  };
}

export interface NaiveThemeContext {
  theme: GlobalTheme | null;
  themeOverrides: GlobalThemeOverrides;
  locale: typeof zhCN;
  dateLocale: typeof dateZhCN;
}

/**
 * Reactive Naive theme context bound to the active app theme.
 * Pass to `<n-config-provider :theme :theme-overrides :locale :date-locale>`.
 */
export function useNaiveTheme(): ComputedRef<NaiveThemeContext> {
  const { theme } = useTheme();
  return computed(() => {
    // Depend on theme so the computed re-reads CSS vars after data-theme flips.
    const isDark = theme.value === 'dark';
    return {
      theme: isDark ? darkTheme : null,
      themeOverrides: buildOverrides(readTokens()),
      locale: zhCN,
      dateLocale: dateZhCN,
    };
  });
}
