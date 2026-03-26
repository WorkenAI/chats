"use client";

import type { ReactNode } from "react";
import { Layers, MessageSquarePlus, PanelLeftClose, Trash2 } from "lucide-react";
import { chromeSidebarIconButtonClass } from "@/app/chat/chrome-sidebar-icon-button";
import { useChromeTheme } from "@/app/chat/theme-scope";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Sidebar title row (threads workspace); aligns with AI Elements / conversation chrome. */
export function ThreadsChromeLabel() {
  return (
    <div className="text-muted-foreground flex items-center gap-2">
      <Layers className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <p className="text-xs font-medium tracking-wide">
        Threads
      </p>
    </div>
  );
}

export type ThreadItem = {
  id: string;
  title: string;
  /** Last user reaction author avatar in this thread (Dicebear or custom URL). */
  previewAvatarUrl?: string;
};

type ThreadListProps = {
  threads: ThreadItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  /** Narrow column inside shell frame (no fixed width / side border). */
  variant?: "page" | "shell";
  /** Passed by `ChatLayout` via `cloneElement` when used as `sidebar`. */
  isSidebarCollapsed?: boolean;
  /** Middle slot in the shell header row (e.g. `ChatLayout` `windowControls`). */
  sidebarHeaderMiddle?: ReactNode;
  onCollapseSidebar?: () => void;
  collapseSidebarTitle?: string;
};

export function ThreadList({
  threads,
  activeId,
  onSelect,
  onDelete,
  onNew,
  variant = "page",
  isSidebarCollapsed: _isSidebarCollapsed,
  sidebarHeaderMiddle,
  onCollapseSidebar,
  collapseSidebarTitle,
}: ThreadListProps) {
  const { theme } = useChromeTheme();
  const newChatButtonClass = chromeSidebarIconButtonClass(theme);
  const isShell = variant === "shell";
  const rootClass = isShell
    ? "flex h-full min-h-0 w-full flex-col"
    : "from-muted/25 to-background flex w-68 shrink-0 flex-col border-r border-border/70 bg-linear-to-b";

  return (
    <aside className={rootClass}>
      {isShell ? (
        <header
          className={cn(
            "border-border/50 flex h-12 shrink-0 items-center gap-3 border-b px-3",
          )}
        >
          <div className="shrink-0">
            <ThreadsChromeLabel />
          </div>
          <div className="min-w-0 flex-1">{sidebarHeaderMiddle}</div>
          {onCollapseSidebar ? (
            <button
              type="button"
              onClick={onCollapseSidebar}
              className={newChatButtonClass}
              title={collapseSidebarTitle ?? "Collapse left panel"}
            >
              <PanelLeftClose size={16} />
            </button>
          ) : null}
        </header>
      ) : null}
      <nav
        aria-label="Conversation threads"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
      >
        {threads.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              className={cn(
                "group relative flex min-h-9 items-center rounded-xl p-0.5 transition-[background-color,box-shadow,color]",
                isActive
                  ? "bg-secondary shadow-sm ring-1 ring-border/40"
                  : "hover:bg-muted/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={cn(
                  "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-1 pl-2 text-left text-sm transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.previewAvatarUrl ? (
                  <img
                    alt=""
                    className="ring-border/30 size-7 shrink-0 rounded-full object-cover ring-1"
                    height={28}
                    src={t.previewAvatarUrl}
                    width={28}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="bg-muted ring-border/20 size-7 shrink-0 rounded-full ring-1"
                  />
                )}
                <span className="min-w-0 flex-1 line-clamp-2 leading-snug">
                  {t.title}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete thread: ${t.title}`}
                title="Delete thread"
                className={cn(
                  "text-muted-foreground shrink-0 self-center hover:bg-destructive/10 hover:text-destructive",
                  "transition-opacity duration-150",
                  /* Hover devices: hide until row hover / focus-within */
                  "opacity-0 pointer-events-none",
                  "group-hover:opacity-100 group-hover:pointer-events-auto",
                  "group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
                  /* Coarse / no-hover (matches ChatLayout mobile breakpoint): keep tappable */
                  "max-md:opacity-100 max-md:pointer-events-auto",
                )}
                onClick={() => onDelete(t.id)}
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              </Button>
            </div>
          );
        })}
      </nav>
      <div className="border-border/50 shrink-0 border-t p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-muted-foreground hover:text-foreground w-full justify-start gap-2 border-border/60 bg-background/50 shadow-none backdrop-blur-sm"
          onClick={onNew}
        >
          <MessageSquarePlus
            className="size-3.5 shrink-0 opacity-80"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="text-sm font-medium">New chat</span>
        </Button>
      </div>
    </aside>
  );
}
