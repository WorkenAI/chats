import { readAgentFile } from "@/core/files/store";
import { NextResponse } from "next/server";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const hit = await readAgentFile(id);
  if (!hit) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (hit.bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }
  return new NextResponse(new Uint8Array(hit.bytes), {
    status: 200,
    headers: {
      "Content-Type": hit.meta.mediaType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(hit.meta.filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
