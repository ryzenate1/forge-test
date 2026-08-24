import { getCSRFToken } from "@/lib/csrf";

export type Release = {
  id: string;
  serverId: string;
  version: number;
  imageTag: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
};

export type HealthCheckConfig = {
  path: string;
  port: number;
  protocol: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
};

export type HealthCheckResult = {
  id: string;
  deploymentId: string;
  checkTimestamp: string;
  status: string;
  responseCode: number;
  responseTimeMs: number;
  errorMessage: string;
};

export type DeploymentEvent = {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
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

export async function createRelease(serverId: string, imageTag: string): Promise<Release> {
  return api<Release>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ imageTag }),
  });
}

export async function listReleases(serverId: string): Promise<Release[]> {
  return api<Release[]>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments`);
}

export async function getRelease(serverId: string, releaseId: string): Promise<Release> {
  return api<Release>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments/${encodeURIComponent(releaseId)}`);
}

export async function rollbackRelease(serverId: string, releaseId: string): Promise<Release> {
  return api<Release>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments/${encodeURIComponent(releaseId)}/rollback`, {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function promoteRelease(serverId: string, releaseId: string): Promise<Release> {
  return api<Release>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments/${encodeURIComponent(releaseId)}/promote`, {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function getHealthCheckConfig(serverId: string): Promise<HealthCheckConfig> {
  return api<HealthCheckConfig>(`/api/proxy/servers/${encodeURIComponent(serverId)}/health-check`);
}

export async function upsertHealthCheckConfig(serverId: string, config: HealthCheckConfig): Promise<HealthCheckConfig> {
  return api<HealthCheckConfig>(`/api/proxy/servers/${encodeURIComponent(serverId)}/health-check`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(config),
  });
}

export async function getHealthCheckResults(serverId: string, releaseId: string): Promise<HealthCheckResult[]> {
  return api<HealthCheckResult[]>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments/${encodeURIComponent(releaseId)}/health`);
}

export async function getDeploymentEvents(serverId: string, releaseId: string): Promise<DeploymentEvent[]> {
  return api<DeploymentEvent[]>(`/api/proxy/servers/${encodeURIComponent(serverId)}/deployments/${encodeURIComponent(releaseId)}/events`);
}
