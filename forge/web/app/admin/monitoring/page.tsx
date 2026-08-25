"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Info, RefreshCw, Search } from "lucide-react";
import { AdminPageLayout, SectionHeader, Card, CardHeader, Btn, EmptyState } from "@/components/admin/admin-ui";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { MetricsChart } from "@/components/monitoring/metrics-chart";
import { SystemMetrics } from "@/components/monitoring/system-metrics";
import { NodeList } from "@/components/monitoring/node-list";
import { getNodeMetrics, type MetricPeriod } from "@/lib/api/monitoring";
import { useRouter } from "next/navigation";

const ServerCPUChart = dynamic(() => import("@/components/charts/ServerCPUChart").then((m) => m.ServerCPUChart), { ssr: false });
const ServerMemoryChart = dynamic(() => import("@/components/charts/ServerMemoryChart").then((m) => m.ServerMemoryChart), { ssr: false });
const ServerDiskChart = dynamic(() => import("@/components/charts/ServerDiskChart").then((m) => m.ServerDiskChart), { ssr: false });
const ServerNetworkChart = dynamic(() => import("@/components/charts/ServerNetworkChart").then((m) => m.ServerNetworkChart), { ssr: false });
const ResourceUsageBar = dynamic(() => import("@/components/charts/ResourceUsageBar").then((m) => m.ResourceUsageBar), { ssr: false });
const SystemHealthGauge = dynamic(() => import("@/components/charts/SystemHealthGauge").then((m) => m.SystemHealthGauge), { ssr: false });

const PERIODS: { value: MetricPeriod; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export default function AdminMonitoring() {
  const router = useRouter();
  const [period, setPeriod] = useState<MetricPeriod>("1h");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const nodeFilter = selectedNode ?? undefined;

  // Telemetry presence probe — drives empty state distinct from Health
  const probe = useQuery({
    queryKey: ["monitoring-probe", period, nodeFilter],
    queryFn: () => getNodeMetrics({ nodeId: nodeFilter, period, limit: 1 }),
    refetchInterval: 30_000,
    retry: false,
  });
  const hasTelemetry = (probe.data?.length ?? 0) > 0;
  const isProbeLoading = probe.isLoading;

  return (
    <AdminPageLayout>
      <SectionHeader
        title="Monitoring"
        sub="What happens over time — beacon and workload telemetry over 1h / 6h / 24h / 7d / 30d. If no telemetry is reported the charts stay empty (not zero) — see note below."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selectedNode ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
                <span className="font-semibold text-slate-200">Beacon: {selectedNode.slice(0, 8)}…</span>
                <button aria-label="Clear beacon filter" className="text-slate-500 hover:text-white" onClick={() => setSelectedNode(null)} type="button">✕</button>
              </div>
            ) : null}
            <Btn tone="ghost" onClick={() => router.push("/admin/health")}><Activity size={13} /> Health</Btn>
          </div>
        }
      />

      {/* Period selector — distinct from Health which is point-in-time */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.015] p-2">
        <span className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-widest text-slate-500"><Clock size={12} /> Window</span>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${period === p.value ? "bg-[var(--brand)] text-white shadow-sm" : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"}`}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-600 sm:flex"><Search size={12} /> Pick a beacon in the list below to filter all charts</span>
      </div>

      {/* Telemetry empty state — per target-ia: unavailable if no telemetry, no fake zeros */}
      {!isProbeLoading && !hasTelemetry && !probe.isError ? (
        <Card className="border-amber-500/20 bg-amber-500/[0.04]">
          <div className="flex gap-3 p-1">
            <Info size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-sm leading-6 text-amber-200">
              <p className="font-semibold">No telemetry for {PERIODS.find((p) => p.value === period)?.label} {selectedNode ? "on this beacon" : "yet"}</p>
              <p className="text-amber-200/80">Charts stay empty until beacons report via <code className="rounded bg-black/20 px-1 font-mono text-xs">POST /monitoring/nodes/metrics</code>. Check that beacons are online (<span className="underline decoration-amber-400/40">Heartbeat healthy</span> in <button type="button" onClick={() => router.push("/admin/nodes")} className="underline">Beacons</button>) and that the agent has write access. For point-in-time failures see <button type="button" onClick={() => router.push("/admin/health")} className="underline">Health</button>.</p>
            </div>
          </div>
        </Card>
      ) : null}
      {probe.isError ? <div className="rounded-lg border border-red-500/20 bg-red-950/10 p-3 text-sm text-red-200">Telemetry probe failed: {(probe.error as Error).message} — charts may still load via their own queries.</div> : null}

      {/* Primary time-series — 4 charts share period + node filter */}
      <div className="grid gap-4 md:grid-cols-2">
        <ErrorBoundary><ServerCPUChart height={220} nodeId={nodeFilter} period={period} /></ErrorBoundary>
        <ErrorBoundary><ServerMemoryChart height={220} nodeId={nodeFilter} period={period} /></ErrorBoundary>
        <ErrorBoundary><ServerDiskChart height={220} nodeId={nodeFilter} period={period} /></ErrorBoundary>
        <ErrorBoundary><ServerNetworkChart height={220} nodeId={nodeFilter} period={period} /></ErrorBoundary>
      </div>

      {/* Secondary — resource distribution + system roll-up */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><ErrorBoundary><ResourceUsageBar height={280} /></ErrorBoundary></div>
        <ErrorBoundary><SystemHealthGauge /></ErrorBoundary>
      </div>
      <ErrorBoundary><SystemMetrics /></ErrorBoundary>

      {/* Beacon filter — drives period charts above */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader title="Filter by beacon" icon={Search} action={<span className="text-xs text-slate-500">{selectedNode ? "1 selected" : "All beacons"}</span>} />
            <div className="p-2"><ErrorBoundary><NodeList onNodeSelect={(id) => setSelectedNode(id === selectedNode ? null : id)} /></ErrorBoundary></div>
            <p className="border-t border-white/[0.06] px-4 py-2 text-xs text-slate-600">Selecting a beacon filters the four charts above to that nodeId. Clear to return to fleet aggregate.</p>
          </Card>
        </div>
        <Card className="border-white/[0.06] bg-white/[0.015]">
          <CardHeader title="About Monitoring" icon={Activity} />
          <div className="space-y-3 p-4 text-xs leading-6 text-slate-400">
            <p><span className="font-semibold text-slate-300">Monitoring</span> = what happens <em className="text-slate-300">over time</em>. Pick 1h → 30d; charts query <code className="font-mono text-[11px]">GET /monitoring/nodes/metrics?period=·&limit=·&since=·</code>.</p>
            <p><span className="font-semibold text-slate-300">Health</span> = what is <em className="text-slate-300">wrong now</em> — failures, degraded, remediation. No time window.</p>
            <p><span className="font-semibold text-slate-300">Overview</span> = what to <em className="text-slate-300">know right now</em> — Forge state, attention, fleet, capacity, activity.</p>
            <div className="flex gap-2 pt-1">
              <Btn size="sm" tone="ghost" onClick={() => router.push("/admin/overview")}>Overview</Btn>
              <Btn size="sm" tone="ghost" onClick={() => router.push("/admin/health")}>Health</Btn>
              <Btn size="sm" tone="ghost" onClick={() => router.push("/admin/activity")}>Activity</Btn>
            </div>
          </div>
        </Card>
      </div>

      {/* Advanced — detailed metric picker (kept but collapsed, not mixed with primary) */}
      <div className="flex items-center gap-3">
        <button className="text-sm text-slate-400 hover:text-slate-200 transition" onClick={() => setShowAdvanced(!showAdvanced)} type="button">
          {showAdvanced ? "Hide" : "Show"} detailed metric explorer
        </button>
        <span className="text-xs text-slate-700">Multi-metric, 5m–24h — for deep diagnosis (separate from fleet 1h–30d above)</span>
      </div>
      {showAdvanced && (
        <div className="space-y-6">
          <ErrorBoundary><MetricsChart /></ErrorBoundary>
          <div className="grid gap-4 lg:grid-cols-2">
            <ErrorBoundary><ServerCPUChart height={320} nodeId={nodeFilter} period={period} /></ErrorBoundary>
            <ErrorBoundary><ServerMemoryChart height={320} nodeId={nodeFilter} period={period} /></ErrorBoundary>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ErrorBoundary><ServerDiskChart height={320} nodeId={nodeFilter} period={period} /></ErrorBoundary>
            <ErrorBoundary><ServerNetworkChart height={320} nodeId={nodeFilter} period={period} /></ErrorBoundary>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-700">For actionable failures and remediation steps see <button type="button" className="underline hover:text-slate-500" onClick={() => router.push("/admin/health")}>Health</button> — Monitoring never shows alert triage.</p>
    </AdminPageLayout>
  );
}
