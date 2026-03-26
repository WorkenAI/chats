"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

export type ChromeTheme = "dark" | "light";

type ChromeThemeApi = {
  theme: ChromeTheme;
  toggle: () => void;
};

/** Same key as before so stored preference is kept. */
export const CHROME_THEME_STORAGE_KEY = "worken-os:shell-theme";

const ThemeScopeContext = createContext<ChromeThemeApi | null>(null);

export function ThemeScope({
  children,
  theme: controlledTheme,
  toggle: controlledToggle,
}: {
  children: ReactNode;
  theme?: ChromeTheme;
  toggle?: () => void;
}) {
  const isControlled = controlledTheme !== undefined;
  const [uncontrolledTheme, setUncontrolledTheme] =
    useState<ChromeTheme>("dark");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const uncontrolledToggle = useCallback(() => {
    setUncontrolledTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);
  const theme = controlledTheme ?? uncontrolledTheme;
  const toggle = controlledToggle ?? uncontrolledToggle;

  useEffect(() => {
    if (isControlled) return;
    const stored = localStorage.getItem(CHROME_THEME_STORAGE_KEY);
    setUncontrolledTheme(stored === "light" ? "light" : "dark");
    setStorageLoaded(true);
  }, [isControlled]);

  useEffect(() => {
    if (isControlled) return;
    if (!storageLoaded) return;
    localStorage.setItem(CHROME_THEME_STORAGE_KEY, theme);
  }, [isControlled, storageLoaded, theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-shell-theme", theme);
  }, [theme]);

  return (
    <ThemeScopeContext value={{ theme, toggle }}>
      <div data-shell-theme={theme} className="h-full">
        {children}
      </div>
    </ThemeScopeContext>
  );
}

export function useChromeTheme(): ChromeThemeApi {
  const ctx = use(ThemeScopeContext);
  if (!ctx) {
    throw new Error("useChromeTheme must be used inside ThemeScope");
  }
  return ctx;
}
