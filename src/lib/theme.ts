/**
 * The one light/dark setting for the whole product: site, admin and Agent Studio. Every toggle goes
 * through here, and index.html applies the saved choice before the first paint.
 */
import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";
const KEY = "index-theme";
const EVENT = "index-theme-change";

export function getTheme(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.appTheme = theme;
  root.dataset.studioTheme = theme;
  // shadcn/assistant-ui components read the .dark class
  root.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: still switch for this page */
  }
  apply(theme);
  window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: theme }));
}

export function useTheme(): [ThemeMode, () => void] {
  const [theme, setCurrent] = useState<ThemeMode>(getTheme);
  useEffect(() => {
    const onChange = (event: Event) => setCurrent((event as CustomEvent<ThemeMode>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next = event.newValue === "dark" ? "dark" : "light";
      apply(next);
      setCurrent(next);
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [theme, () => setTheme(getTheme() === "dark" ? "light" : "dark")];
}

// Dev-only preview pages load without index.html's inline script.
apply(getTheme());
