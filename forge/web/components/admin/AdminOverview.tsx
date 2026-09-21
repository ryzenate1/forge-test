"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Network,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  fetchAdminAudit,
  fetchAllNodes,
  fetchAllServers,
  fetchHealthStatus,
  fetchUsers,
  type ApiAdminAuditEvent,
  type ApiHealthCheck,
  type ApiNode,
  type ApiServer,
} from "@/lib/api";
import { fetchApps, type ApiApp } from "@/lib/api/apps";
import { ApiError } from "@/lib/api/http";
import { PageInfoDisclosure } from "@/components/ui/page-info-disclosure";
import {
  AdminPageLayout,
  AdminSection,
  SectionHeader,
  Card,
  CardHeader,
  EmptyState,
  Pill,
  StatsRow,
  Btn,
} from "./admin-ui";

function StatusBreakdown({
  data,
  total,
}: {
  data: { label: string; value: number; color: string }[];
  total: number;
}) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className="space-y-3">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]"
        role="progressbar"
        aria-label="Workload status distribution"
        aria-valuenow={Math.round(
          ((data.find((d) => d.label === "Running")?.value ?? 0) / safeTotal) * 100
        )}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {data.map((item) => {
          const width = (item.value / safeTotal) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={item.label}
              className="h-full transition-all"
              style={{ width: `${width}%`, backgroundColor: item.color }}
              title={`${item.label}: ${item.value} (${(
                (item.value / safeTotal) *
                100
              ).toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-mono text-slate-200 tabular-nums">{item.value}</span>
            <span className="text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleBarChart({
  data,
  title,
}: {
  data: { id: string; label: string; value: number; max: number; note?: string }[];
  title: string;
}) {
  const maxValue = Math.max(0, ...data.map((item) => item.max));
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h4>
      <div className="space-y-2.5">
        {data.map((item) => {
          const pct =
            maxValue > 0
              ? Math.min(100, Math.round((item.value / maxValue) * 100))
              : item.value > 0
              ? 100
              : 0;
          return (
            <div key={item.id} className="min-w-0 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className="truncate font-medium text-slate-300"
                  title={item.label}
                >
                  {`host · ${item.label}`}
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {item.value.toLocaleString()} MiB
                </span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-sky-500/80 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

function QueryError({
  message,
  onRetry,
  error,
}: {
  message: string;
  onRetry?: () => void;
  error?: unknown;
}) {
  const isPermission = isPermissionError(error);
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 text-xs ${
      isPermission
        ? "border-amber-500/30 bg-amber-950/20 text-amber-300"
        : "border-red-500/30 bg-red-950/20 text-red-300"
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        {isPermission ? (
          <Shield size={14} className="shrink-0 text-amber-400" />
        ) : (
          <AlertTriangle size={14} className="shrink-0 text-red-400" />
        )}
        <span className="truncate">
          {isPermission ? "Permission restricted" : message}
        </span>
      </div>
      {onRetry && !isPermission ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline hover:text-red-100"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function QueryLoading({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-label={message}
      className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-slate-400"
    >
      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      <span>{message}</span>
    </div>
  );
}

function reportedTotal(
  records: Array<ApiNode | ApiServer>,
  field: "memoryMb" | "diskMb"
) {
  const values = records
    .map((record) => record[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    value: values.reduce((sum, value) => sum + value, 0),
    reported: values.length,
    total: records.length,
  };
}

function hasHealthyPersistedHeartbeat(node: ApiNode) {
  return node.heartbeatState === "healthy";
}

export function AdminOverview() {
  const router = useRouter();
  const [attentionCollapsed, setAttentionCollapsed] = useState(false);

  const nodesQuery = useQuery({
    queryKey: ["nodes", "all"],
    queryFn: fetchAllNodes,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const serversQuery = useQuery({
    queryKey: ["servers", "all"],
    queryFn: fetchAllServers,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const appsQuery = useQuery({
    queryKey: ["apps"],
    queryFn: fetchApps,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealthStatus,
    retry: 2,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const activityQuery = useQuery<ApiAdminAuditEvent[]>({
    queryKey: ["admin-audit"],
    queryFn: fetchAdminAudit,
    retry: 2,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data]);
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
  const apps = useMemo(() => appsQuery.data ?? [], [appsQuery.data]);
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const checks: ApiHealthCheck[] = healthQuery.data?.checks ?? [];
  const failedChecks = useMemo(
    () => checks.filter((c: ApiHealthCheck) => c.status !== "ok" && c.status !== "warning"),
    [checks]
  );
  const warningChecks = useMemo(
    () => checks.filter((c: ApiHealthCheck) => c.status === "warning"),
    [checks]
  );

  // Fleet Heartbeat & State Classifications
  const onlineNodes = useMemo(
    () => (Array.isArray(nodes) ? nodes.filter(hasHealthyPersistedHeartbeat).length : 0),
    [nodes]
  );
  const offlineNodes = useMemo(
    () =>
      Array.isArray(nodes)
        ? nodes.filter(
            (node) =>
              node.heartbeatState === "offline" ||
              node.heartbeatState === "unreachable" ||
              node.actualState === "offline"
          )
        : [],
    [nodes]
  );
  const degradedNodes = useMemo(
    () =>
      Array.isArray(nodes)
        ? nodes.filter(
            (node) =>
              node.heartbeatState === "degraded" ||
              node.heartbeatState === "suspected" ||
              node.actualState === "degraded"
          )
        : [],
    [nodes]
  );

  // Workload Health & State Classifications
  const runningServers = useMemo(
    () => (Array.isArray(servers) ? servers.filter((server) => server.status === "running").length : 0),
    [servers]
  );
  const crashedServers = useMemo(
    () =>
      Array.isArray(servers)
        ? servers.filter(
            (server) =>
              server.status === "crashed" ||
              server.actualState === "crashed" ||
              (server.desiredState === "running" && server.status === "offline") ||
              Boolean(server.transferError)
          )
        : [],
    [servers]
  );

  // Applications health
  const runningApps = useMemo(
    () => (Array.isArray(apps) ? apps.filter((app) => app.status === "running").length : 0),
    [apps]
  );
  const failedApps = useMemo(
    () => (Array.isArray(apps) ? apps.filter((app) => app.status === "failed").length : 0),
    [apps]
  );

  // Unified Workload Totals
  const totalWorkloads = servers.length + apps.length;
  const totalRunningWorkloads = runningServers + runningApps;

  // Actionable Failures & Attention Lane
  const failures = useMemo(() => {
    const list: Array<{ id: string; label: string; detail: string; href?: string }> = [];

    // Offline or Degraded Nodes
    if (!nodesQuery.isError && Array.isArray(nodes)) {
      for (const node of nodes) {
        if (!hasHealthyPersistedHeartbeat(node) || node.heartbeatError) {
          list.push({
            id: `node-${node.id}`,
            label: node.name,
            detail: node.heartbeatError
              ? `Node heartbeat failure: ${node.heartbeatError}`
              : `Node heartbeat failure — beacon is ${node.heartbeatState ?? "offline"}`,
            href: "/admin/nodes",
          });
        }
      }
    }

    // Crashed or Divergent Servers
    if (!serversQuery.isError && Array.isArray(servers)) {
      for (const server of servers) {
        if (
          server.status === "crashed" ||
          server.actualState === "crashed" ||
          (server.desiredState === "running" && server.status === "offline") ||
          server.transferError
        ) {
          list.push({
            id: `server-${server.id}`,
            label: server.name,
            detail:
              server.transferError ??
              (server.desiredState && server.actualState && server.desiredState !== server.actualState
                ? `Desired state is ${server.desiredState}, actual state is ${server.actualState}`
                : `Server is ${server.status}`),
            href: `/admin/servers`,
          });
        }
      }
    }

    // Failed Apps
    if (!appsQuery.isError && Array.isArray(apps)) {
      for (const app of apps) {
        if (app.status === "failed") {
          list.push({
            id: `app-${app.id}`,
            label: app.name,
            detail: `Application container is failed`,
            href: `/admin/apps`,
          });
        }
      }
    }

    // Diagnostic Health Checks
    if (!healthQuery.isError && Array.isArray(failedChecks)) {
      for (const check of failedChecks) {
        list.push({
          id: `health-${check.name}`,
          label: check.label ?? check.name,
          detail: check.notificationMessage ?? `Status is ${check.status}`,
          href: "/admin/health",
        });
      }
    }

    return list;
  }, [
    nodes,
    servers,
    apps,
    nodesQuery.isError,
    serversQuery.isError,
    appsQuery.isError,
    healthQuery.isError,
    failedChecks,
  ]);

  const pendingAttention = failures.length;

  // Overall Status Truth Engine
  const { overallStatus, overallTitle, overallTone } = useMemo(() => {
    if (healthQuery.isError || nodesQuery.isError || serversQuery.isError) {
      return {
        overallStatus: "unavailable",
        overallTitle: "Control plane partially unreachable",
        overallTone: "red" as const,
      };
    }
    if (
      failedChecks.length > 0 ||
      offlineNodes.length > 0 ||
      crashedServers.length > 0 ||
      failedApps > 0 ||
      healthQuery.data?.status === "failed"
    ) {
      return {
        overallStatus: "failed",
        overallTitle:
          offlineNodes.length > 0
            ? `${offlineNodes.length} nodes offline`
            : "Attention required",
        overallTone: "red" as const,
      };
    }
    if (
      warningChecks.length > 0 ||
      degradedNodes.length > 0 ||
      healthQuery.data?.status === "warning" ||
      (healthQuery.data?.status as string) === "degraded"
    ) {
      return {
        overallStatus: "degraded",
        overallTitle: "Platform degraded",
        overallTone: "yellow" as const,
      };
    }
    return {
      overallStatus: "ok",
      overallTitle: "All systems operational",
      overallTone: "green" as const,
    };
  }, [
    healthQuery.isError,
    nodesQuery.isError,
    serversQuery.isError,
    failedChecks.length,
    warningChecks.length,
    offlineNodes.length,
    degradedNodes.length,
    crashedServers.length,
    failedApps,
    healthQuery.data?.status,
  ]);

  // Capacity calculations
  const nodeMemoryCapacity = useMemo(() => reportedTotal(nodes, "memoryMb"), [nodes]);
  const nodeDiskCapacity = useMemo(() => reportedTotal(nodes, "diskMb"), [nodes]);
  const serverMemoryConfiguration = useMemo(() => reportedTotal(servers, "memoryMb"), [servers]);
  const serverDiskConfiguration = useMemo(() => reportedTotal(servers, "diskMb"), [servers]);

  // Status breakdown data for servers
  const serverStatusData = useMemo(() => {
    const srv = Array.isArray(servers) ? servers : [];
    const running = srv.filter((s) => s.status === "running").length;
    const stopped = srv.filter((s) => s.status === "stopped" && !s.suspended).length;
    const failed = srv.filter(
      (s) => s.status === "crashed" || (s.desiredState === "running" && s.status === "offline")
    ).length;
    const suspended = srv.filter((s) => s.suspended).length;
    const installing = srv.filter((s) => s.status === "installing").length;
    const other = Math.max(0, srv.length - running - stopped - failed - suspended - installing);
    return [
      { label: "Running", value: running, color: "var(--success)" },
      { label: "Stopped", value: stopped, color: "var(--concrete)" },
      ...(failed > 0 ? [{ label: "Failed", value: failed, color: "var(--danger)" }] : []),
      ...(suspended > 0 ? [{ label: "Suspended", value: suspended, color: "var(--warning)" }] : []),
      ...(installing > 0 ? [{ label: "Installing", value: installing, color: "var(--info)" }] : []),
      ...(other > 0 ? [{ label: "Other", value: other, color: "var(--accent-violet)" }] : []),
    ];
  }, [servers]);

  // Per-node memory allocation chart data
  const nodeResourceData = useMemo(
    () =>
      Array.isArray(nodes)
        ? nodes
            .filter(
              (node): node is ApiNode & { memoryMb: number } =>
                typeof node.memoryMb === "number" && Number.isFinite(node.memoryMb)
            )
            .map((node) => ({
              id: node.id,
              label: node.name,
              value: node.memoryMb,
              max: node.memoryMb,
            }))
        : [],
    [nodes]
  );

  const isDataStale = useCallback(
    (query: { dataUpdatedAt: number; isSuccess: boolean }, refetchIntervalMs: number) =>
      query.isSuccess &&
      query.dataUpdatedAt > 0 &&
      Date.now() - query.dataUpdatedAt > refetchIntervalMs * 2,
    []
  );

  const anyStale =
    isDataStale(nodesQuery, 30_000) ||
    isDataStale(serversQuery, 30_000) ||
    isDataStale(appsQuery, 30_000) ||
    isDataStale(usersQuery, 60_000) ||
    isDataStale(healthQuery, 30_000) ||
    isDataStale(activityQuery, 15_000);

  return (
    <AdminPageLayout>
      <SectionHeader
        title={
          <span className="flex items-center gap-2.5">
            <span>Overview</span>
            <PageInfoDisclosure
              title="Forge Mission Control"
              eyebrow="Architecture & Semantics"
              description="Overview provides a live, verified snapshot of your infrastructure fleet, workload instances, control-plane health, and active operations."
              sections={[
                {
                  title: "Desired vs. Actual State",
                  icon: Layers,
                  content:
                    "Forge explicitly separates user intent (Desired State) from per-host runtime observation (Observed Actual State). Workloads and Beacons are only considered healthy when active verification succeeds.",
                },
                {
                  title: "Beacon Fleet Telemetry",
                  icon: Network,
                  content:
                    "Host daemons transmit periodic heartbeats. A healthy beacon reports within its scheduled window; expired heartbeats transition into suspected, unreachable, or offline states.",
                },
                {
                  title: "Capacity vs. Live Observability",
                  icon: Activity,
                  content:
                    "Overview displays configured resource allocations (memory/disk limits). For live CPU, load, and network time-series graphs, navigate to the dedicated Monitoring section.",
                },
                {
                  title: "Governance & Auditing",
                  icon: ShieldCheck,
                  content:
                    "Every mutation in the control plane is immutably logged with actor identity, target resource, and timestamps.",
                },
              ]}
            />
          </span>
        }
        sub="Forge state, attention, fleet, workloads, capacity and recent activity — what to know right now."
        action={
          <div className="flex gap-2">
            <Btn tone="ghost" onClick={() => router.push("/admin/monitoring")}>
              Monitoring <ArrowUpRight size={12} />
            </Btn>
            <Btn tone="ghost" onClick={() => router.push("/admin/health")}>
              Health <ArrowUpRight size={12} />
            </Btn>
          </div>
        }
      />

      {/* 1. Control-Plane Truth Banner & Attention Lane */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className={`flex flex-col justify-between border xl:col-span-2 ${
            overallTone === "green"
              ? "border-emerald-500/20 bg-emerald-500/[0.04]"
              : overallTone === "yellow"
              ? "border-amber-500/20 bg-amber-500/[0.04]"
              : "border-red-500/20 bg-red-500/[0.06]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`grid h-10 w-10 place-items-center rounded-xl border ${
                  overallTone === "green"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : overallTone === "yellow"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                    : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}
              >
                {overallTone === "green" ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertTriangle size={20} />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  {healthQuery.isLoading
                    ? "Loading control-plane state…"
                    : overallTitle}
                </h2>
                <p className="text-xs text-slate-400">
                  {healthQuery.isLoading
                    ? "Checking health, nodes and workloads…"
                    : healthQuery.isError
                    ? String(healthQuery.error?.message ?? "Health API unavailable")
                    : `${onlineNodes}/${nodes.length} beacons healthy · ${runningServers}/${servers.length} workloads running · ${users.length} users`}
                </p>
              </div>
            </div>
            <Pill
              tone={
                overallTone === "green"
                  ? "green"
                  : overallTone === "yellow"
                  ? "yellow"
                  : "red"
              }
            >
              {healthQuery.isLoading
                ? "checking…"
                : healthQuery.isError
                ? "unavailable"
                : overallStatus}
            </Pill>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Pill
              tone={
                nodesQuery.isError
                  ? "red"
                  : nodesQuery.isLoading
                  ? "yellow"
                  : onlineNodes === nodes.length && nodes.length > 0
                  ? "green"
                  : "yellow"
              }
            >
              Beacons:{" "}
              {nodesQuery.isError
                ? "unavailable"
                : nodesQuery.isLoading
                ? "…"
                : `${onlineNodes} healthy${
                    degradedNodes.length > 0 ? ` (${degradedNodes.length} degraded)` : ""
                  } of ${nodes.length}`}
            </Pill>
            <Pill
              tone={
                serversQuery.isError
                  ? "red"
                  : serversQuery.isLoading
                  ? "yellow"
                  : runningServers > 0
                  ? "green"
                  : "neutral"
              }
            >
              Workloads:{" "}
              {serversQuery.isError
                ? "unavailable"
                : serversQuery.isLoading
                ? "…"
                : `${runningServers} running`}
            </Pill>
            <Pill
              tone={
                healthQuery.isError
                  ? "red"
                  : healthQuery.isLoading
                  ? "yellow"
                  : failedChecks.length > 0
                  ? "red"
                  : "green"
              }
            >
              Checks:{" "}
              {healthQuery.isError
                ? "unavailable"
                : healthQuery.isLoading
                ? "…"
                : `${checks.length - failedChecks.length}/${checks.length} ok`}
            </Pill>
          </div>
        </Card>

        {/* Needs Attention Accordion Card */}
        <Card
          className={
            pendingAttention > 0
              ? "border-amber-500/20 bg-amber-500/[0.04]"
              : "border-white/[0.07] bg-white/[0.015]"
          }
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAttentionCollapsed((v) => !v)}
              className="flex items-center gap-2 text-left text-sm font-semibold text-slate-200 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/50 rounded"
              aria-label="Needs attention"
              aria-expanded={!attentionCollapsed}
            >
              <AlertTriangle
                size={15}
                className={pendingAttention > 0 ? "text-amber-400" : "text-emerald-400"}
              />
              <span>Needs attention</span>
              <span className="text-xs font-normal text-slate-400">
                ({attentionCollapsed ? "Show" : "Hide"})
              </span>
            </button>
            <span className="font-mono text-xs text-slate-500">
              {pendingAttention} item{pendingAttention === 1 ? "" : "s"}
            </span>
          </div>

          {!attentionCollapsed ? (
            pendingAttention === 0 ? (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs leading-5 text-emerald-200">
                No open issues — fleet heartbeat, workloads and control-plane checks are healthy. See{" "}
                <button
                  type="button"
                  className="underline hover:text-emerald-100"
                  onClick={() => router.push("/admin/health")}
                >
                  Health
                </button>{" "}
                for deep diagnostics.
              </div>
            ) : (
              <ul className="mt-3 max-h-[220px] divide-y divide-white/[0.06] overflow-auto rounded-lg border border-white/[0.06] bg-black/20">
                {failures.slice(0, 5).map((f) => (
                  <li
                    key={f.id}
                    onClick={() => f.href && router.push(f.href)}
                    className={`px-3 py-2.5 transition ${
                      f.href ? "cursor-pointer hover:bg-white/[0.04]" : ""
                    }`}
                  >
                    <p className="truncate text-xs font-semibold text-amber-200">{f.label}</p>
                    <p className="truncate text-xs text-slate-400">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {!attentionCollapsed && pendingAttention > 5 ? (
            <button
              type="button"
              onClick={() => router.push("/admin/health")}
              className="mt-2.5 text-xs font-medium text-amber-300 hover:text-amber-200 transition"
            >
              View all {pendingAttention} issues →
            </button>
          ) : null}
        </Card>
      </div>

      {/* Sources Availability Row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-xs font-medium text-slate-500">Sources:</span>
        {anyStale ? (
          <Pill tone="yellow" className="gap-1">
            <RefreshCw size={10} className="animate-spin" /> Data may be stale
          </Pill>
        ) : null}
        {([
          { label: "Nodes", query: nodesQuery },
          { label: "Servers", query: serversQuery },
          { label: "Users", query: usersQuery },
          { label: "Health", query: healthQuery },
          { label: "Activity", query: activityQuery },
        ] as const).map(({ label, query }) => (
          <Pill
            key={label}
            tone={
              query.isError
                ? isPermissionError(query.error) ? "yellow" : "red"
                : query.isLoading
                ? "yellow"
                : "green"
            }
          >
            {label}:{" "}
            {query.isError
              ? isPermissionError(query.error) ? "restricted" : "unavailable"
              : query.isLoading
              ? "loading"
              : "available"}
            {query.isSuccess && query.dataUpdatedAt > 0 ? (
              <span className="ml-1 font-mono text-[10px] text-slate-600 tabular-nums">
                {new Date(query.dataUpdatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            ) : null}
          </Pill>
        ))}
      </div>

      {/* Error Banners */}
      {(nodesQuery.isError ||
        serversQuery.isError ||
        usersQuery.isError ||
        healthQuery.isError ||
        activityQuery.isError) && (
        <div className="space-y-2">
          {nodesQuery.isError && (
            <QueryError
              message={`Beacons unavailable — fleet and capacity coverage incomplete. (${
                nodesQuery.error?.message ?? "unknown error"
              })`}
              onRetry={() => nodesQuery.refetch()}
              error={nodesQuery.error}
            />
          )}
          {serversQuery.isError && (
            <QueryError
              message={`Workload inventory unavailable — status and capacity incomplete. (${
                serversQuery.error?.message ?? "unknown error"
              })`}
              onRetry={() => serversQuery.refetch()}
              error={serversQuery.error}
            />
          )}
          {usersQuery.isError && (
            <QueryError
              message={`Users unavailable. (${
                usersQuery.error?.message ?? "unknown error"
              })`}
              onRetry={() => usersQuery.refetch()}
              error={usersQuery.error}
            />
          )}
          {healthQuery.isError && (
            <QueryError
              message={`Control-plane health unavailable. (${
                healthQuery.error?.message ?? "unknown error"
              })`}
              onRetry={() => healthQuery.refetch()}
              error={healthQuery.error}
            />
          )}
          {activityQuery.isError && (
            <QueryError
              message={`Activity unavailable. (${
                activityQuery.error?.message ?? "unknown error"
              })`}
              onRetry={() => activityQuery.refetch()}
              error={activityQuery.error}
            />
          )}
        </div>
      )}

      {/* Stats Row */}
      <StatsRow
        items={[
          {
            label: "Infrastructure",
            value: nodesQuery.isError
              ? "Unavailable"
              : nodesQuery.isLoading
              ? "…"
              : `${onlineNodes} healthy`,
            icon: Network,
            tone:
              nodesQuery.isError || nodesQuery.isLoading || nodes.length === 0
                ? "neutral"
                : onlineNodes === nodes.length
                ? "green"
                : "yellow",
          },
          {
            label: "Workloads",
            value: serversQuery.isError
              ? "Unavailable"
              : serversQuery.isLoading
              ? "…"
              : `${runningServers} running`,
            icon: Layers,
            tone:
              serversQuery.isError || serversQuery.isLoading
                ? "neutral"
                : runningServers > 0
                ? "green"
                : "blue",
          },
          {
            label: "Beacons",
            value: nodesQuery.isError
              ? "Unavailable"
              : nodesQuery.isLoading
              ? "…"
              : nodes.length,
            icon: Server,
            tone:
              nodesQuery.isError || nodesQuery.isLoading || nodes.length === 0
                ? "neutral"
                : "neutral",
          },
          {
            label: "Users",
            value: usersQuery.isError
              ? "Unavailable"
              : usersQuery.isLoading
              ? "…"
              : users.length,
            icon: Shield,
            tone: "neutral",
          },
        ]}
      />

      {/* Fleet & Workload Distribution Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {serversQuery.isError ? (
          <Card>
            <CardHeader title="Workload status distribution" icon={Activity} />
            <QueryError
              message="Workload inventory is unavailable."
              onRetry={() => serversQuery.refetch()}
            />
          </Card>
        ) : serversQuery.isLoading ? (
          <Card>
            <CardHeader title="Workload status distribution" icon={Activity} />
            <QueryLoading message="Loading workload inventory…" />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Workload status distribution"
              icon={Activity}
              action={
                <Btn
                  size="sm"
                  tone="ghost"
                  onClick={() => router.push("/admin/servers")}
                >
                  View workloads <ArrowUpRight size={12} />
                </Btn>
              }
            />
            {servers.length === 0 ? (
              <EmptyState
                icon={Activity}
                message="No workloads yet — create one from Catalog."
              />
            ) : (
              <StatusBreakdown data={serverStatusData} total={servers.length} />
            )}
            <p className="mt-4 border-t border-white/[0.04] pt-3 text-xs text-slate-500">
              Displays actual observed workload status across all nodes. Desired state vs actual state discrepancies are highlighted above.
            </p>
          </Card>
        )}

        {nodesQuery.isError ? (
          <Card>
            <CardHeader
              title="Infrastructure — Beacon memory"
              icon={HardDrive}
            />
            <QueryError
              message="Beacons are unavailable."
              onRetry={() => nodesQuery.refetch()}
            />
          </Card>
        ) : nodesQuery.isLoading ? (
          <Card>
            <CardHeader
              title="Infrastructure — Beacon memory"
              icon={HardDrive}
            />
            <QueryLoading message="Loading beacon capacity…" />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Infrastructure — Beacon memory"
              icon={HardDrive}
              action={
                <Btn
                  size="sm"
                  tone="ghost"
                  onClick={() => router.push("/admin/nodes")}
                >
                  Manage beacons <ArrowUpRight size={12} />
                </Btn>
              }
            />
            {nodes.length === 0 ? (
              <EmptyState
                icon={HardDrive}
                message="No beacons — add a beacon to host workloads."
              />
            ) : nodeResourceData.length === 0 ? (
              <EmptyState
                icon={HardDrive}
                message="Memory capacity not reported by beacons."
              />
            ) : (
              <>
                <SimpleBarChart
                  data={nodeResourceData}
                  title="Configured memory capacity per beacon (MiB)"
                />
                <p className="mt-4 border-t border-white/[0.04] pt-3 text-xs text-slate-500">
                  Coverage: {nodeResourceData.length} of {nodes.length} beacons reported configured memory limits.
                </p>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Capacity & Quotas (Single, Truthful, Deduplicated) */}
      <AdminSection
        title="Capacity"
        description="Configured compute allocations across workloads and host pools."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="min-h-[160px]">
            <CardHeader title="Memory Allocation" icon={Cpu} />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Configured server memory — sum of Workload resources.memory
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {serversQuery.isError
                ? "Unavailable"
                : serversQuery.isLoading
                ? "…"
                : serverMemoryConfiguration.reported > 0
                ? `${serverMemoryConfiguration.value.toLocaleString()} MiB`
                : "Not reported"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {serversQuery.isError
                ? "Workload inventory is unavailable."
                : serversQuery.isLoading
                ? "Waiting for workload inventory."
                : `Allocated across ${serverMemoryConfiguration.reported} of ${serverMemoryConfiguration.total} workloads.`}
            </p>
            <div className="mt-3 border-t border-white/[0.06] pt-2.5 text-xs text-slate-400">
              <span className="text-slate-500">Beacon host allocatable pool:</span>{" "}
              {nodesQuery.isError
                ? "unavailable"
                : nodesQuery.isLoading
                ? "…"
                : nodeMemoryCapacity.reported > 0
                ? `${nodeMemoryCapacity.value.toLocaleString()} MiB across ${nodeMemoryCapacity.reported}/${nodeMemoryCapacity.total} beacons`
                : "not reported"}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Capacity is configured quota allocation, not live memory utilization. See Monitoring for real-time telemetry over time.
            </p>
          </Card>

          <Card className="min-h-[160px]">
            <CardHeader title="Storage Allocation" icon={HardDrive} />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Configured server disk — sum of Workload resources.disk
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {serversQuery.isError
                ? "Unavailable"
                : serversQuery.isLoading
                ? "…"
                : serverDiskConfiguration.reported > 0
                ? `${serverDiskConfiguration.value.toLocaleString()} MiB`
                : "Not reported"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {serversQuery.isError
                ? "Workload inventory is unavailable."
                : serversQuery.isLoading
                ? "Waiting for workload inventory."
                : `Allocated across ${serverDiskConfiguration.reported} of ${serverDiskConfiguration.total} workloads.`}
            </p>
            <div className="mt-3 border-t border-white/[0.06] pt-2.5 text-xs text-slate-400">
              <span className="text-slate-500">Beacon storage pool:</span>{" "}
              {nodesQuery.isError
                ? "unavailable"
                : nodesQuery.isLoading
                ? "…"
                : nodeDiskCapacity.reported > 0
                ? `${nodeDiskCapacity.value.toLocaleString()} MiB across ${nodeDiskCapacity.reported}/${nodeDiskCapacity.total} beacons`
                : "not reported"}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Disk capacity represents maximum allocation bounds. Live disk usage is monitored per container via Beacon.
            </p>
          </Card>
        </div>
      </AdminSection>

      {/* Navigable Beacon Fleet & Workload Inventory Stream */}
      <div className="grid gap-6 md:grid-cols-2">
        {nodesQuery.isError ? (
          <Card>
            <CardHeader title="Persisted beacon heartbeat" icon={Network} />
            <QueryError
              message="Beacons are unavailable."
              onRetry={() => nodesQuery.refetch()}
            />
          </Card>
        ) : nodesQuery.isLoading ? (
          <Card>
            <CardHeader title="Persisted beacon heartbeat" icon={Network} />
            <QueryLoading message="Loading persisted heartbeat…" />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Persisted beacon heartbeat"
              icon={Network}
              action={
                <Btn
                  size="sm"
                  tone="ghost"
                  onClick={() => router.push("/admin/nodes")}
                >
                  All Beacons →
                </Btn>
              }
            />
            {nodes.length === 0 ? (
              <EmptyState
                icon={Network}
                message="No beacons configured — register a beacon to start hosting workloads."
              />
            ) : (
              <>
                <div className="-mx-4 sm:-mx-5 border-b border-white/[0.04] px-4 py-2.5 text-xs text-slate-400 sm:px-5">
                  {onlineNodes} healthy · {nodes.length} registered beacons
                </div>
                <ul className="-mx-4 sm:-mx-5 max-h-[320px] divide-y divide-white/[0.04] overflow-auto">
                  {nodes.slice(0, 8).map((node) => (
                    <li
                      key={node.id}
                      onClick={() => router.push("/admin/nodes")}
                      className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">
                          {`beacon · ${node.name}`}
                        </p>
                        <p className="truncate text-xs font-mono text-slate-500">
                          {node.fqdn || node.region || "local"}
                        </p>
                      </div>
                      <Pill
                        tone={
                          hasHealthyPersistedHeartbeat(node)
                            ? "green"
                            : node.heartbeatState === "degraded"
                            ? "yellow"
                            : node.heartbeatState
                            ? "red"
                            : "neutral"
                        }
                      >
                        {hasHealthyPersistedHeartbeat(node)
                          ? "healthy"
                          : node.heartbeatState ?? "unreported"}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        {serversQuery.isError ? (
          <Card>
            <CardHeader title="Workload inventory" icon={Layers} />
            <QueryError
              message="Workload inventory is unavailable."
              onRetry={() => serversQuery.refetch()}
            />
          </Card>
        ) : serversQuery.isLoading ? (
          <Card>
            <CardHeader title="Workload inventory" icon={Layers} />
            <QueryLoading message="Loading workload inventory…" />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Workload inventory"
              icon={Layers}
              action={
                <Btn
                  size="sm"
                  tone="ghost"
                  onClick={() => router.push("/admin/servers")}
                >
                  All workloads →
                </Btn>
              }
            />
            {servers.length === 0 ? (
              <EmptyState icon={Layers} message="No workloads yet." />
            ) : (
              <>
                <div className="-mx-4 sm:-mx-5 border-b border-white/[0.04] px-4 py-2.5 text-xs text-slate-400 sm:px-5">
                  Displaying {Math.min(8, servers.length)} of {servers.length} workloads
                </div>
                <ul className="-mx-4 sm:-mx-5 max-h-[320px] divide-y divide-white/[0.04] overflow-auto">
                  {servers.slice(0, 8).map((server) => (
                    <li
                      key={server.id}
                      onClick={() => router.push(`/admin/servers`)}
                      className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">
                          {server.name}
                        </p>
                        <p className="truncate text-xs font-mono text-slate-500">
                          {server.node || "unassigned"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {server.desiredState && server.actualState && server.desiredState !== server.actualState ? (
                          <span className="text-[10px] font-mono text-amber-400" title={`Desired: ${server.desiredState}, Actual: ${server.actualState}`}>
                            divergent
                          </span>
                        ) : null}
                        <Pill
                          tone={
                            server.status === "running"
                              ? "green"
                              : server.status === "stopped"
                              ? "neutral"
                              : server.status === "crashed"
                              ? "red"
                              : "yellow"
                          }
                        >
                          {server.suspended ? "suspended" : server.status}
                        </Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Recent Admin Activity & Navigation Shortcuts */}
      <div className="grid gap-6 md:grid-cols-2">
        {activityQuery.isError ? (
          <Card>
            <CardHeader title="Recent admin activity" icon={Shield} />
            <QueryError
              message="Activity API unavailable."
              onRetry={() => activityQuery.refetch()}
            />
          </Card>
        ) : activityQuery.isLoading ? (
          <Card>
            <CardHeader title="Recent admin activity" icon={Shield} />
            <QueryLoading message="Loading administrative activity…" />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Recent admin activity"
              icon={Shield}
              action={
                <Btn
                  size="sm"
                  tone="ghost"
                  onClick={() => router.push("/admin/activity")}
                >
                  All activity →
                </Btn>
              }
            />
            {(activityQuery.data ?? []).length === 0 ? (
              <EmptyState icon={Shield} message="No recent changes." />
            ) : (
              <ul className="-mx-4 sm:-mx-5 max-h-[320px] divide-y divide-white/[0.04] overflow-auto">
                {(activityQuery.data ?? []).slice(0, 8).map((event) => {
                  const formattedAction = event.action.replace(/_/g, " ");
                  return (
                    <li
                      className="px-4 py-3 sm:px-5 hover:bg-white/[0.02] transition"
                      key={event.id}
                    >
                      <div className="flex justify-between gap-3">
                        <p className="truncate text-sm font-medium text-slate-200">
                          {formattedAction}
                        </p>
                        <time className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                          {new Date(event.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {event.actorEmail ?? "system"} ·{" "}
                        <span className="font-mono text-slate-500">
                          {event.targetType}
                          {event.targetId ? `:${event.targetId}` : ""}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {/* Quick Operational Navigation */}
        <Card>
          <CardHeader title="Command Centers" icon={Database} />
          <div className="grid gap-2.5">
            {[
              {
                label: "Monitoring — What happens over time",
                desc: "Live CPU, memory, disk & network time-series charts",
                href: "/admin/monitoring",
              },
              {
                label: "Health — Detailed system diagnostics",
                desc: "Service checks, latency, database & cache health",
                href: "/admin/health",
              },
              {
                label: "Activity — Immutable audit log",
                desc: "Track administrative operations with export to CSV/JSON",
                href: "/admin/activity",
              },
              {
                label: "Beacons — Host management",
                desc: "Manage daemon nodes, tokens, and host capabilities",
                href: "/admin/nodes",
              },
            ].map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => router.push(link.href)}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition hover:border-white/10 hover:bg-white/[0.04]"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {link.label}
                  </p>
                  <p className="text-xs text-slate-500">{link.desc}</p>
                </div>
                <ArrowUpRight size={14} className="text-slate-500" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
