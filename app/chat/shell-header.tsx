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

export type HeaderStatus =
  | { kind: "idle" }
  | { kind: "busy"; mode: "typing" | "thinking" };

type HeaderContextValue = {
  status: HeaderStatus;
  setStatus: (next: HeaderStatus) => void;
};

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<HeaderStatus>({ kind: "idle" });
  const setStatus = useCallback((next: HeaderStatus) => {
    setStatusState(next);
  }, []);
  const value = useMemo(() => ({ status, setStatus }), [status, setStatus]);
  return (
    <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>
  );
}

export function useSetHeaderStatus() {
  return useContext(HeaderContext)?.setStatus;
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

/** Title row: optional tagline when idle; typing/thinking when the model is active. */
export function ThreadHeader({
  title,
  tagline,
}: {
  title: string;
  tagline?: string;
}) {
  const ctx = useContext(HeaderContext);
  const status = ctx?.status ?? { kind: "idle" as const };
  const busy = status.kind === "busy";
  const label =
    status.kind === "busy" && status.mode === "thinking"
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
