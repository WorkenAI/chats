import { cn } from "@/lib/utils";
import type { ChromeTheme } from "@/app/chat/theme-scope";

/** Matches the header collapse / expand icon treatment in `ChatLayout`. */
export function chromeSidebarIconButtonClass(theme: ChromeTheme): string {
  return cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl backdrop-blur transition-colors",
    theme === "light"
      ? "border border-[color:var(--glass-border)] bg-[color-mix(in_srgb,white_88%,var(--bg-surface)_12%)] text-[color:var(--primitive-subtitle)] shadow-[0_1px_2px_rgb(60_40_20/0.06)] hover:border-[color:rgb(120_80_40/0.2)] hover:bg-[color-mix(in_srgb,white_78%,var(--brand-solid)_8%)] hover:text-[color:var(--primitive-title)]"
      : "border border-white/10 bg-zinc-950/35 text-zinc-400 hover:border-white/20 hover:bg-zinc-900/80 hover:text-zinc-200",
  );
}
