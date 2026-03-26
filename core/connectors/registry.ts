import { telegramDriver } from "@/drivers/telegram";
import type { ConnectorDriver } from "./types";

const drivers = new Map<string, ConnectorDriver>([
  [telegramDriver.kind, telegramDriver],
]);

export function getConnectorDriver(kind: string): ConnectorDriver {
  const driver = drivers.get(kind);
  if (!driver) {
    throw new Error(`Unknown connector kind: ${kind}`);
  }
  return driver;
}
