import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "36rem",
        margin: "3rem auto",
        padding: "0 1.25rem",
        lineHeight: 1.55,
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.75rem" }}>chat</h1>
      <p style={{ marginBottom: "1rem" }}>
        <Link
          href="/chat"
          style={{ color: "#0284c7", fontWeight: 600 }}
        >
          Открыть чат с агентом
        </Link>
        {" — "}
        тот же durable-агент (Vercel AI Gateway), что и для Telegram webhook.
      </p>
      <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
        Очередь:{" "}
        <code style={{ background: "#f1f5f9", padding: "0.1rem 0.35rem" }}>
          POST /api/queues/enqueue-order
        </code>
      </p>
    </main>
  );
}
