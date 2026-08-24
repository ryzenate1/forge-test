import { fetchJSON, putJSON } from "./http";

export type SFTPGlobalConfig = {
  enabled: boolean;
  defaultPort: number;
  defaultMaxConnections: number;
  defaultIdleTimeout: number;
  defaultRateLimit: number;
  logLevel: string;
  allowedCiphers?: string[];
  allowedMACs?: string[];
  allowedKexAlgos?: string[];
  hostKeyAlgorithms?: string[];
};

export type SFTPNodeConfig = {
  nodeId: string;
  enabled: boolean;
  listenPort: number;
  listenIP: string;
  maxConnections: number;
  maxAuthAttempts: number;
  idleTimeout: number;
  rateLimit: number;
  readOnly: boolean;
  allowedIps?: string[];
  banner?: string;
  logLevel: string;
  updatedAt: string;
};

export async function fetchSFTPGlobalConfig(): Promise<SFTPGlobalConfig> {
  const raw = await fetchJSON<SFTPGlobalConfig | { data: SFTPGlobalConfig }>("/admin/sftp/settings");
  const maybeData = (raw as { data: SFTPGlobalConfig }).data;
  return maybeData ?? (raw as SFTPGlobalConfig);
}

export async function updateSFTPGlobalConfig(cfg: SFTPGlobalConfig): Promise<{ ok: boolean }> {
  return putJSON<{ ok: boolean }>("/admin/sftp/settings", cfg);
}

export async function fetchSFTPNodeConfigs(): Promise<SFTPNodeConfig[]> {
  const raw = await fetchJSON<SFTPNodeConfig[] | { data: SFTPNodeConfig[] }>("/admin/sftp/nodes");
  if (Array.isArray(raw)) return raw;
  return (raw as { data: SFTPNodeConfig[] }).data ?? [];
}

export async function fetchSFTPNodeConfig(nodeId: string): Promise<SFTPNodeConfig> {
  const raw = await fetchJSON<SFTPNodeConfig | { data: SFTPNodeConfig }>(`/admin/nodes/${encodeURIComponent(nodeId)}/sftp`);
  const maybeData = (raw as { data: SFTPNodeConfig }).data;
  return maybeData ?? (raw as SFTPNodeConfig);
}

export async function updateSFTPNodeConfig(nodeId: string, cfg: SFTPNodeConfig): Promise<{ ok: boolean }> {
  // Ensure nodeId in payload matches param (store overwrites with param anyway)
  const payload = { ...cfg, nodeId };
  return putJSON<{ ok: boolean }>(`/admin/nodes/${encodeURIComponent(nodeId)}/sftp`, payload);
}
