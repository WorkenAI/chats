"use client";

import { getChatFileUIPartKind } from "@/lib/chat-file-ui-part-kind";
import type { FileUIPart } from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ChatFileViewerMode = "spreadsheet" | "text" | "image" | "binary";

export type ChatFileViewerOpen = {
  mode: ChatFileViewerMode;
  file: FileUIPart;
};

type ChatFileViewerContextValue = {
  open: ChatFileViewerOpen | null;
  openFile: (part: FileUIPart) => void;
  close: () => void;
};

const ChatFileViewerContext = createContext<ChatFileViewerContextValue | null>(
  null,
);

function modeForPart(part: FileUIPart): ChatFileViewerMode {
  const k = getChatFileUIPartKind(part);
  if (k === "spreadsheet") {
    return "spreadsheet";
  }
  if (k === "text") {
    return "text";
  }
  if (k === "image") {
    return "image";
  }
  return "binary";
}

export function ChatFileViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ChatFileViewerOpen | null>(null);
  const openFile = useCallback((part: FileUIPart) => {
    setOpen({ mode: modeForPart(part), file: part });
  }, []);
  const close = useCallback(() => setOpen(null), []);

  const value = useMemo(
    () => ({ open, openFile, close }),
    [open, openFile, close],
  );

  return (
    <ChatFileViewerContext.Provider value={value}>
      {children}
    </ChatFileViewerContext.Provider>
  );
}

export function useChatFileViewer(): ChatFileViewerContextValue {
  const ctx = useContext(ChatFileViewerContext);
  if (!ctx) {
    throw new Error(
      "useChatFileViewer must be used within ChatFileViewerProvider",
    );
  }
  return ctx;
}
