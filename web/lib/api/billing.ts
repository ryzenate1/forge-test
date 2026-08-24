import { getCSRFToken } from "@/lib/csrf";

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  centsPerMonth: number;
  entitlements: Record<string, unknown>;
  trialDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrgQuota = {
  orgId: string;
  planCode: string;
  trialUntil?: string | null;
  memoryUsageBytes: number;
  serversCount: number;
  environmentsCount: number;
  nodesCount: number;
  storageBytes: number;
  prevPlanCode: string;
  quotaUpdatedAt: string;
};

export type UsageSummary = {
  orgId: string;
  plan: string;
  servers: number;
  memoryBytes: number;
  storageBytes: number;
  environments: number;
  nodes: number;
  meterEvents: number;
};

export type UsageEvent = {
  id: string;
  orgId: string;
  resource: string;
  quantity: number;
  kind: string;
  occurredAt: string;
};

export type BillingSettings = {
  id: boolean;
  hasWebhookSecret: boolean;
  externalProcessor: string;
  updatedAt: string;
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

export async function listBillingPlans(): Promise<BillingPlan[]> {
  return api<BillingPlan[]>("/api/proxy/billing/plans");
}

export async function getBillingPlan(code: string): Promise<BillingPlan> {
  return api<BillingPlan>(`/api/proxy/billing/plans/${encodeURIComponent(code)}`);
}

export async function createBillingPlan(payload: {
  code: string;
  name: string;
  centsPerMonth: number;
  entitlements: Record<string, unknown>;
  trialDays: number;
  active: boolean;
}): Promise<BillingPlan> {
  return api<BillingPlan>("/api/proxy/billing/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ ...payload, entitlements: payload.entitlements }),
  });
}

export async function updateBillingPlan(
  id: string,
  payload: Partial<{ name: string; centsPerMonth: number; entitlements: Record<string, unknown>; trialDays: number; active: boolean }>,
): Promise<BillingPlan> {
  return api<BillingPlan>(`/api/proxy/billing/plans/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function deleteBillingPlan(id: string): Promise<void> {
  await api<void>(`/api/proxy/billing/plans/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function getOrgQuota(orgId: string): Promise<OrgQuota> {
  return api<OrgQuota>(`/api/proxy/billing/org/${encodeURIComponent(orgId)}/quota`);
}

export async function setOrgPlan(orgId: string, planCode: string, trial = false): Promise<BillingPlan> {
  return api<BillingPlan>(`/api/proxy/billing/org/${encodeURIComponent(orgId)}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ planCode, trial }),
  });
}

export async function getOrgUsage(orgId: string): Promise<UsageSummary> {
  return api<UsageSummary>(`/api/proxy/billing/org/${encodeURIComponent(orgId)}/usage`);
}

export async function listUsageEvents(orgId: string, since?: string, limit = 100): Promise<UsageEvent[]> {
  const qs = new URLSearchParams();
  if (since) qs.set("since", since);
  if (limit) qs.set("limit", String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<UsageEvent[]>(`/api/proxy/billing/org/${encodeURIComponent(orgId)}/usage-events${suffix}`);
}

export async function recordUsage(orgId: string, resource: string, quantity: number): Promise<void> {
  await api<void>("/api/proxy/billing/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ orgId, resource, quantity }),
  });
}

export async function getBillingSettings(): Promise<BillingSettings> {
  return api<BillingSettings>("/api/proxy/billing/settings");
}

export async function updateBillingSettings(payload: {
  webhookSecret?: string;
  externalProcessor?: string;
  clearWebhookSecret?: boolean;
}): Promise<BillingSettings> {
  return api<BillingSettings>("/api/proxy/billing/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}
