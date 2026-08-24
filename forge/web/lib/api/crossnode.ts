import { fetchJSON, postJSON } from "./http";

export type CrossNodeHealth = {
  resolver_available: boolean;
  ingress_sync_available: boolean;
  resolver_status?: string;
  ingress_sync_status?: string;
};

export type CrossNodeResolveResult = {
  host: string;
};

export type CrossNodeDescribeResult = {
  description: string;
};

export async function fetchCrossNodeHealth(): Promise<CrossNodeHealth> {
  const res = await fetchJSON<{ data: CrossNodeHealth } | CrossNodeHealth>("/admin/crossnode/health");
  const data = (res as { data: CrossNodeHealth }).data ?? (res as CrossNodeHealth);
  return data;
}

export async function resolveCrossNodeTarget(params: { serverId?: string; nodeId?: string }): Promise<CrossNodeResolveResult> {
  const q = new URLSearchParams();
  if (params.serverId) q.set("server_id", params.serverId);
  if (params.nodeId) q.set("node_id", params.nodeId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetchJSON<{ data: CrossNodeResolveResult } | CrossNodeResolveResult>(`/admin/crossnode/resolve${suffix}`);
  const data = (res as { data: CrossNodeResolveResult }).data ?? (res as CrossNodeResolveResult);
  return data;
}

export async function clearCrossNodeCache(): Promise<{ message: string }> {
  return postJSON<{ message: string }>("/admin/crossnode/cache/clear", {});
}

export async function setCrossNodeCacheTTL(ttl: string): Promise<{ message: string }> {
  return postJSON<{ message: string }>("/admin/crossnode/cache/ttl", { ttl });
}

export async function describeCrossNodeHost(host: string, port: number): Promise<CrossNodeDescribeResult> {
  const res = await fetchJSON<{ data: CrossNodeDescribeResult } | CrossNodeDescribeResult>(
    `/admin/crossnode/describe/${encodeURIComponent(host)}/${encodeURIComponent(String(port))}`,
  );
  const data = (res as { data: CrossNodeDescribeResult }).data ?? (res as CrossNodeDescribeResult);
  return data;
}

export async function fetchCrossNodeIngressRules(): Promise<unknown> {
  const res = await fetchJSON<unknown>("/admin/crossnode/ingress/rules");
  return (res as { data: unknown }).data ?? res;
}

export async function fetchCrossNodeIngressPolicies(): Promise<unknown> {
  const res = await fetchJSON<unknown>("/admin/crossnode/ingress/policies");
  return (res as { data: unknown }).data ?? res;
}

export async function triggerCrossNodeIngressSync(): Promise<{ message: string }> {
  return postJSON<{ message: string }>("/admin/crossnode/ingress/sync", {});
}

export async function fetchCrossNodeIngressHealthStats(): Promise<unknown> {
  const res = await fetchJSON<unknown>("/admin/crossnode/ingress/health/stats");
  return (res as { data: unknown }).data ?? res;
}

export async function cleanupCrossNodeIngressStale(): Promise<{ message: string }> {
  return postJSON<{ message: string }>("/admin/crossnode/ingress/cleanup", {});
}

export async function fetchCrossNodeIngressStats(): Promise<unknown> {
  const res = await fetchJSON<unknown>("/admin/crossnode/ingress/stats");
  return (res as { data: unknown }).data ?? res;
}
