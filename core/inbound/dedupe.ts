/**
 * Best-effort in-process dedupe for at-least-once queue delivery.
 * In production, use a DB unique constraint on (installationId, externalEventId).
 */
const seen = new Set<string>();

export function tryMarkProcessed(dedupeKey: string): boolean {
  if (seen.has(dedupeKey)) {
    return false;
  }
  seen.add(dedupeKey);
  return true;
}
