"use client";

import type { AppWebUIMessage } from "@/core/agents/web-chat-ui-types";
import { ShellAccent } from "./chat/shell-accent";
import { HeaderProvider, ThreadHeader } from "./chat/shell-header";
import { WorkspaceLayout } from "./chat/workspace-layout";
import { ShellRoot } from "./chat/shell-root";
import { ShellTheme, type ShellAppearance } from "./chat/shell-theme";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConversationPanel,
  type ConversationPanelHandle,
} from "./chat/conversation-panel";
import { inferThreadPreviewAvatarFromMessages } from "@/core/agents/web-chat-reactions";
import {
  loadPersistedChatWorkspace,
  savePersistedChatWorkspace,
  type ThreadRow,
} from "@/lib/chat-threads-storage";
import { WEB_CHAT_INSTALLATION_ID } from "@/lib/web-chat-installation";
import { ThreadSidebar } from "./chat/thread-sidebar";

const NEW_TITLE = "New chat";

type ChatUIMessage = AppWebUIMessage;

function makeThread(): ThreadRow {
  return { id: crypto.randomUUID(), title: NEW_TITLE };
}

export default function ChatPage() {
  const first = useMemo(() => makeThread(), []);
  const [threads, setThreads] = useState<ThreadRow[]>([first]);
  const [activeId, setActiveId] = useState(first.id);
  const [threadMessages, setThreadMessages] = useState<
    Record<string, ChatUIMessage[]>
  >({});
  const [webInstallationId, setWebInstallationId] = useState(
    WEB_CHAT_INSTALLATION_ID,
  );
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const persistRef = useRef({
    threads,
    activeId,
    threadMessages,
    webInstallationId,
  });
  persistRef.current = {
    threads,
    activeId,
    threadMessages,
    webInstallationId,
  };
  const panelRef = useRef<ConversationPanelHandle>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    const loaded = loadPersistedChatWorkspace();
    if (loaded) {
      setWebInstallationId(loaded.webInstallationId);
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
        version: 2,
        webInstallationId,
        activeId,
        threads,
        threadMessages,
      });
    }, 400);
    return () => clearTimeout(id);
  }, [workspaceHydrated, activeId, threads, threadMessages, webInstallationId]);

  useEffect(() => {
    if (!workspaceHydrated || typeof window === "undefined") {
      return;
    }
    const flush = () => {
      const s = persistRef.current;
      savePersistedChatWorkspace({
        version: 2,
        webInstallationId: s.webInstallationId,
        activeId: s.activeId,
        threads: s.threads,
        threadMessages: s.threadMessages,
      });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [workspaceHydrated]);

  const appearance: ShellAppearance =
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
  const accentContrast =
    appearance === "light" ? "#fffef8" : "#071217";
  const toggleAppearance = useCallback(() => {
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
    <ShellAccent
      accentColor={accent}
      accentContrast={accentContrast}
      className="h-dvh"
    >
      <ShellRoot>
        <ShellTheme appearance={appearance} toggle={toggleAppearance}>
          <HeaderProvider>
            <WorkspaceLayout
              breadcrumbs={<ThreadHeader title={activeTitle} />}
              conversation={
                <ConversationPanel
                  ref={panelRef}
                  chatId={activeId}
                  installationId={webInstallationId}
                  embedInShell
                  onThreadMessagesChange={handleThreadMessagesChange}
                  onUserMessage={onUserMessage}
                  storedMessages={storedMessages}
                />
              }
              sidebar={
                <ThreadSidebar
                  activeId={activeId}
                  onDelete={onDeleteThread}
                  onNew={onNew}
                  onSelect={onSelectThread}
                  threads={threads}
                  variant="shell"
                />
              }
            />
          </HeaderProvider>
        </ShellTheme>
      </ShellRoot>
    </ShellAccent>
  );
}
