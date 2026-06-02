import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId =
  | 'light'
  | 'dark'
  | 'contrast'
  | 'midnight'
  | 'default'
  | 'smud'
  | 'pge'
  | 'blueprint'
  | 'neon-grid'
  | 'illuminated';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  icon: string;
  isGraph?: boolean;
}

export const THEMES: ThemeOption[] = [
  { id: 'light',       label: 'Light Pro',       description: 'Clean blue/slate - standard office use',    icon: 'sun' },
  { id: 'dark',        label: 'Dark Industrial', description: 'Dark background - reduced eye strain',       icon: 'moon' },
  { id: 'contrast',    label: 'High Contrast',   description: 'Black/yellow - maximum accessibility',       icon: 'bolt' },
  { id: 'midnight',    label: 'Midnight',        description: 'Deep navy/cyan - control room environments', icon: 'stars' },
  { id: 'default',     label: 'SCADA Dark',      description: 'Control room aesthetic',                     icon: 'scada',  isGraph: true },
  { id: 'smud',        label: 'SMUD Green',      description: 'Forest clean energy',                        icon: 'leaf',   isGraph: true },
  { id: 'pge',         label: 'PG&E Navy',       description: 'Utility professional',                       icon: 'navy',   isGraph: true },
  { id: 'blueprint',   label: 'Blueprint',       description: 'Engineering drawing',                        icon: 'ruler',  isGraph: true },
  { id: 'neon-grid',   label: 'Neon Grid',       description: 'Cyberpunk circuit board',                    icon: 'neon',   isGraph: true },
  { id: 'illuminated', label: 'Illuminated',     description: 'Medieval manuscript',                        icon: 'scroll', isGraph: true },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    { name: 'sel-rts-theme' }
  )
);
