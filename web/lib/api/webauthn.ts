import { getCSRFToken } from "@/lib/csrf";

export type WebAuthnCredential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string;
};

export type CredentialCreation = unknown;
export type CredentialAssertion = unknown;

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

export async function beginRegistration(): Promise<{ creation: CredentialCreation; sessionId: string }> {
  return api<{ creation: CredentialCreation; sessionId: string }>("/api/proxy/auth/webauthn/register/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({}),
  });
}

export async function finishRegistration(sessionId: string, credential: unknown): Promise<void> {
  // Backend expects raw body plus sessionId; we send JSON with sessionId and credential
  const body = typeof credential === "string" ? credential : JSON.stringify({ sessionId, ...(credential as object) });
  // Handlers read c.Body() directly, so we need to send raw attestation JSON
  // The handler extracts sessionId from JSON and then reads c.Body() as raw
  // For browser WebAuthn, we need to forward the authenticator response
  await api<void>("/api/proxy/auth/webauthn/register/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body,
  });
}

export async function beginLogin(): Promise<{ assertion: CredentialAssertion; sessionId: string }> {
  return api<{ assertion: CredentialAssertion; sessionId: string }>("/api/proxy/auth/webauthn/login/begin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({}),
  });
}

export async function finishLogin(sessionId: string, userId: string, credential: unknown): Promise<void> {
  const body = typeof credential === "string" ? credential : JSON.stringify({ sessionId, userId, ...(credential as object) });
  await api<void>("/api/proxy/auth/webauthn/login/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body,
  });
}

export async function listCredentials(): Promise<WebAuthnCredential[]> {
  const data = await api<WebAuthnCredential[] | { data: WebAuthnCredential[] }>("/api/proxy/account/webauthn/credentials");
  if (Array.isArray(data)) return data;
  return unwrap<WebAuthnCredential[]>(data);
}

export async function removeCredential(id: string): Promise<void> {
  await api<void>(`/api/proxy/account/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}
