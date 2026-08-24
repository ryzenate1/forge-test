"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/admin-layout";
import * as api from "@/lib/api/webauthn";
import { sanitizeError } from "@/lib/sanitize";

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return buf;
}

function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function WebAuthnManager() {
  const [creds, setCreds] = useState<api.WebAuthnCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listCredentials();
      setCreds(list);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Failed to load credentials"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  async function handleRegister() {
    setError(null);
    setSuccess(null);
    if (!supported) {
      setError("WebAuthn not supported in this browser");
      return;
    }
    try {
      const { creation, sessionId } = await api.beginRegistration();
      const cc = creation as unknown as { publicKey: PublicKeyCredentialCreationOptions & { challenge: string; user: { id: string } } };
      // Decode challenge and user id
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...cc.publicKey,
        challenge: b64urlToBuffer(cc.publicKey.challenge as unknown as string),
        user: {
          ...cc.publicKey.user,
          id: b64urlToBuffer(cc.publicKey.user.id as unknown as string),
        },
        excludeCredentials: (cc.publicKey.excludeCredentials ?? []).map(
          (c: PublicKeyCredentialDescriptor) =>
            ({
              ...c,
              id: b64urlToBuffer(c.id as unknown as string),
            }) as PublicKeyCredentialDescriptor,
        ),
      };
      const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
      if (!cred) throw new Error("No credential returned");
      const response = cred.response as AuthenticatorAttestationResponse;
      const payload = {
        id: cred.id,
        rawId: bufferToB64url(cred.rawId),
        type: cred.type,
        response: {
          attestationObject: bufferToB64url(response.attestationObject),
          clientDataJSON: bufferToB64url(response.clientDataJSON),
        },
        sessionId,
      };
      await api.finishRegistration(sessionId, payload);
      setSuccess("Passkey registered");
      await load();
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Registration failed"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this passkey?")) return;
    try {
      await api.removeCredential(id);
      setSuccess("Passkey removed");
      await load();
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Delete failed"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-ink">Passkeys (WebAuthn)</h2>
          <p className="text-xs text-muted">Register FIDO2 credentials via POST /auth/webauthn/register/begin → navigator.credentials.create → POST /auth/webauthn/register/finish. 6 routes total; credentials listed at GET /account/webauthn/credentials.</p>
        </div>
        <button onClick={() => void handleRegister()} className="rounded bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-black">
          + Register Passkey
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-wash p-3 text-sm text-red-dark">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          {success} <button onClick={() => setSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {!supported && supported !== null && <p className="text-xs text-amber-600">This browser does not support WebAuthn.</p>}

      <AdminCard title="Your Credentials" description={`${creds.length} credential(s)`}>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : creds.length === 0 ? (
          <p className="text-sm text-muted">No passkeys. Register one to enable passwordless login via POST /auth/webauthn/login/begin → navigator.credentials.get → POST /auth/webauthn/login/finish (issues session + CSRF cookies).</p>
        ) : (
          <div className="space-y-2">
            {creds.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-ink">{c.name || "Security Key"} <span className="font-mono text-xs text-muted">· {c.id.slice(0, 8)}…</span></p>
                  <p className="text-xs text-muted">Created {new Date(c.createdAt).toLocaleString()} · Last used {c.lastUsed ? new Date(c.lastUsed).toLocaleString() : "never"}</p>
                </div>
                <button onClick={() => void handleDelete(c.id)} className="rounded border border-red-300 px-3 py-1.5 text-xs font-bold text-red-dark hover:bg-red-wash">Remove</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => void load()} className="mt-3 rounded border border-line px-3 py-1.5 text-xs">Refresh</button>
      </AdminCard>

      <div className="rounded-xl border border-line bg-paper p-4 text-xs text-muted">
        <p className="font-bold text-ink">How login works (discoverable)</p>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>POST /auth/webauthn/login/begin → returns assertion + sessionId (no userId needed, uses discoverable credentials).</li>
          <li>navigator.credentials.get with the assertion.</li>
          <li>POST /auth/webauthn/login/finish with sessionId + userId + raw authenticator response body (checked &gt;64 KiB rejected). On success, server issues __Host-forge_session + __Host-forge_csrf cookies.</li>
        </ol>
      </div>
    </div>
  );
}
