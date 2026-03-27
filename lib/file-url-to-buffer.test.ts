import { describe, expect, test } from "bun:test";
import { dataUrlToArrayBuffer } from "./file-url-to-buffer";

describe("dataUrlToArrayBuffer", () => {
  test("decodes unpadded base64", () => {
    const u = "data:application/octet-stream;base64,SGVsbG8";
    const buf = dataUrlToArrayBuffer(u);
    expect(new TextDecoder().decode(buf)).toBe("Hello");
  });

  test("decodes base64url without padding", () => {
    const b64url = Buffer.from("hello")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const u = `data:application/octet-stream;base64,${b64url}`;
    const buf = dataUrlToArrayBuffer(u);
    expect(new TextDecoder().decode(buf)).toBe("hello");
  });

  test("strips zero-width space in payload", () => {
    const u = "data:application/octet-stream;base64,SGVs\u200BbG8=";
    const buf = dataUrlToArrayBuffer(u);
    expect(new TextDecoder().decode(buf)).toBe("Hello");
  });

  test("strips quotes and commas around base64 (LLM / markdown noise)", () => {
    const core = Buffer.from("hello").toString("base64");
    const u = `data:application/octet-stream;base64,",${core}",`;
    const buf = dataUrlToArrayBuffer(u);
    expect(new TextDecoder().decode(buf)).toBe("hello");
  });

  test("normalizes stray leading/trailing = around payload", () => {
    const u = "data:application/octet-stream;base64,=SGVsbG8=";
    const buf = dataUrlToArrayBuffer(u);
    expect(new TextDecoder().decode(buf)).toBe("Hello");
  });
});
