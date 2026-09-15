# PrintLink Engineering Rules

## Frontend UI / UX

- Build all frontend features with Vue 3 Single-File Components and the Composition API; do not add React or React-specific dependencies.
- Use **Naive UI** as the component framework for controls, forms, navigation, feedback, and dialogs. Use Tailwind CSS for layout and spacing utilities only, not as a replacement for Naive components. Do not introduce a second component framework.
- Use `lucide-vue-next` for every icon; do not use Unicode glyphs, hand-drawn SVGs, or CSS pseudo-element icons.
- Reference design tokens from `apps/web/src/styles/tokens.css` (`--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--motion-*`); do not hardcode hex colors, pixel radii, font sizes, or font stacks in components.
- Read and follow `docs/UI_UX_RULES.md` for every frontend feature or visual change.
- Preserve the existing light and dark themes and verify modified interfaces at mobile and desktop widths.
- Run the web TypeScript check and production build after UI changes.
