"use client";

import { useState } from "react";
import { OfflineBanner } from "@/components/shared/states-offline";
import { AdminCard, AdminPageLayout } from "@/components/admin/admin-layout";
import * as api from "@/lib/api/envaffinity";
import { sanitizeError } from "@/lib/sanitize";

export function EnvAffinityManager() {
  const [nodeId, setNodeId] = useState("");
  const [serverId, setServerId] = useState("");
  const [explain, setExplain] = useState<api.ExplainResult | null>(null);
  const [enriched, setEnriched] = useState<api.EnrichedPlacement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleExplain() {
    if (!nodeId.trim()) {
      setError("nodeId required");
      return;
    }
    setError(null);
    try {
      const res = await api.explainPlacement(nodeId.trim(), { serverId: serverId.trim() || undefined });
      setExplain(res);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Explain failed"));
    }
  }

  async function handleEnrich() {
    setError(null);
    try {
      const res = await api.enrichPlacement({ serverId: serverId.trim() || undefined });
      setEnriched(res);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Enrich failed"));
    }
  }

  async function handlePatch() {
    setError(null);
    try {
      const res = await api.patchConstraints();
      setSuccess(`Patched: ${JSON.stringify(res)}`);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Patch failed"));
    }
  }

  return (
    <AdminPageLayout
      title="Env Affinity"
      description="Phase 6 placement env-affinity: nodes.labels (JSONB) + nodes.env_groups (migration 190) injected into placement.ConstraintContext. Servers with servers.env_affinity get hard env_group label constraints. Viewer: POST /placement/explain, Enricher: POST /placement/enrich, Patch: POST /placement/patch-constraints (needs PredictiveScorer, else 503)."
      breadcrumbs={[{ label: "Admin", href: "/admin/env-affinity" }, { label: "Env Affinity" }]}
    >
      <OfflineBanner onRetry={() => { /* no single loader — individual actions retry */ }} />
      <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[11px] text-[var(--text-subtle)]">
        <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
        <span>env-affinity</span>
        <span className="text-[var(--text-subtle)]">::</span>
        <span className="text-[var(--brand)]">placement</span>
        <span className="ml-auto hidden sm:inline uppercase tracking-widest text-[var(--text-subtle)]">var(--brand) var(--canvas) var(--surface) var(--line)</span>
      </div>
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.09] p-4 text-sm text-red-200">
          <span>{error}</span> <button onClick={() => setError(null)} className="rounded px-2 py-1 text-xs underline hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Dismiss</button>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.09] p-4 text-sm text-emerald-200">
          <span>{success}</span> <button onClick={() => setSuccess(null)} className="rounded px-2 py-1 text-xs underline hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Dismiss</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Affinity Viewer" description="POST /placement/explain {nodeId, place: PlacementRequest} → ExplainResult walkthrough: why node won/lost.">
          <div className="space-y-3">
            <input value={nodeId} onChange={(e) => setNodeId(e.target.value)} placeholder="nodeId" className="w-full rounded border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
            <input value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="serverId (optional) or env hint" className="w-full rounded border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
            <button onClick={() => void handleExplain()} className="rounded bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white">Explain Placement</button>
            {explain && (
              <div className="rounded-lg border border-[var(--line)] bg-surface p-3 text-xs">
                <p className="font-bold">Node {explain.nodeId} · satisfies: {String(explain.satisfies)}</p>
                {explain.reasons?.length ? (
                  <ul className="mt-2 list-disc pl-5 text-[var(--text-subtle)]">
                    {explain.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--text-subtle)]">No reasons.</p>
                )}
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-[var(--surface-input)] p-2 font-mono text-[11px]">{JSON.stringify(explain.constraints ?? explain, null, 2)}</pre>
              </div>
            )}
          </div>
        </AdminCard>

        <AdminCard title="Enricher & Patch" description="POST /placement/enrich resolves env_group hard constraint from server env_affinity or WithEnv hint. POST /placement/patch-constraints re-syncs affinity rules into PredictiveScorer.">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="serverId for enrich" className="flex-1 rounded border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
              <button onClick={() => void handleEnrich()} className="rounded bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white">Enrich</button>
            </div>
            {enriched && (
              <div className="rounded-lg border border-[var(--line)] bg-surface p-3 text-xs">
                <p className="font-bold">EnvGroup: {enriched.envGroup || "—"}</p>
                <p className="text-[var(--text-subtle)]">Constraints: {enriched.constraints.length ? JSON.stringify(enriched.constraints) : "none (no env pinning)"}</p>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-[var(--surface-input)] p-2 font-mono text-[11px]">{JSON.stringify(enriched, null, 2)}</pre>
              </div>
            )}
            <div className="pt-3 border-t border-[var(--line)]">
              <p className="text-xs font-bold uppercase text-[var(--text-subtle)]">Patch Constraints</p>
              <p className="text-xs text-[var(--text-subtle)]">Idempotent re-sync into PredictiveScorer. Requires scorer wired in main; otherwise 503.</p>
              <button onClick={() => void handlePatch()} className="mt-2 rounded bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white">Patch Placement Constraints</button>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-input)] p-3 text-xs text-[var(--text-subtle)]">
              <p className="font-bold text-[var(--text)]">How it works</p>
              <p>NodeLabelIndex merges nodes.labels + env_groups → synthetic env_group label. Enrich adds required placement.Constraint{`{type:label, key:env_group, operator:in, values:[env]}`}. Check via placement.ConstraintChecker.</p>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminPageLayout>
  );
}
