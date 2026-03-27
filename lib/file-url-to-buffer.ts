import { convertBase64ToUint8Array } from "@ai-sdk/provider-utils";

const DEFAULT_MAX = 4 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 60_000;

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const userSignal = init?.signal;
  if (userSignal) {
    if (userSignal.aborted) {
      ctrl.abort();
    } else {
      userSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
  }
  const { signal: _drop, ...restInit } = init ?? {};
  try {
    return await fetch(url, {
      ...restInit,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (isAbortError(e)) {
      throw new Error(
        "Download timed out — the link may be slow or blocked. Try Open in new tab.",
      );
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

/** Models sometimes wrap URLs in JSON-style quotes. */
export function stripOuterQuotes(s: string): string {
  let t = s.trim();
  for (;;) {
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
      t = t.slice(1, -1).trim();
      continue;
    }
    if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
      t = t.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return t;
}

function copyU8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

const INVISIBLE_PAYLOAD_CHARS = /[\u200B-\u200D\uFEFF]/g;

/** Drop markdown / JSON noise around model-generated base64. */
function scrubBase64Payload(s: string): string {
  return s.replace(/[^A-Za-z0-9+/=]/g, "");
}

/** `=` is only valid as trailing padding. */
function normalizeBase64Equals(s: string): string {
  let t = s.replace(/^=+/, "");
  const endRun = t.match(/=*$/)?.[0] ?? "";
  if (endRun.length === 0) {
    return t.replace(/=/g, "");
  }
  const prefix = t.slice(0, -endRun.length);
  return prefix.replace(/=/g, "") + endRun;
}

/**
 * Standard padding. `length % 4 === 1` is invalid for well-formed base64; models often
 * emit an extra trailing character or truncate one — strip up to 3 trailing chars and retry.
 */
function padBase64Forgiving(s: string): string {
  let t = s;
  for (let attempt = 0; attempt < 4; attempt++) {
    const mod = t.length % 4;
    if (mod === 0) {
      return t;
    }
    if (mod === 2) {
      return `${t}==`;
    }
    if (mod === 3) {
      return `${t}=`;
    }
    // mod === 1 — drop one likely stray char (or fix off-by-one truncation)
    if (t.length < 2) {
      break;
    }
    t = t.slice(0, -1);
  }
  throw new Error("Invalid base64 length");
}

/**
 * Normalize a `data:…;base64,` payload after the comma (LLM noise, base64url, bad `=`).
 */
function normalizeDataUrlBase64Payload(raw: string): string {
  let p = raw.replace(INVISIBLE_PAYLOAD_CHARS, "");
  if (/%[0-9A-Fa-f]{2}/i.test(p)) {
    try {
      p = decodeURIComponent(p);
    } catch {
      /* keep */
    }
  }
  p = p.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  p = scrubBase64Payload(p);
  p = normalizeBase64Equals(p);
  return padBase64Forgiving(p);
}

function decodeNormalizedBase64ToArrayBuffer(
  normalized: string,
  maxBytes: number,
): ArrayBuffer {
  const tryDecode = (s: string): ArrayBuffer | null => {
    try {
      if (typeof Buffer !== "undefined") {
        const buf = Buffer.from(s, "base64");
        if (buf.byteLength > maxBytes) {
          throw new Error(
            `File exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
          );
        }
        return copyU8ToArrayBuffer(buf);
      }
      const u8 = convertBase64ToUint8Array(s);
      if (u8.byteLength > maxBytes) {
        throw new Error(
          `File exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
        );
      }
      return copyU8ToArrayBuffer(u8);
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("File exceeds") &&
        e.message.includes("MB")
      ) {
        throw e;
      }
      return null;
    }
  };

  let candidate = normalized;
  for (let i = 0; i < 6; i++) {
    const out = tryDecode(candidate);
    if (out != null && out.byteLength > 0) {
      return out;
    }
    // Trailing `=` noise or one bad symbol at end
    if (candidate.endsWith("=")) {
      candidate = candidate.slice(0, -1);
      continue;
    }
    if (candidate.length < 2) {
      break;
    }
    candidate = candidate.slice(0, -1);
  }
  throw new Error("Invalid base64 (could not decode)");
}

/**
 * Decode a `data:` URL to bytes. Prefer `readFileUrlToArrayBuffer` in the browser so
 * `fetch(data:…)` can run first (WHATWG forgiving base64).
 */
export function dataUrlToArrayBuffer(
  url: string,
  maxBytes: number = DEFAULT_MAX,
): ArrayBuffer {
  const comma = url.indexOf(",");
  if (!url.startsWith("data:") || comma === -1) {
    throw new Error("Invalid data URL");
  }
  const meta = url.slice(0, comma).toLowerCase();
  const payload = url.slice(comma + 1);
  if (meta.includes(";base64")) {
    const normalized = normalizeDataUrlBase64Payload(payload);
    return decodeNormalizedBase64ToArrayBuffer(normalized, maxBytes);
  }
  const decoded = decodeURIComponent(
    payload.replace(INVISIBLE_PAYLOAD_CHARS, ""),
  );
  const bytes = new TextEncoder().encode(decoded);
  if (bytes.byteLength > maxBytes) {
    throw new Error(`File exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`);
  }
  return copyU8ToArrayBuffer(bytes);
}

export type ReadFileUrlOptions = {
  /**
   * App origin (e.g. `https://app.example.com`). Required when this runs in a context
   * without `window` (Web Worker) so `/api/chat/attachment-proxy` can be called.
   */
  pageOrigin?: string;
};

function resolvePageOrigin(options?: ReadFileUrlOptions): string {
  const o = options?.pageOrigin?.trim();
  if (o) {
    return o;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * `data:` — decode directly (avoids `fetch(data:…)` hanging on very large agent payloads in some browsers).
 * Optional `fetch` fallback after decode failure (timeout-bounded).
 * `http(s):` — `fetch`, then optional same-origin attachment proxy on CORS failure.
 */
export async function readFileUrlToArrayBuffer(
  url: string,
  maxBytes: number = DEFAULT_MAX,
  options?: ReadFileUrlOptions,
): Promise<ArrayBuffer> {
  const trimmed = stripOuterQuotes(url.trim());
  if (!trimmed) {
    throw new Error("Empty file URL");
  }

  const compactBase64 = trimmed.replace(/\s/g, "");
  // Min length avoids treating short tokens as spreadsheets; real xlsx base64 is much larger.
  if (
    compactBase64.length >= 200 &&
    /^[A-Za-z0-9+/]+=*$/.test(compactBase64)
  ) {
    try {
      return dataUrlToArrayBuffer(
        `data:application/octet-stream;base64,${compactBase64}`,
        maxBytes,
      );
    } catch {
      /* not raw base64 — continue as URL */
    }
  }

  if (trimmed.startsWith("data:")) {
    try {
      return dataUrlToArrayBuffer(trimmed, maxBytes);
    } catch (decodeErr) {
      try {
        const res = await fetchWithTimeout(trimmed);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > maxBytes) {
            throw new Error(
              `File exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
            );
          }
          return buf;
        }
      } catch {
        /* prefer original decode error */
      }
      throw decodeErr instanceof Error
        ? decodeErr
        : new Error("Invalid data URL");
    }
  }

  const tryDirect = async (): Promise<ArrayBuffer> => {
    const res = await fetchWithTimeout(trimmed);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(
        `Over ${(maxBytes / (1024 * 1024)).toFixed(0)} MB — open in a new tab.`,
      );
    }
    return buf;
  };

  try {
    return await tryDirect();
  } catch (directErr) {
    let target: URL;
    try {
      target = new URL(trimmed);
    } catch {
      throw directErr instanceof Error
        ? directErr
        : new Error("Failed to load file");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw directErr instanceof Error
        ? directErr
        : new Error("Failed to load file");
    }

    const origin = resolvePageOrigin(options);
    if (!origin) {
      throw directErr instanceof Error
        ? directErr
        : new Error(
            "Failed to load file (need page origin for attachment proxy)",
          );
    }

    const proxyRes = await fetchWithTimeout(
      `${origin}/api/chat/attachment-proxy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      },
    );
    if (!proxyRes.ok) {
      const body = await proxyRes.text().catch(() => "");
      const hint =
        proxyRes.status === 403
          ? "Host not allowed for in-app preview. Set env CHAT_ATTACHMENT_PROXY_HOSTS (comma-separated hostnames) or open in a new tab."
          : body.trim() || proxyRes.statusText;
      const lead =
        directErr instanceof Error ? directErr.message : "Failed to fetch";
      throw new Error(`${lead}. ${hint}`);
    }
    const buf = await proxyRes.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(
        `Over ${(maxBytes / (1024 * 1024)).toFixed(0)} MB — open in a new tab.`,
      );
    }
    return buf;
  }
}
