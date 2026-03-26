"use client";

import { Bot } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ChatHeaderActivity =
  | { kind: "idle" }
  | { kind: "active"; mode: "typing" | "thinking" };

type ChatHeaderActivityContextValue = {
  activity: ChatHeaderActivity;
  setActivity: (next: ChatHeaderActivity) => void;
};

const ChatHeaderActivityContext =
  createContext<ChatHeaderActivityContextValue | null>(null);

export function ChatHeaderActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivityState] = useState<ChatHeaderActivity>({
    kind: "idle",
  });
  const setActivity = useCallback((next: ChatHeaderActivity) => {
    setActivityState(next);
  }, []);
  const value = useMemo(
    () => ({ activity, setActivity }),
    [activity, setActivity],
  );
  return (
    <ChatHeaderActivityContext.Provider value={value}>
      {children}
    </ChatHeaderActivityContext.Provider>
  );
}

export function useChatHeaderActivitySetter() {
  return useContext(ChatHeaderActivityContext)?.setActivity;
}

function TypingDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          className="bg-primary/55 size-1.5 animate-bounce rounded-full"
          key={delay}
          style={{ animationDelay: `${delay}ms`, animationDuration: "0.6s" }}
        />
      ))}
    </span>
  );
}

/** Header center: thread title, optional tagline, or typing/thinking when the agent is busy. */
export function ThreadTitleHeader({
  title,
  tagline,
}: {
  title: string;
  /** Shown under the title when idle; omit to hide the subtitle row. */
  tagline?: string;
}) {
  const ctx = useContext(ChatHeaderActivityContext);
  const activity = ctx?.activity ?? { kind: "idle" as const };
  const busy = activity.kind === "active";
  const label =
    activity.kind === "active" && activity.mode === "thinking"
      ? "Thinking…"
      : "Typing…";

  const showIdleSubtitle = !busy && tagline != null && tagline.length > 0;

  return (
    <div className="text-foreground flex min-w-0 items-center gap-2.5 px-2">
      <span
        aria-hidden
        className="shell-accent-soft-bg shell-accent-text flex size-8 shrink-0 items-center justify-center rounded-lg"
      >
        <Bot className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium tracking-tight">{title}</p>
        {busy ? (
          <p
            aria-live="polite"
            className="text-muted-foreground flex max-w-xl items-center gap-2 truncate text-xs leading-snug"
            role="status"
          >
            <TypingDots />
            <span>{label}</span>
          </p>
        ) : showIdleSubtitle ? (
          <p className="text-muted-foreground max-w-xl truncate text-xs leading-snug">
            {tagline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
