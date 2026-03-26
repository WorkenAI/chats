"use client";

import type { AppWebUIMessage } from "@/core/agents/web-chat-ui-types";
import { AccentWorkspace } from "./chat/accent-workspace";
import {
  ChatHeaderActivityProvider,
  ThreadTitleHeader,
} from "./chat/chat-header-activity";
import { ChatLayout } from "./chat/chat-layout";
import { ThemeScope } from "./chat/theme-scope";
import { WorkspaceRoot } from "./chat/workspace-root";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentChatPanel,
  type AgentChatPanelHandle,
} from "./chat/agent-chat-panel";
import { inferThreadPreviewAvatarFromMessages } from "@/core/agents/web-chat-reactions";
import {
  loadPersistedChatWorkspace,
  savePersistedChatWorkspace,
} from "@/lib/chat-threads-storage";
import { type ThreadItem, ThreadList } from "./chat/thread-list";

const NEW_TITLE = "New chat";

type ChatUIMessage = AppWebUIMessage;

function makeThread(): ThreadItem {
  return { id: crypto.randomUUID(), title: NEW_TITLE };
}

export default function ChatPage() {
  const first = useMemo(() => makeThread(), []);
  const [threads, setThreads] = useState<ThreadItem[]>([first]);
  const [activeId, setActiveId] = useState(first.id);
  const [threadMessages, setThreadMessages] = useState<
    Record<string, ChatUIMessage[]>
  >({});
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const persistRef = useRef({
    threads,
    activeId,
    threadMessages,
  });
  persistRef.current = { threads, activeId, threadMessages };
  const panelRef = useRef<AgentChatPanelHandle>(null);
  const { resolvedTheme, setTheme } = useTheme();
  /** next-themes has no resolved theme on the server; the client may resolve immediately. Gate on mount so SSR and the first client render match. */
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    const loaded = loadPersistedChatWorkspace();
    if (loaded) {
      setThreads(loaded.threads);
      setActiveId(loaded.activeId);
      setThreadMessages(loaded.threadMessages);
    }
    setWorkspaceHydrated(true);
  }, []);

  useEffect(() => {
    if (!workspaceHydrated) {
      return;
    }
    const id = setTimeout(() => {
      savePersistedChatWorkspace({
        version: 1,
        activeId,
        threads,
        threadMessages,
      });
    }, 400);
    return () => clearTimeout(id);
  }, [workspaceHydrated, activeId, threads, threadMessages]);

  useEffect(() => {
    if (!workspaceHydrated || typeof window === "undefined") {
      return;
    }
    const flush = () => {
      const s = persistRef.current;
      savePersistedChatWorkspace({
        version: 1,
        activeId: s.activeId,
        threads: s.threads,
        threadMessages: s.threadMessages,
      });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [workspaceHydrated]);

  const chromeTheme =
    !themeReady || resolvedTheme === undefined
      ? "dark"
      : resolvedTheme === "light"
        ? "light"
        : "dark";
  const accent =
    !themeReady || resolvedTheme === undefined
      ? "#22d3ee"
      : resolvedTheme === "light"
        ? "#d97706"
        : "#22d3ee";
  const toggleChromeTheme = useCallback(() => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setTheme]);

  const persistActiveThread = useCallback(() => {
    panelRef.current?.persist();
  }, []);

  const handleThreadMessagesChange = useCallback(
    (threadId: string, messages: ChatUIMessage[]) => {
      setThreadMessages((prev) => ({ ...prev, [threadId]: messages }));
      const previewAvatarUrl =
        inferThreadPreviewAvatarFromMessages(messages);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, previewAvatarUrl } : t,
        ),
      );
    },
    [],
  );

  const onNew = useCallback(() => {
    persistActiveThread();
    const t = makeThread();
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
  }, [persistActiveThread]);

  const onSelectThread = useCallback(
    (id: string) => {
      if (id === activeId) {
        return;
      }
      persistActiveThread();
      setActiveId(id);
    },
    [activeId, persistActiveThread],
  );

  const onDeleteThread = useCallback(
    (id: string) => {
      persistActiveThread();
      const { threads: curThreads, activeId: curActive } = persistRef.current;
      const filtered = curThreads.filter((t) => t.id !== id);
      let nextThreads = filtered;
      let nextActive = curActive;

      if (id === curActive) {
        if (filtered.length === 0) {
          const t = makeThread();
          nextThreads = [t];
          nextActive = t.id;
        } else {
          const oldIdx = curThreads.findIndex((t) => t.id === id);
          const pick =
            filtered[oldIdx] ?? filtered[oldIdx - 1] ?? filtered[0]!;
          nextActive = pick.id;
        }
      }

      setThreads(nextThreads);
      setThreadMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (nextActive !== curActive) {
        setActiveId(nextActive);
      }
    },
    [persistActiveThread],
  );

  const onUserMessage = useCallback((text: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId && t.title === NEW_TITLE
          ? { ...t, title: text.slice(0, 48) || NEW_TITLE }
          : t,
      ),
    );
  }, [activeId]);

  const storedMessages = threadMessages[activeId] ?? [];
  const activeThread = threads.find((t) => t.id === activeId);
  const activeTitle = activeThread?.title ?? NEW_TITLE;

  return (
    <AccentWorkspace
      accentColor={accent}
      accentContrast={chromeTheme === "light" ? "#fffef8" : "#071217"}
      className="h-dvh"
    >
      <WorkspaceRoot>
        <ThemeScope theme={chromeTheme} toggle={toggleChromeTheme}>
          <ChatHeaderActivityProvider>
            <ChatLayout
              breadcrumbs={
                <ThreadTitleHeader title={activeTitle} />
              }
              conversation={
                <AgentChatPanel
                  ref={panelRef}
                  chatId={activeId}
                  embedInShell
                  onThreadMessagesChange={handleThreadMessagesChange}
                  onUserMessage={onUserMessage}
                  storedMessages={storedMessages}
                />
              }
              sidebar={
                <ThreadList
                  activeId={activeId}
                  onDelete={onDeleteThread}
                  onNew={onNew}
                  onSelect={onSelectThread}
                  threads={threads}
                  variant="shell"
                />
              }
            />
          </ChatHeaderActivityProvider>
        </ThemeScope>
      </WorkspaceRoot>
    </AccentWorkspace>
  );
}
