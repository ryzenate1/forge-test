import { fetchJSON, postJSON } from "./http";

// Drain ledger types — mirror Go store.DrainState (migration 191)
export type DrainProgressStep = {
  name: string;
  state: string; // pending | active | done
  detail?: string;
};

export type DrainProgress = {
  state: string;
  total: number;
  remaining: number;
  current: string;
  steps: DrainProgressStep[];
};

export type DrainState = {
  nodeId: string;
  planId?: string;
  status: string; // draining | drained | cancelled | failed
  desiredFinal: boolean;
  startedAt: string;
  completedAt?: string | null;
  progress: DrainProgress;
  updatedAt: string;
};

export async function fetchDrainStates(): Promise<DrainState[]> {
  const res = await fetchJSON<{ data: DrainState[] }>("/nodes/drain");
  return res.data ?? [];
}

export async function fetchDrainState(nodeId: string): Promise<DrainState | null> {
  const res = await fetchJSON<{ data: DrainState | null }>(`/nodes/${encodeURIComponent(nodeId)}/drain`);
  // API returns { data: null } when no drain recorded (phase6DrainRoutes returns nil → {data:null})
  return (res as unknown as { data: DrainState | null }).data ?? null;
}

export async function beginDrain(
  nodeId: string,
  opts?: { desiredFinal?: boolean; planId?: string },
): Promise<DrainState> {
  const res = await postJSON<{ data: DrainState }>(`/nodes/${encodeURIComponent(nodeId)}/drain`, {
    desiredFinal: opts?.desiredFinal ?? false,
    planId: opts?.planId ?? "",
  });
  return res.data;
}

export async function cancelDrain(nodeId: string): Promise<DrainState> {
  const res = await postJSON<{ data: DrainState }>(`/nodes/${encodeURIComponent(nodeId)}/undrain`);
  return res.data;
}

// Evacuation planner preview — lightweight re-export for the center
export type EvacuationPlanPreview = {
  plan: { id: string; nodeId: string; status: string; items: unknown[] };
  items: unknown[];
  preview: boolean;
};

export async function fetchEvacuationOrphanCandidates(): Promise<
  { serverId: string; nodeId: string; status: string; storageLocality: string; replacementPolicy: string }[]
> {
  // This is derived from the planner's DetectOrphans side but surfaced via evacuation + nodes.
  // We approximate by listing nodes that are offline/unreachable and their servers — the
  // center's forensic view will join this with heartbeat lanes. No dedicated endpoint exists
  // today; return empty and let the UI derive orphans from heartbeat+server listing.
  return [];
}
