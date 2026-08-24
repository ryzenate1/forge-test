import { fetchJSON, postJSON } from "./http";

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

export async function validateForgefile(content: string): Promise<ValidateResult> {
  try {
    const res = await postJSON<ValidateResult>("/forgefile/validate", { content });
    return res;
  } catch (err) {
    // Validation endpoint returns 400 with {valid:false, error:"..."} — surface that instead of throwing generic
    if (err instanceof Error && err.message.includes("valid")) {
      try {
        return JSON.parse(err.message) as ValidateResult;
      } catch {
        // fall through
      }
    }
    throw err;
  }
}

export async function applyForgefile(content: string): Promise<ApplyResult> {
  const res = await postJSON<{ data: ApplyResult } & ApplyResult>("/forgefile/apply", { content });
  return unwrap<ApplyResult>(res);
}

export async function listManifests(): Promise<string[]> {
  const res = await fetchJSON<{ manifests: string[] } | string[] | { data: string[] } | { data: { manifests: string[] } }>("/forgefile");
  if (Array.isArray(res)) return res;
  const obj = res as Record<string, unknown>;
  if (Array.isArray(obj.manifests)) return obj.manifests as string[];
  if (obj.data && Array.isArray((obj.data as Record<string, unknown>).manifests)) {
    return (obj.data as { manifests: string[] }).manifests;
  }
  if (obj.data && Array.isArray(obj.data)) return obj.data as string[];
  return unwrap<string[]>(res);
}

export async function getManifest(slug: string): Promise<{ slug: string; version: number; updatedAt: string; manifest: Manifest }> {
  const res = await fetchJSON<{ slug: string; version: number; updatedAt: string; manifest: Manifest }>(`/forgefile/${encodeURIComponent(slug)}`);
  // Handler returns { data: ... } or flat — handle both
  const maybeData = (res as unknown as { data: { slug: string; version: number; updatedAt: string; manifest: Manifest } }).data;
  if (maybeData?.slug) return maybeData;
  return unwrap<{ slug: string; version: number; updatedAt: string; manifest: Manifest }>(res);
}
