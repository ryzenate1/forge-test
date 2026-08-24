"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, RefreshCw, Save, Trash2, Shield, Eye, EyeOff } from "lucide-react";
import {
  fetchBillingPlans,
  createBillingPlan,
  updateBillingPlan,
  deleteBillingPlan,
  fetchBillingSettings,
  updateBillingSettings,
  type BillingPlan,
} from "@/lib/api/billing";
import { useT } from "@/components/TranslationProvider";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { OfflineBanner } from "@/components/shared/states-offline";
import {
  AdminPageLayout,
  SectionHeader,
  Card,
  CardHeader,
  Btn,
  Pill,
  AdminLoadingState,
  AdminErrorState,
  EmptyState,
  Input,
  Modal,
  Textarea,
} from "./admin-ui";

export function AdminBilling() {
  const t = useT();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, renderConfirm] = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BillingPlan | null>(null);

  const plansQ = useQuery({ queryKey: ["admin-billing-plans"], queryFn: fetchBillingPlans, retry: false });
  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBillingPlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-billing-plans"] });
      toast({ tone: "success", title: "Plan deleted" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Delete failed", message: e.message }),
  });

  return (
    <AdminPageLayout>
      <OfflineBanner onRetry={() => void plansQ.refetch()} />
      <SectionHeader
        title={(t("admin.billing.title", ["Billing"]) as string) ?? "Billing"}
        sub="Billing plans, org quotas and usage metering — /billing/plans, /billing/settings, /billing/org/:id/quota (phase7_registrar.go:29). HMAC webhook receiver at POST /billing/webhook."
        action={
          <div className="flex gap-2">
            <Btn size="sm" tone="ghost" onClick={() => void plansQ.refetch()}>
              <RefreshCw size={14} /> Refresh
            </Btn>
            <Btn size="sm" tone="primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New plan
            </Btn>
          </div>
        }
      />

      <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[11px] text-[var(--text-subtle)]">
        <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
        <span>billing</span>
        <span className="text-[var(--text-subtle)]">::</span>
        <span className="text-[var(--brand)]">plans</span>
        <span className="ml-auto hidden sm:inline uppercase tracking-widest text-[var(--text-subtle)]">var(--brand) var(--canvas) var(--surface) var(--line)</span>
      </div>

      {/* Plans */}
      <Card className="border border-[var(--line)] bg-[var(--surface)]">
        <CardHeader title={`Plans — GET /billing/plans · ${plans.length}`} icon={CreditCard} />
        {plansQ.isLoading ? (
          <AdminLoadingState label="Loading billing plans…" />
        ) : plansQ.isError ? (
          <div className="p-4"><AdminErrorState message={(plansQ.error as Error).message} retry={() => void plansQ.refetch()} /></div>
        ) : plans.length === 0 ? (
          <EmptyState icon={CreditCard} title="No billing plans" message="No plans yet — create one to start selling tiers." />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold text-[var(--text)]">{plan.name}</div>
                    <div className="font-mono text-[11px] text-[var(--brand)]">{plan.code}</div>
                  </div>
                  <Pill tone={plan.active ? "green" : "red"}>{plan.active ? "active" : "inactive"}</Pill>
                </div>
                <div className="mt-3">
                  <div className="font-mono text-lg font-bold text-[var(--text)]">
                    ${(plan.centsPerMonth / 100).toFixed(2)} <span className="text-xs font-normal text-[var(--text-subtle)]">/ month</span>
                  </div>
                  {plan.trialDays ? <div className="text-xs text-[var(--text-subtle)]">{plan.trialDays} trial days</div> : null}
                </div>
                <div className="mt-3 rounded-lg border border-[var(--line)] bg-black/20 p-2">
                  <div className="text-[11px] uppercase tracking-widest text-[var(--text-subtle)]">Entitlements</div>
                  <pre className="mt-1 max-h-24 overflow-auto font-mono text-[11px] leading-5 text-[var(--text-subtle)]">{JSON.stringify(plan.entitlements, null, 2)}</pre>
                </div>
                <div className="mt-3 flex gap-2">
                  <Btn size="sm" tone="ghost" onClick={() => setEditing(plan)}>
                    <Save size={12} /> Edit
                  </Btn>
                  <Btn
                    size="sm"
                    tone="danger"
                    loading={deleteMut.isPending && deleteMut.variables === plan.id}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({ title: `Delete ${plan.code}?`, description: `Plan ${plan.name} will be permanently removed.`, danger: true, confirmLabel: "Delete" });
                        if (ok) deleteMut.mutate(plan.id);
                      })();
                    }}
                  >
                    <Trash2 size={12} /> Delete
                  </Btn>
                </div>
                <div className="mt-2 font-mono text-[11px] text-[var(--text-subtle)]">{new Date(plan.updatedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-[var(--line)] p-3 text-xs leading-5 text-[var(--text-subtle)]">
          Admin: <code className="rounded bg-white/[0.06] px-1 font-mono text-[11px]">POST /billing/plans</code> ·{" "}
          <code className="font-mono text-[11px]">PUT /billing/plans/:id</code> ·{" "}
          <code className="font-mono text-[11px]">DELETE /billing/plans/:id</code> · Org:{" "}
          <code className="font-mono text-[11px]">GET /billing/org/:orgID/quota</code> ·{" "}
          <code className="font-mono text-[11px]">GET /billing/org/:orgID/usage</code> ·{" "}
          <code className="font-mono text-[11px]">POST /billing/usage</code>
        </div>
      </Card>

      {/* Webhook HMAC config */}
      <BillingSettingsCard />

      {showCreate && <PlanModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); void qc.invalidateQueries({ queryKey: ["admin-billing-plans"] }); }} />}
      {editing && <PlanModal plan={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ["admin-billing-plans"] }); }} />}

      {renderConfirm()}
    </AdminPageLayout>
  );
}

function BillingSettingsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-billing-settings"], queryFn: fetchBillingSettings, retry: false });
  const [secret, setSecret] = useState("");
  const [processor, setProcessor] = useState("");
  const [reveal, setReveal] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // hydrate processor once
  useMemo(() => {
    if (q.data && !initialized) {
      setProcessor(q.data.externalProcessor ?? "none");
      setInitialized(true);
    }
  }, [q.data, initialized]);

  const saveMut = useMutation({
    mutationFn: () => {
      const trimmedSecret = secret.trim();
      if (trimmedSecret && trimmedSecret.length < 16) throw new Error("webhookSecret must be at least 16 characters");
      return updateBillingSettings({
        webhookSecret: trimmedSecret || undefined,
        externalProcessor: processor.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-billing-settings"] });
      setSecret("");
      toast({ tone: "success", title: "Billing settings saved" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Save failed", message: e.message }),
  });

  const clearMut = useMutation({
    mutationFn: () => updateBillingSettings({ clearWebhookSecret: true, externalProcessor: processor.trim() || "none" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-billing-settings"] });
      toast({ tone: "success", title: "Webhook secret cleared" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Clear failed", message: e.message }),
  });

  return (
    <Card className="border border-[var(--line)] bg-[var(--surface)]">
      <CardHeader title="Settings — GET /billing/settings · HMAC webhook" icon={Shield} action={q.data ? <Pill tone={q.data.hasWebhookSecret ? "green" : "yellow"}>{q.data.hasWebhookSecret ? "secret set" : "no secret"}</Pill> : null} />
      {q.isLoading ? <AdminLoadingState label="Loading billing settings…" /> : q.isError ? <div className="p-4"><AdminErrorState message={(q.error as Error).message} retry={() => void q.refetch()} /></div> : q.data ? (
        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-200">
            Webhook receiver (<code className="font-mono text-xs">POST /billing/webhook</code>) is public and <span className="font-semibold">HMAC-verified</span>. Without a secret every provider delivery fails (audit F-HIGH-3). The secret is write-only over the API — reads return only <code className="font-mono text-xs">hasWebhookSecret</code>.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Webhook secret (≥16 chars, write-only)
                <button aria-label={reveal ? "Hide secret" : "Reveal secret"} type="button" onClick={() => setReveal((v) => !v)} className="rounded p-1 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                  {reveal ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                </button>
              </span>
              <input
                autoComplete="new-password"
                aria-label="Webhook secret"
                className="h-10 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-sm"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={q.data.hasWebhookSecret ? "•••••••••••••••• (leave blank to keep)" : "set a 16+ char secret"}
                type={reveal ? "text" : "password"}
              />
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">Stored as write-only; clear to remove. Min 16 chars.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">External processor</span>
              <select className="h-10 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-sm" value={processor} onChange={(e) => setProcessor(e.target.value)}>
                <option value="none">none</option>
                <option value="stripe">stripe</option>
                <option value="generic">generic</option>
              </select>
              <span className="mt-1 block text-xs text-[var(--text-subtle)]">Updated: {new Date(q.data.updatedAt).toLocaleString()}</span>
            </label>
          </div>

          {saveMut.isError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{(saveMut.error as Error).message}</div>}

          <div className="flex flex-wrap gap-2">
            <Btn size="sm" tone="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Save size={12} /> Save settings
            </Btn>
            {q.data.hasWebhookSecret && (
              <Btn size="sm" tone="danger" loading={clearMut.isPending} onClick={() => clearMut.mutate()}>
                <Trash2 size={12} /> Clear secret
              </Btn>
            )}
            <Btn size="sm" tone="ghost" onClick={() => void q.refetch()}>
              <RefreshCw size={12} /> Reload
            </Btn>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-3 text-xs leading-5 text-[var(--text-subtle)]">
            Webhook headers: <code className="font-mono">X-Billing-Signature</code> (or <code className="font-mono">X-Hub-Signature-256</code>),{" "}
            <code className="font-mono">X-Billing-Provider</code>, <code className="font-mono">X-Billing-Event-Id</code> (required),{" "}
            <code className="font-mono">X-Billing-Event-Type</code>. Body is verified via <code className="font-mono">HMAC-SHA256</code>.
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PlanModal({ plan, onClose, onDone }: { plan?: BillingPlan; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [cents, setCents] = useState(String(plan?.centsPerMonth ?? 0));
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? 0));
  const [active, setActive] = useState(plan?.active ?? true);
  const [entitlements, setEntitlements] = useState(() => {
    if (!plan) return '{\n  "max_servers": 10,\n  "max_memory_gb": 32,\n  "features": []\n}';
    try { return JSON.stringify(plan.entitlements, null, 2); } catch { return "{}"; }
  });

  const createMut = useMutation({
    mutationFn: () => {
      let ent: unknown = {};
      if (entitlements.trim()) {
        try { ent = JSON.parse(entitlements); } catch { throw new Error("Entitlements must be valid JSON"); }
      }
      if (plan) {
        return updateBillingPlan(plan.id, {
          name: name.trim() || undefined,
          centsPerMonth: cents.trim() ? Number(cents) : undefined,
          trialDays: trialDays.trim() ? Number(trialDays) : undefined,
          active,
          entitlements: ent,
        });
      }
      return createBillingPlan({
        code: code.trim(),
        name: name.trim(),
        centsPerMonth: Number(cents) || 0,
        trialDays: Number(trialDays) || 0,
        active,
        entitlements: ent,
      });
    },
    onSuccess: () => {
      toast({ tone: "success", title: plan ? "Plan updated" : "Plan created" });
      onDone();
    },
    onError: (e: Error) => toast({ tone: "error", title: "Save failed", message: e.message }),
  });

  return (
    <Modal title={plan ? `Edit plan — ${plan.code}` : "Create billing plan — POST /billing/plans"} onClose={onClose}>
      <div className="space-y-4">
        {!plan && <Input label="Code (unique, e.g. pro, free)" value={code} onChange={setCode} placeholder="pro" mono required />}
        <Input label="Name" value={name} onChange={setName} placeholder="Pro Plan" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Cents per month" value={cents} onChange={setCents} type="number" mono />
          <Input label="Trial days" value={trialDays} onChange={setTrialDays} type="number" mono />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--brand)]" /> Active
        </label>
        <Textarea label="Entitlements (JSON)" value={entitlements} onChange={setEntitlements} rows={6} placeholder='{"max_servers": 10}' />
        {createMut.isError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{(createMut.error as Error).message}</div>}
        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" loading={createMut.isPending} onClick={() => createMut.mutate()}>{plan ? "Save" : "Create"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
