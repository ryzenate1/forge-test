import { fetchJSON, postJSON } from "./http";

export type CleanupInfo = {
  staleReservations: number;
  orphanedAllocations: number;
};

export type CleanupInspectResponse = CleanupInfo & { data?: CleanupInfo } | CleanupInfo;
export type CleanupRunResponse = CleanupInfo & { data?: CleanupInfo } | CleanupInfo;

function unwrapInfo(raw: unknown): CleanupInfo {
  if (!raw || typeof raw !== "object") return { staleReservations: 0, orphanedAllocations: 0 };
  const maybeData = (raw as { data?: unknown }).data;
  const obj = (maybeData && typeof maybeData === "object" ? maybeData : raw) as Record<string, unknown>;
  const stale = typeof obj.staleReservations === "number" ? obj.staleReservations
    : typeof obj.stale_reservations === "number" ? obj.stale_reservations as number
    : typeof (obj as Record<string, unknown>).staleReservations === "number" ? (obj as Record<string, unknown>).staleReservations as number
    : 0;
  const orphaned = typeof obj.orphanedAllocations === "number" ? obj.orphanedAllocations
    : typeof obj.orphaned_allocations === "number" ? obj.orphaned_allocations as number
    : 0;
  // Also handle snake_case json from Go struct: `json:"stale_reservations_cleaned"` etc — but inspect uses staleReservations/stale_reservations
  return { staleReservations: stale, orphanedAllocations: orphaned };
}

export async function inspectCleanup(): Promise<CleanupInfo> {
  const raw = await fetchJSON<unknown>("/cleanup/inspect");
  return unwrapInfo(raw);
}

export async function runCleanup(): Promise<CleanupInfo> {
  const raw = await postJSON<unknown>("/cleanup/run", {});
  return unwrapInfo(raw);
}
