"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./chat.module.css";

type ChatBubblePart = {
  type: "data-chat-bubble";
  id?: string;
  data: { text: string };
};

function isChatBubblePart(part: unknown): part is ChatBubblePart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as ChatBubblePart).type === "data-chat-bubble" &&
    typeof (part as ChatBubblePart).data?.text === "string"
  );
}

function MessageView({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!text.trim()) {
      return null;
    }
    return (
      <div className={`${styles.row} ${styles.rowUser}`}>
        <div className={styles.bubbleUser}>{text}</div>
      </div>
    );
  }

  if (message.role === "assistant") {
    const bubbles = message.parts.filter(isChatBubblePart);
    const hasToolNoise = message.parts.some((p) => {
      const t = p.type;
      return (
        t === "dynamic-tool" ||
        (typeof t === "string" && t.startsWith("tool-")) ||
        t === "step-start"
      );
    });

    return (
      <>
        {bubbles.map((part, i) => (
          <div
            key={part.id ?? `${part.data.text}-${i}`}
            className={styles.row}
          >
            <div className={styles.bubbleAgent}>{part.data.text}</div>
          </div>
        ))}
        {hasToolNoise && bubbles.length === 0 ? (
          <div className={styles.row}>
            <span className={styles.toolHint}>Думаю…</span>
          </div>
        ) : null}
      </>
    );
  }

  return null;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new WorkflowChatTransport<UIMessage>({
        api: "/api/chat",
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat<UIMessage>({
    id: "web-agent",
    transport,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  async function submitMessage() {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Чат с агентом</h1>
          <p className={styles.sub}>
            Тот же сценарий, что и в Telegram: паузы и несколько коротких
            сообщений.
          </p>
        </div>
        <a className={styles.back} href="/">
          На главную
        </a>
      </header>

      <div className={styles.thread}>
        {messages.length === 0 ? (
          <p className={styles.empty}>
            Напишите сообщение — ответ пойдёт через Vercel AI Gateway и
            durable workflow.
          </p>
        ) : (
          messages.map((m) => <MessageView key={m.id} message={m} />)
        )}
        {busy ? (
          <div className={styles.row}>
            <div className={styles.typing} aria-hidden>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className={styles.composer}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submitMessage();
          }}
        >
          <textarea
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitMessage();
              }
            }}
            placeholder="Сообщение…"
            rows={1}
            disabled={busy}
            aria-label="Сообщение"
          />
          <button type="submit" className={styles.send} disabled={busy || !input.trim()}>
            Отправить
          </button>
        </form>
        {busy ? (
          <button type="button" className={styles.stop} onClick={() => void stop()}>
            Остановить
          </button>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
