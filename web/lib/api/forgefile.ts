import { getCSRFToken } from "@/lib/csrf";

export type ManifestProject = { name: string; slug: string };
export type Manifest = {
  project: ManifestProject;
  deploy: Array<{
    name: string;
    type: string;
    source: { repo: string; branch: string; root: string };
    build: { builder: string; dockerfile: string };
    ports: number[];
    env: Record<string, string>;
    resources: { cpu: string; memory: number; replicas: number };
    kind?: string;
    version?: string;
  }>;
  database?: { name: string; kind: string; version: string } | null;
  environments: string[];
};

export type ApplyResult = {
  projectSlug: string;
  projectName: string;
  version: number;
  apps: Array<{ appId: string; appName: string; serviceId: string; domain: string; url: string; status: string }>;
  links: Record<string, string>;
  warnings: string[];
  appliedAt: string;
};

export type ValidateResult = { valid: boolean; warnings: string[]; error?: string };

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
    // validation returns 400 with {valid:false}
    if (path.includes("/validate")) {
      try {
        const json = JSON.parse(text);
        return json as T;
      } catch {
        // fall through
      }
    }
    throw new Error(text || `Request failed: ${res.status}`);
  }
  const json = await res.json().catch(() => ({}));
  return json as T;
}

export async function validateForgefile(content: string): Promise<ValidateResult> {
  return api<ValidateResult>("/api/proxy/forgefile/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ content }),
  });
}

export async function applyForgefile(content: string): Promise<ApplyResult> {
  const data = await api<{ data?: ApplyResult } & ApplyResult>("/api/proxy/forgefile/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ content }),
  });
  return unwrap<ApplyResult>(data);
}

export async function listManifests(): Promise<string[]> {
  const data = await api<{ manifests: string[] } | string[]>("/api/proxy/forgefile");
  if (Array.isArray(data)) return data as string[];
  if (data && typeof data === "object" && "manifests" in (data as Record<string, unknown>)) {
    return (data as { manifests: string[] }).manifests;
  }
  return unwrap<string[]>(data);
}

export async function getManifest(slug: string): Promise<{ slug: string; version: number; updatedAt: string; manifest: Manifest }> {
  return api<{ slug: string; version: number; updatedAt: string; manifest: Manifest }>(`/api/proxy/forgefile/${encodeURIComponent(slug)}`);
}
