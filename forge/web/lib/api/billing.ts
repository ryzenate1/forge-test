import { fetchJSON, postJSON, putJSON, deleteJSON } from "./http";

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  centsPerMonth: number;
  entitlements: unknown;
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

export type BillingWebhookReceipt = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: string;
  gotAt: string;
};

export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  const res = await fetchJSON<{ data: BillingPlan[] } | BillingPlan[]>("/billing/plans");
  if (Array.isArray(res)) return res;
  return (res as { data: BillingPlan[] }).data ?? [];
}

export async function fetchBillingPlanByCode(code: string): Promise<BillingPlan> {
  const res = await fetchJSON<{ data: BillingPlan } | BillingPlan>(`/billing/plans/${encodeURIComponent(code)}`);
  const maybeData = (res as { data: BillingPlan }).data;
  return maybeData ?? (res as BillingPlan);
}

export async function createBillingPlan(input: {
  code: string;
  name: string;
  centsPerMonth: number;
  entitlements?: unknown;
  trialDays?: number;
  active?: boolean;
}): Promise<BillingPlan> {
  const res = await postJSON<{ data: BillingPlan } | BillingPlan>("/billing/plans", {
    code: input.code,
    name: input.name,
    centsPerMonth: input.centsPerMonth,
    entitlements: input.entitlements ?? {},
    trialDays: input.trialDays ?? 0,
    active: input.active ?? true,
  });
  const maybeData = (res as { data: BillingPlan }).data;
  return maybeData ?? (res as BillingPlan);
}

export async function updateBillingPlan(
  id: string,
  patch: { name?: string; centsPerMonth?: number; entitlements?: unknown; trialDays?: number; active?: boolean },
): Promise<BillingPlan> {
  const res = await putJSON<{ data: BillingPlan } | BillingPlan>(`/billing/plans/${encodeURIComponent(id)}`, {
    name: patch.name,
    centsPerMonth: patch.centsPerMonth,
    entitlements: patch.entitlements,
    trialDays: patch.trialDays,
    active: patch.active,
  });
  const maybeData = (res as { data: BillingPlan }).data;
  return maybeData ?? (res as BillingPlan);
}

export async function deleteBillingPlan(id: string): Promise<{ ok: boolean }> {
  return deleteJSON<{ ok: boolean }>(`/billing/plans/${encodeURIComponent(id)}`);
}

export async function fetchOrgQuota(orgId: string): Promise<OrgQuota> {
  const res = await fetchJSON<{ data: OrgQuota } | OrgQuota>(`/billing/org/${encodeURIComponent(orgId)}/quota`);
  const maybeData = (res as { data: OrgQuota }).data;
  return maybeData ?? (res as OrgQuota);
}

export async function setOrgPlan(orgId: string, planCode: string, trial = false): Promise<OrgQuota> {
  const res = await postJSON<{ data: OrgQuota } | OrgQuota>(`/billing/org/${encodeURIComponent(orgId)}/plan`, {
    planCode,
    trial,
  });
  const maybeData = (res as { data: OrgQuota }).data;
  return maybeData ?? (res as OrgQuota);
}

export type UsageSummary = {
  plan: string;
  servers: number;
  memoryBytes: number;
  storageBytes: number;
  environments: number;
  nodes: number;
  meterEvents: number;
  // allow extra fields from API without breaking
  [key: string]: unknown;
};

export async function fetchOrgUsage(orgId: string): Promise<UsageSummary> {
  const res = await fetchJSON<{ data: UsageSummary } | UsageSummary>(`/billing/org/${encodeURIComponent(orgId)}/usage`);
  return (res as { data: UsageSummary }).data ?? (res as UsageSummary);
}

export async function fetchOrgUsageEvents(orgId: string, since?: string, limit = 100): Promise<UsageEvent[]> {
  const q = new URLSearchParams();
  if (since) q.set("since", since);
  q.set("limit", String(limit));
  const res = await fetchJSON<{ data: UsageEvent[] } | UsageEvent[]>(
    `/billing/org/${encodeURIComponent(orgId)}/usage-events?${q.toString()}`,
  );
  if (Array.isArray(res)) return res;
  return (res as { data: UsageEvent[] }).data ?? [];
}

export async function recordBillingUsage(orgId: string, resource: string, quantity: number): Promise<unknown> {
  return postJSON<unknown>("/billing/usage", { orgId, resource, quantity });
}

export async function fetchBillingSettings(): Promise<BillingSettings> {
  const res = await fetchJSON<{ data: BillingSettings } | BillingSettings>("/billing/settings");
  const maybeData = (res as { data: BillingSettings }).data;
  return maybeData ?? (res as BillingSettings);
}

export async function updateBillingSettings(input: {
  webhookSecret?: string;
  externalProcessor?: string;
  clearWebhookSecret?: boolean;
}): Promise<BillingSettings> {
  const res = await putJSON<{ data: BillingSettings } | BillingSettings>("/billing/settings", input);
  const maybeData = (res as { data: BillingSettings }).data;
  return maybeData ?? (res as BillingSettings);
}

export async function sendBillingWebhookTest(input: { provider?: string; eventId: string; eventType?: string; payload?: unknown }): Promise<BillingWebhookReceipt> {
  // Public webhook is HMAC-verified; this helper is for admin to test via the same path using an explicit header.
  // In production the HMAC secret must already be configured; otherwise the call will 401.
  const headers: Record<string, string> = {
    "X-Billing-Event-Id": input.eventId,
  };
  if (input.provider) headers["X-Billing-Provider"] = input.provider;
  if (input.eventType) headers["X-Billing-Event-Type"] = input.eventType;
  const res = await fetchJSON<{ data: BillingWebhookReceipt } | BillingWebhookReceipt>("/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input.payload ?? { type: input.eventType ?? "test", test: true }),
  });
  const maybeData = (res as { data: BillingWebhookReceipt }).data;
  return maybeData ?? (res as BillingWebhookReceipt);
}
