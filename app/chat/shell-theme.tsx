"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

export type ShellAppearance = "dark" | "light";

type ShellThemeContextValue = {
  appearance: ShellAppearance;
  toggle: () => void;
};

/** Unchanged key so existing preferences still apply. */
export const SHELL_THEME_STORAGE_KEY = "worken-os:shell-theme";

const ShellThemeContext = createContext<ShellThemeContextValue | null>(null);

export function ShellTheme({
  children,
  appearance: controlledAppearance,
  toggle: controlledToggle,
}: {
  children: ReactNode;
  appearance?: ShellAppearance;
  toggle?: () => void;
}) {
  const isControlled = controlledAppearance !== undefined;
  const [uncontrolled, setUncontrolled] = useState<ShellAppearance>("dark");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const fallbackToggle = useCallback(() => {
    setUncontrolled((t) => (t === "dark" ? "light" : "dark"));
  }, []);
  const appearance = controlledAppearance ?? uncontrolled;
  const toggle = controlledToggle ?? fallbackToggle;

  useEffect(() => {
    if (isControlled) return;
    const stored = localStorage.getItem(SHELL_THEME_STORAGE_KEY);
    setUncontrolled(stored === "light" ? "light" : "dark");
    setStorageLoaded(true);
  }, [isControlled]);

  useEffect(() => {
    if (isControlled) return;
    if (!storageLoaded) return;
    localStorage.setItem(SHELL_THEME_STORAGE_KEY, appearance);
  }, [isControlled, storageLoaded, appearance]);

  useEffect(() => {
    document.documentElement.setAttribute("data-shell-theme", appearance);
  }, [appearance]);

  return (
    <ShellThemeContext value={{ appearance, toggle }}>
      <div data-shell-theme={appearance} className="h-full">
        {children}
      </div>
    </ShellThemeContext>
  );
}

export function useShellTheme(): ShellThemeContextValue {
  const ctx = use(ShellThemeContext);
  if (!ctx) {
    throw new Error("useShellTheme must be used inside ShellTheme");
  }
  return ctx;
}
