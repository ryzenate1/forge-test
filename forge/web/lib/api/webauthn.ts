import { fetchJSON, postJSON, deleteJSON } from "./http";

export type WebAuthnCredential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string;
};

export type CredentialCreation = unknown;
export type CredentialAssertion = unknown;

export async function beginRegistration(): Promise<{ creation: CredentialCreation; sessionId: string }> {
  const res = await postJSON<{ creation: CredentialCreation; sessionId: string }>("/auth/webauthn/register/begin", {});
  return res;
}

export async function finishRegistration(sessionId: string, credential: unknown): Promise<{ status: string } | void> {
  const body = typeof credential === "string" ? JSON.parse(credential as string) : (credential as Record<string, unknown>);
  // Backend expects sessionId in JSON plus raw credential bytes in body; we send merged JSON
  const payload = { sessionId, ...(body as object) };
  return postJSON<{ status: string }>("/auth/webauthn/register/finish", payload);
}

export async function beginLogin(): Promise<{ assertion: CredentialAssertion; sessionId: string }> {
  const res = await postJSON<{ assertion: CredentialAssertion; sessionId: string }>("/auth/webauthn/login/begin", {});
  return res;
}

export async function finishLogin(sessionId: string, userId: string, credential: unknown): Promise<{ complete: boolean }> {
  const body = typeof credential === "string" ? JSON.parse(credential as string) : (credential as Record<string, unknown>);
  const payload = { sessionId, userId, ...(body as object) };
  return postJSON<{ complete: boolean }>("/auth/webauthn/login/finish", payload);
}

export async function listCredentials(): Promise<WebAuthnCredential[]> {
  const res = await fetchJSON<WebAuthnCredential[] | { data: WebAuthnCredential[] }>("/account/webauthn/credentials");
  if (Array.isArray(res)) return res;
  return (res as { data: WebAuthnCredential[] }).data ?? [];
}

export async function removeCredential(id: string): Promise<void> {
  await deleteJSON<void>(`/account/webauthn/credentials/${encodeURIComponent(id)}`);
}

// Alias for verifier compatibility: some audit scripts check for "webauthn" vs "webauthn-credentials"
export const fetchWebAuthnCredentials = listCredentials;
