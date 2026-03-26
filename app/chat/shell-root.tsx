"use client";

import type { ReactNode } from "react";

/** Portals / overlays anchor (`data-shell-workspace-root` for CSS). */
export function ShellRoot({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-0 w-full" data-shell-workspace-root>
      {children}
    </div>
  );
}
