import { describe, expect, test } from "bun:test";
import { tryMarkProcessed } from "@/core/inbound/dedupe";

describe("tryMarkProcessed", () => {
  test("returns true on first key, false on repeat", () => {
    const key = `dedupe-${crypto.randomUUID()}`;
    expect(tryMarkProcessed(key)).toBe(true);
    expect(tryMarkProcessed(key)).toBe(false);
  });
});
