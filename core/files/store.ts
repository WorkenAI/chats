import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { AgentStoredFileMeta } from "@/core/files/types";

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function agentFilesDirectory(): string {
  const raw = process.env.CHAT_AGENT_FILES_DIR?.trim();
  if (raw) {
    return raw;
  }
  return path.join(process.cwd(), ".data", "agent-files");
}

export async function storeAgentFile(
  bytes: Uint8Array,
  meta: AgentStoredFileMeta,
): Promise<{ id: string }> {
  const id = nanoid(16);
  const dir = agentFilesDirectory();
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, id);
  await writeFile(`${base}.bin`, bytes);
  await writeFile(`${base}.json`, JSON.stringify(meta), "utf8");
  return { id };
}

export async function readAgentFile(
  id: string,
): Promise<{ bytes: Buffer; meta: AgentStoredFileMeta } | null> {
  if (!ID_RE.test(id)) {
    return null;
  }
  const base = path.join(agentFilesDirectory(), id);
  try {
    const [bytes, metaRaw] = await Promise.all([
      readFile(`${base}.bin`),
      readFile(`${base}.json`, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as AgentStoredFileMeta;
    if (
      typeof meta.mediaType !== "string" ||
      typeof meta.filename !== "string"
    ) {
      return null;
    }
    return { bytes, meta };
  } catch {
    return null;
  }
}
