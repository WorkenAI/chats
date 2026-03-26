import { describe, expect, test } from "bun:test";
import { getConnectorDriver } from "@/core/connectors/registry";
import { telegramDriver } from "@/drivers/telegram";

describe("getConnectorDriver", () => {
  test("returns telegram driver", () => {
    expect(getConnectorDriver("telegram")).toBe(telegramDriver);
  });

  test("throws for unknown kind", () => {
    expect(() => getConnectorDriver("slack")).toThrow("Unknown connector kind: slack");
  });
});
