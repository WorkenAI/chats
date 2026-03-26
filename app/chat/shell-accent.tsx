"use client";

import type { CSSProperties, ReactNode } from "react";

const DEFAULT_ACCENT = "#22d3ee";

function hexToRgbCsv(hex: string): string {
  const normalized = hex.replace("#", "");
  const isShort = normalized.length === 3;
  const expanded = isShort
    ? normalized
        .split("")
        .map((part) => `${part}${part}`)
        .join("")
    : normalized;

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  return `${r}, ${g}, ${b}`;
}

/** Sets `--shell-accent*` CSS variables (see `app/shell-chat-ui.css`). */
export function ShellAccent({
  accentColor = DEFAULT_ACCENT,
  accentContrast = "#071217",
  className,
  style,
  children,
}: {
  accentColor?: string;
  accentContrast?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      style={
        {
          "--shell-accent": accentColor,
          "--shell-accent-rgb": hexToRgbCsv(accentColor),
          "--shell-accent-contrast": accentContrast,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
