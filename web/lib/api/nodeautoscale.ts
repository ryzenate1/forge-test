import { getCSRFToken } from "@/lib/csrf";

export type NodeAutoscalePolicy = {
  id: string;
  name: string;
  clusterGroupId?: string;
  provider: string;
  region: string;
  instanceType: string;
  image: string;
  minNodes: number;
  maxNodes: number;
  targetCpuPercent: number;
  targetMemPercent: number;
  evaluator: string;
  autoJoin: boolean;
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NodeAutoscaleEvent = {
  id: string;
  policyId: string;
  action: string;
  direction: string;
  state: string;
  deficit: number;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type ClusterLoad = {
  activeNodes: number;
  totalCpu: number;
  allocatedCpu: number;
  totalMemMb: number;
  allocatedMemMb: number;
  loadCpu: number;
  loadMemory: number;
  loadDisk: number;
};

export type Evaluation = {
  policyId: string;
  policyName: string;
  load: ClusterLoad;
  deficit: number;
  scaleOut: boolean;
  scaleInNode?: string;
  summary: string;
  cooldown: boolean;
  dryRun: boolean;
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
  const data = await res.json().catch(() => ({}));
  return unwrap<T>(data);
}

export async function listPolicies(): Promise<NodeAutoscalePolicy[]> {
  return api<NodeAutoscalePolicy[]>("/api/proxy/autoscale/policies");
}

export async function createPolicy(payload: Partial<NodeAutoscalePolicy>): Promise<NodeAutoscalePolicy> {
  return api<NodeAutoscalePolicy>("/api/proxy/autoscale/policies", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function updatePolicy(id: string, payload: Partial<NodeAutoscalePolicy>): Promise<NodeAutoscalePolicy> {
  return api<NodeAutoscalePolicy>(`/api/proxy/autoscale/policies/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function deletePolicy(id: string): Promise<void> {
  await api<void>(`/api/proxy/autoscale/policies/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function evaluatePolicy(policyId: string, dryRun = true): Promise<Evaluation> {
  return api<Evaluation>("/api/proxy/autoscale/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ policyId, dryRun }),
  });
}

export async function scaleOut(policyId: string): Promise<NodeAutoscaleEvent> {
  return api<NodeAutoscaleEvent>("/api/proxy/autoscale/scale-out", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ policyId }),
  });
}

export async function scaleIn(nodeId: string, deprovision = false): Promise<NodeAutoscaleEvent> {
  return api<NodeAutoscaleEvent>("/api/proxy/autoscale/scale-in", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ nodeId, deprovision }),
  });
}

export async function listEvents(policyId?: string, limit = 100): Promise<NodeAutoscaleEvent[]> {
  const qs = new URLSearchParams();
  if (policyId) qs.set("policyId", policyId);
  if (limit) qs.set("limit", String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<NodeAutoscaleEvent[]>(`/api/proxy/autoscale/events${suffix}`);
}
