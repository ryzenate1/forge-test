"use client";

import { useEffect, useState } from "react";
import { AdminCard, AdminPageLayout } from "@/components/admin/admin-layout";
import * as mail from "@/lib/api/mail";
import { sanitizeError } from "@/lib/sanitize";

export function MailManager() {
  const [settings, setSettings] = useState<mail.PanelMailSettings>({
    driver: "smtp",
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "tls",
    smtpUsername: "",
    smtpPassword: "",
    mailFromAddress: "noreply@example.com",
    mailFromName: "Forge",
  });
  const [triggers, setTriggers] = useState<mail.MailTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        mail.getMailSettings().catch(() => null),
        mail.listMailTriggers().catch(() => [] as mail.MailTrigger[]),
      ]);
      if (s && typeof s === "object" && "smtpHost" in s) {
        // mask shows as ********** ; keep as-is but allow editing
        setSettings({
          driver: s.driver || "smtp",
          smtpHost: s.smtpHost || "",
          smtpPort: s.smtpPort || 587,
          smtpEncryption: s.smtpEncryption || "tls",
          smtpUsername: s.smtpUsername || "",
          smtpPassword: s.smtpPassword || "",
          mailFromAddress: s.mailFromAddress || "",
          mailFromName: s.mailFromName || "",
        });
      }
      setTriggers(t);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Failed to load mail settings"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(null);
    // If password is masked, keep original by sending masked value — backend preserves it
    try {
      await mail.updateMailSettings(settings);
      setSuccess("Mail settings saved");
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Save failed"));
    }
  }

  async function handleTest() {
    if (!testRecipient.trim()) {
      setError("Recipient required");
      return;
    }
    setError(null);
    try {
      await mail.testMail(testRecipient.trim());
      setSuccess(`Test email queued for ${testRecipient}`);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Test failed"));
    }
  }

  return (
    <AdminPageLayout
      title="Mail Settings"
      description="Panel SMTP configuration (GET/PUT /admin/mail/settings) and test delivery. Driver 'log' bypasses SMTP validation. Password is write-only; reads return a masked placeholder that preserves the stored value when echoed back."
      breadcrumbs={[{ label: "Admin", href: "/admin/mail" }, { label: "Mail" }]}
    >
      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-wash p-4 text-sm text-red-dark">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-700">
          {success} <button onClick={() => setSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="SMTP Configuration" description="Validated via mail.ValidateSettings: host required, port 1-65535, mail from must be valid address, encryption none|tls|ssl.">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase text-muted">Driver</label>
                  <select value={settings.driver} onChange={(e) => setSettings({ ...settings, driver: e.target.value })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm">
                    <option value="smtp">smtp</option>
                    <option value="log">log</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted">Encryption</label>
                  <select value={settings.smtpEncryption} onChange={(e) => setSettings({ ...settings, smtpEncryption: e.target.value })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm">
                    <option value="none">none</option>
                    <option value="tls">tls (STARTTLS)</option>
                    <option value="ssl">ssl (SMTPS)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase text-muted">SMTP Host</label>
                  <input value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.example.com" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted">Port</label>
                  <input type="number" value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase text-muted">Username</label>
                  <input value={settings.smtpUsername} onChange={(e) => setSettings({ ...settings, smtpUsername: e.target.value })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted">Password</label>
                  <input type="password" value={settings.smtpPassword} onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })} placeholder="masked if set" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase text-muted">From Address</label>
                  <input value={settings.mailFromAddress} onChange={(e) => setSettings({ ...settings, mailFromAddress: e.target.value })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted">From Name</label>
                  <input value={settings.mailFromName} onChange={(e) => setSettings({ ...settings, mailFromName: e.target.value })} className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
                </div>
              </div>
              <button onClick={() => void handleSave()} className="rounded bg-red px-4 py-2 text-sm font-bold text-white hover:bg-red-dark">Save Settings</button>
              <button onClick={() => void load()} className="ml-2 rounded border border-line px-4 py-2 text-sm">Reload</button>
            </div>
          )}
        </AdminCard>

        <div className="space-y-6">
          <AdminCard title="Test Delivery" description="POST /admin/mail/test {recipient}. Queues via MailTriggerService worker or direct mail_outbox.">
            <div className="flex gap-2">
              <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="recipient@example.com" className="flex-1 rounded border border-line bg-paper px-3 py-2 text-sm" />
              <button onClick={() => void handleTest()} className="rounded bg-ink px-4 py-2 text-xs font-bold text-white">Send Test</button>
            </div>
            <p className="mt-2 text-xs text-muted">Sends subject “Test Email from {settings.mailFromName}” via SMTP sender with 15s timeout, TLS 1.2+, multipart alternative.</p>
          </AdminCard>

          <AdminCard title="Mail Triggers" description="GET /admin/mail/triggers — registry of server/backup/account events mapped to templates.">
            {triggers.length === 0 ? (
              <p className="text-sm text-muted">No triggers.</p>
            ) : (
              <div className="grid gap-2">
                {triggers.map((t) => (
                  <div key={t.event} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs">
                    <div>
                      <p className="font-bold text-ink">{t.label}</p>
                      <p className="font-mono text-muted">{t.event} → {t.template}</p>
                    </div>
                    <span className="rounded bg-paper px-2 py-1 text-[11px]">mail</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => void load()} className="mt-3 rounded border border-line px-3 py-1.5 text-xs">Refresh Triggers</button>
          </AdminCard>
        </div>
      </div>
    </AdminPageLayout>
  );
}
