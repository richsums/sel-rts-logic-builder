// Theme system - re-exports from store
export { useThemeStore, THEMES } from '../store/theme';
export type { ThemeId, ThemeOption } from '../store/theme';

// Convenience: list of graph-specific theme IDs
export const GRAPH_THEME_IDS = ['default', 'smud', 'pge', 'blueprint', 'neon-grid', 'illuminated'] as const;

// setTheme helper - applies data-theme attribute to document root
export function setTheme(themeId: string): void {
  document.documentElement.setAttribute('data-theme', themeId);
}
