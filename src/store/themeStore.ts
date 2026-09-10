import { create } from 'zustand';

export type Theme = 'lavender' | 'sunset';

// Phase 0 of the App.tsx state migration: the smallest, lowest-risk slice.
// Holds only the visual theme. Persistence mirrors the previous inline
// useState/useEffect behaviour (localStorage key 'divido_theme'); App.tsx still
// owns the document.body[data-theme] side-effect so nothing else changes.
function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('divido_theme');
    return saved === 'lavender' || saved === 'sunset' ? saved : 'lavender';
  } catch {
    return 'lavender';
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    try { localStorage.setItem('divido_theme', theme); } catch {}
    set({ theme });
  },
}));
