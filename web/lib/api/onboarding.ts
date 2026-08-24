import { getCSRFToken } from "@/lib/csrf";

export type StatusView = {
  connected: boolean;
  providers: string[];
  sourceCount: number;
  hasApps: boolean;
  templateKeys: string[];
  oauthUrl?: string;
};

export type GitProviderRepo = {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
};

export type GitProviderBranch = {
  name: string;
  commit: string;
};

export type DeployResult = {
  deploymentId: string;
  status: string;
  appId: string;
  appName: string;
  url: string;
  internalUrl: string;
  builder: string;
};

export type LoadedSource = {
  id: string;
  name: string;
  owner: string;
  branch: string;
  cloneUrl: string;
  defaultBranch: string;
  files: string[];
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
  return json as T;
}

export async function getStatus(): Promise<StatusView> {
  const data = await api<StatusView | { data: StatusView }>("/api/proxy/onboarding/status");
  return unwrap<StatusView>(data);
}

export async function listRepos(providerId?: string): Promise<GitProviderRepo[]> {
  const qs = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
  const data = await api<{ data: GitProviderRepo[] } | GitProviderRepo[]>(`/api/proxy/onboarding/repos${qs}`);
  return unwrap<GitProviderRepo[]>(data);
}

export async function listBranches(repo: string, providerId?: string): Promise<GitProviderBranch[]> {
  const qs = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
  const data = await api<{ data: GitProviderBranch[] } | GitProviderBranch[]>(`/api/proxy/onboarding/repos/${encodeURIComponent(repo)}/branches${qs}`);
  return unwrap<GitProviderBranch[]>(data);
}

export async function connect(payload: {
  provider: string;
  providerName?: string;
  accessToken: string;
  refreshToken?: string;
  baseUrl?: string;
  username?: string;
}): Promise<unknown> {
  return api<unknown>("/api/proxy/onboarding/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function deploy(payload: {
  repo: string;
  branch?: string;
  root?: string;
  buildType: string;
  dockerfile?: string;
  name?: string;
  port?: number;
  providerTokenId?: string;
}): Promise<DeployResult> {
  return api<DeployResult>("/api/proxy/onboarding/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function listLoadedSources(): Promise<LoadedSource[]> {
  const data = await api<{ data: LoadedSource[] } | LoadedSource[]>("/api/proxy/ide/files");
  return unwrap<LoadedSource[]>(data);
}
