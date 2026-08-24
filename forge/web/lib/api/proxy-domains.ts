import { fetchJSON, postJSON, putJSON, deleteJSON } from "./http";

export type ProxyDomain = {
  id: string;
  hostname: string;
  serviceId?: string;
  serviceType?: string;
  https: boolean;
  port: number;
  certType?: string;
  certData?: string;
  certKey?: string;
  autoRenew?: boolean;
  path?: string;
  stripPath?: boolean;
  forwardAuthUrl?: string;
  websocket?: boolean;
  rateLimit?: number;
  rateLimitBurst?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateProxyDomainInput = {
  hostname: string;
  port?: number;
  path?: string;
  stripPath?: boolean;
  certType?: string;
  autoRenew?: boolean;
  forwardAuthUrl?: string;
  websocket?: boolean;
  rateLimit?: number;
  rateLimitBurst?: number;
};

export function fetchServerProxyDomains(serverId: string): Promise<ProxyDomain[]> {
  return fetchJSON<ProxyDomain[]>(`/servers/${encodeURIComponent(serverId)}/proxy-domains`);
}

export function createServerProxyDomain(serverId: string, input: CreateProxyDomainInput): Promise<ProxyDomain> {
  return postJSON<ProxyDomain>(`/servers/${encodeURIComponent(serverId)}/proxy-domains`, input);
}

export function fetchServerProxyDomain(serverId: string, domainId: string): Promise<ProxyDomain> {
  return fetchJSON<ProxyDomain>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}`);
}

export function updateServerProxyDomain(serverId: string, domainId: string, input: Partial<CreateProxyDomainInput>): Promise<ProxyDomain> {
  return putJSON<ProxyDomain>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}`, input);
}

export function deleteServerProxyDomain(serverId: string, domainId: string): Promise<void> {
  return deleteJSON<void>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}`);
}

export function verifyServerProxyDomain(serverId: string, domainId: string): Promise<{ id: string; hostname: string; verified: boolean }> {
  return postJSON<{ id: string; hostname: string; verified: boolean }>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}/verify`, {});
}

// Admin-scoped proxy domains (mirrors handlers_proxy_domains.go /domains)
export function fetchAdminProxyDomains(filter?: { serviceId?: string; serviceType?: string; limit?: number; offset?: number }): Promise<ProxyDomain[]> {
  const params = new URLSearchParams();
  if (filter?.serviceId) params.set("serviceId", filter.serviceId);
  if (filter?.serviceType) params.set("serviceType", filter.serviceType);
  if (filter?.limit) params.set("limit", String(filter.limit));
  if (filter?.offset) params.set("offset", String(filter.offset));
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchJSON<{ data: ProxyDomain[] }>(`/domains${q}`).then((r) => {
    if (Array.isArray(r as unknown as ProxyDomain[])) return r as unknown as ProxyDomain[];
    return (r as { data: ProxyDomain[] }).data ?? [];
  });
}

export function createAdminProxyDomain(input: CreateProxyDomainInput & { serviceId?: string; serviceType?: string; certData?: string; certKey?: string }): Promise<ProxyDomain> {
  return postJSON<{ data: ProxyDomain }>("/domains", input).then((r) => r.data);
}

export function fetchAdminProxyDomain(id: string): Promise<ProxyDomain> {
  return fetchJSON<{ data: ProxyDomain }>(`/domains/${encodeURIComponent(id)}`).then((r) => r.data);
}

export function updateAdminProxyDomain(id: string, input: Partial<CreateProxyDomainInput>): Promise<ProxyDomain> {
  return putJSON<{ data: ProxyDomain }>(`/domains/${encodeURIComponent(id)}`, input).then((r) => r.data);
}

export function deleteAdminProxyDomain(id: string): Promise<void> {
  return deleteJSON<void>(`/domains/${encodeURIComponent(id)}`);
}
