import { useEffect, useState } from 'react';

/**
 * Agent Studio light/dark theme (all AI menus: studio, wiki, galaxy, apps, messenger, personal wiki).
 * Separate from the site's `.dark` toggle: the studio defaults to dark. The choice lives on
 * <html data-studio-theme> so dialogs portalled into <body> follow it too; the light token set
 * is in design-tokens.css.
 */
export type StudioTheme = 'dark' | 'light';
const KEY = 'index-studio:theme';
const EVENT = 'index-studio-theme';

export function getStudioTheme(): StudioTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function apply(theme: StudioTheme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.studioTheme = theme;
}

export function setStudioTheme(theme: StudioTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: still switch for this page */
  }
  apply(theme);
  window.dispatchEvent(new CustomEvent<StudioTheme>(EVENT, { detail: theme }));
}

export function useStudioTheme(): [StudioTheme, () => void] {
  const [theme, setTheme] = useState<StudioTheme>(getStudioTheme);
  useEffect(() => {
    apply(theme);
    const on = (e: Event) => setTheme((e as CustomEvent<StudioTheme>).detail);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const next = e.newValue === 'light' ? 'light' : 'dark';
        apply(next);
        setTheme(next);
      }
    };
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', onStorage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [theme, () => setStudioTheme(theme === 'dark' ? 'light' : 'dark')];
}

// apply the saved choice as soon as any studio screen loads
apply(getStudioTheme());
