"use client";

import type { ReactNode } from "react";

/** Root for portals / overlays (`data-shell-workspace-root` for existing CSS). */
export function WorkspaceRoot({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-0 w-full" data-shell-workspace-root>
      {children}
    </div>
  );
}
