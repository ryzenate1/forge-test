import { fetchJSON, postJSON } from "./http";

export type PlacementRequest = {
  serverId?: string;
  memory?: number;
  cpu?: number;
  disk?: number;
  constraints?: Array<{ type: string; key: string; operator: string; values: string[]; required?: boolean }>;
};

export type EnrichedPlacement = {
  request: PlacementRequest;
  envGroup?: string;
  constraints: Array<{ type: string; key: string; operator: string; values: string[]; required: boolean }>;
};

export type ExplainResult = {
  nodeId: string;
  satisfies: boolean;
  reasons: string[];
  constraints: unknown[];
};

function unwrap<T>(data: unknown): T {
  if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export async function explainPlacement(nodeId: string, place: PlacementRequest): Promise<ExplainResult> {
  const res = await postJSON<ExplainResult | { data: ExplainResult }>("/placement/explain", { nodeId, place });
  return unwrap<ExplainResult>(res);
}

export async function enrichPlacement(place: PlacementRequest): Promise<EnrichedPlacement> {
  const res = await postJSON<EnrichedPlacement | { data: EnrichedPlacement }>("/placement/enrich", place);
  return unwrap<EnrichedPlacement>(res);
}

export async function patchConstraints(): Promise<unknown> {
  const res = await postJSON<unknown | { data: unknown }>("/placement/patch-constraints", {});
  return unwrap<unknown>(res);
}
