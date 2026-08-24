import { getCSRFToken } from "@/lib/csrf";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  return unwrap<T>(json);
}

export async function explainPlacement(nodeId: string, place: PlacementRequest): Promise<ExplainResult> {
  return api<ExplainResult>("/api/proxy/placement/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ nodeId, place }),
  });
}

export async function enrichPlacement(place: PlacementRequest): Promise<EnrichedPlacement> {
  return api<EnrichedPlacement>("/api/proxy/placement/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(place),
  });
}

export async function patchConstraints(): Promise<unknown> {
  return api<unknown>("/api/proxy/placement/patch-constraints", {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}
