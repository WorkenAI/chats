import { NextResponse } from "next/server";

const MAX_BYTES = 4 * 1024 * 1024;

function extraAllowedHosts(): Set<string> {
  const raw = process.env.CHAT_ATTACHMENT_PROXY_HOSTS?.trim();
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Server-side fetch for attachment URLs the browser cannot read (CORS).
 * Only same-host as this deployment, plus optional CHAT_ATTACHMENT_PROXY_HOSTS
 * (comma-separated hostnames, e.g. storage.googleapis.com).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const urlRaw =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { url?: unknown }).url === "string"
      ? (body as { url: string }).url.trim()
      : "";
  if (!urlRaw) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlRaw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
  }

  const self = new URL(request.url);
  const sameHost =
    target.hostname.toLowerCase() === self.hostname.toLowerCase();
  const allowedExtra = extraAllowedHosts();
  const hostOk =
    sameHost ||
    allowedExtra.has(target.hostname.toLowerCase());

  if (!hostOk) {
    return NextResponse.json(
      {
        error:
          "host not allowed — set CHAT_ATTACHMENT_PROXY_HOSTS or use same-origin URLs",
      },
      { status: 403 },
    );
  }

  const upstream = await fetch(target.toString(), {
    redirect: "follow",
    headers: { Accept: "*/*" },
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }
  const len = upstream.headers.get("content-length");
  if (len != null && Number.parseInt(len, 10) > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const ct =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=60",
    },
  });
}
