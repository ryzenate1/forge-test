import { getCSRFToken } from "@/lib/csrf";

export type PanelMailSettings = {
  driver: string;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: string;
  smtpUsername: string;
  smtpPassword: string;
  mailFromAddress: string;
  mailFromName: string;
};

export type MailTrigger = {
  event: string;
  template: string;
  label: string;
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

export async function getMailSettings(): Promise<PanelMailSettings> {
  const data = await api<PanelMailSettings | { data?: PanelMailSettings }>("/api/proxy/admin/mail/settings");
  // handlers return raw settings, not wrapped in data
  if (data && typeof data === "object" && "smtpHost" in (data as Record<string, unknown>)) {
    return data as PanelMailSettings;
  }
  return unwrap<PanelMailSettings>(data);
}

export async function updateMailSettings(settings: PanelMailSettings): Promise<void> {
  await api<void>("/api/proxy/admin/mail/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(settings),
  });
}

export async function testMail(recipient: string): Promise<{ ok: boolean; message?: string }> {
  return api<{ ok: boolean; message?: string }>("/api/proxy/admin/mail/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({ recipient }),
  });
}

export async function listMailTriggers(): Promise<MailTrigger[]> {
  const data = await api<{ triggers: MailTrigger[] }>("/api/proxy/admin/mail/triggers");
  if (data && Array.isArray((data as unknown as { triggers: MailTrigger[] }).triggers)) {
    return (data as unknown as { triggers: MailTrigger[] }).triggers;
  }
  return unwrap<MailTrigger[]>(data);
}
