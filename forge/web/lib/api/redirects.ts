import { fetchJSON, postJSON, putJSON, deleteJSON } from "./http";

export type RedirectRule = {
  id: string;
  domainId: string;
  sourcePath: string;
  targetUrl: string;
  statusCode: number;
  regex?: boolean;
  preservePath?: boolean;
  enabled?: boolean;
  priority?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateRedirectInput = {
  sourcePath: string;
  targetUrl: string;
  statusCode: number;
  regex?: boolean;
  preservePath?: boolean;
  enabled?: boolean;
  priority?: number;
};

// Admin scoped redirects (handlers_proxy_domains.go /domains/:domainId/redirects)
export function fetchRedirects(domainId: string): Promise<RedirectRule[]> {
  return fetchJSON<{ data: RedirectRule[] }>(`/domains/${encodeURIComponent(domainId)}/redirects`).then((r) => {
    if (Array.isArray(r as unknown as RedirectRule[])) return r as unknown as RedirectRule[];
    return (r as { data: RedirectRule[] }).data ?? [];
  });
}

export function createRedirect(domainId: string, input: CreateRedirectInput): Promise<RedirectRule> {
  return postJSON<{ data: RedirectRule }>(`/domains/${encodeURIComponent(domainId)}/redirects`, { ...input, domainId }).then((r) => r.data);
}

export function updateRedirect(domainId: string, redirectId: string, input: Partial<CreateRedirectInput>): Promise<RedirectRule> {
  return putJSON<{ data: RedirectRule }>(`/domains/${encodeURIComponent(domainId)}/redirects/${encodeURIComponent(redirectId)}`, input).then((r) => r.data);
}

export function deleteRedirect(domainId: string, redirectId: string): Promise<void> {
  return deleteJSON<void>(`/domains/${encodeURIComponent(domainId)}/redirects/${encodeURIComponent(redirectId)}`);
}

// Server scoped redirects (handlers_user_web.go /servers/:id/proxy-domains/:domainId/redirects)
export function fetchServerRedirects(serverId: string, domainId: string): Promise<RedirectRule[]> {
  return fetchJSON<RedirectRule[]>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}/redirects`);
}

export function createServerRedirect(serverId: string, domainId: string, input: CreateRedirectInput): Promise<RedirectRule> {
  return postJSON<RedirectRule>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}/redirects`, { ...input, domainId });
}

export function updateServerRedirect(serverId: string, domainId: string, redirectId: string, input: Partial<CreateRedirectInput>): Promise<RedirectRule> {
  return putJSON<RedirectRule>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}/redirects/${encodeURIComponent(redirectId)}`, input);
}

export function deleteServerRedirect(serverId: string, domainId: string, redirectId: string): Promise<void> {
  return deleteJSON<void>(`/servers/${encodeURIComponent(serverId)}/proxy-domains/${encodeURIComponent(domainId)}/redirects/${encodeURIComponent(redirectId)}`);
}
