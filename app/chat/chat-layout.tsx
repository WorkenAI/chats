"use client";

import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { Moon, PanelLeftOpen, Sun } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useState,
} from "react";
import { chromeSidebarIconButtonClass } from "./chrome-sidebar-icon-button";
import { useChromeTheme } from "./theme-scope";

const SIDEBAR_WIDTH = "w-64";
const CHROME_ROW = "h-12";
/** Pad main column below the fixed header (same height as CHROME_ROW). */
const HEADER_CONTENT_PT = "pt-12";
/** Align with Tailwind `md` (768px): mobile = one full-screen pane at a time. */
const MOBILE_MQ = "(max-width: 767px)";

/**
 * Sidebar + header + conversation. No right inspector column.
 * Injects collapse state into sidebar via `cloneElement` when it is a valid element.
 */
export function ChatLayout({
  sidebar,
  conversation,
  breadcrumbs,
  windowControls,
}: {
  sidebar: ReactNode;
  conversation: ReactNode;
  breadcrumbs?: ReactNode;
  windowControls?: ReactNode;
}) {
  const { theme, toggle: toggleTheme } = useChromeTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobileLayout = useMediaQuery(MOBILE_MQ);

  useLayoutEffect(() => {
    if (isMobileLayout) {
      setSidebarCollapsed(true);
    }
  }, [isMobileLayout]);

  const sidebarDesktopBg =
    theme === "light"
      ? "color-mix(in srgb, var(--bg-surface) 88%, white 12%)"
      : "color-mix(in srgb, var(--bg-deep) 94%, white 6%)";
  const chromeIconButtonClass = chromeSidebarIconButtonClass(theme);
  const mainColumnClass =
    theme === "light" ? "bg-card" : "bg-zinc-950/10";
  const headerBarClass = cn(
    "absolute inset-x-0 top-0 z-10 border-b backdrop-blur-xl transition-[background-color,border-color,backdrop-filter] duration-300 ease-out",
    theme === "light"
      ? "border-[color:var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-surface)_72%,white_28%)]/95"
      : "border-zinc-800/30 bg-zinc-950/30",
  );
  const sidebarWithControls = (() => {
    if (!isValidElement(sidebar)) {
      return sidebar;
    }
    const el = sidebar as ReactElement<Record<string, unknown>>;
    const p = el.props;
    const extra: Record<string, unknown> = {};
    if (isMobileLayout) {
      if (typeof p.onSelect === "function") {
        const orig = p.onSelect as (id: string) => void;
        extra.onSelect = (id: string) => {
          orig(id);
          setSidebarCollapsed(true);
        };
      }
      if (typeof p.onNew === "function") {
        const orig = p.onNew as () => void;
        extra.onNew = () => {
          orig();
          setSidebarCollapsed(true);
        };
      }
      if (typeof p.onNavigate === "function") {
        const orig = p.onNavigate as (...args: unknown[]) => void;
        extra.onNavigate = (...args: unknown[]) => {
          orig(...args);
          setSidebarCollapsed(true);
        };
      }
    }
    return cloneElement(el, {
      ...extra,
      onToggleCollapse: undefined,
      isSidebarCollapsed: sidebarCollapsed,
      onCollapseSidebar: () => setSidebarCollapsed(true),
      collapseSidebarTitle: isMobileLayout
        ? "Back to chat"
        : "Collapse left panel",
      sidebarHeaderMiddle: windowControls,
    });
  })();

  const showSidebarChrome = !sidebarCollapsed;
  const sidebarIsFullscreenMobile = isMobileLayout && showSidebarChrome;

  return (
    <div className="text-foreground flex h-full overflow-hidden bg-(--bg-deep) transition-all duration-150">
      <div
        className={cn(
          "flex flex-col overflow-hidden backdrop-blur-xl transition-[width] duration-200",
          isMobileLayout && sidebarCollapsed && "hidden",
          isMobileLayout && showSidebarChrome &&
            "fixed inset-0 z-40 h-dvh w-full max-w-none shrink-0 pt-[env(safe-area-inset-top)]",
          !isMobileLayout && "relative h-full shrink-0",
          !isMobileLayout && sidebarCollapsed && "w-0",
          !isMobileLayout && showSidebarChrome && SIDEBAR_WIDTH,
        )}
        style={{ backgroundColor: sidebarDesktopBg }}
      >
        {sidebarCollapsed ? null : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {sidebarWithControls}
          </div>
        )}
      </div>

      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden",
          mainColumnClass,
          sidebarIsFullscreenMobile && "hidden",
        )}
      >
        <div className={headerBarClass}>
          <div className={cn("flex items-center gap-2 px-1.5", CHROME_ROW)}>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className={chromeIconButtonClass}
                title={isMobileLayout ? "Threads" : "Expand left panel"}
              >
                <PanelLeftOpen size={16} />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">{breadcrumbs}</div>
            <button
              type="button"
              onClick={toggleTheme}
              className={chromeIconButtonClass}
              title={theme === "dark" ? "Light theme" : "Dark theme"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            HEADER_CONTENT_PT,
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {conversation}
          </div>
        </div>
      </div>
    </div>
  );
}
