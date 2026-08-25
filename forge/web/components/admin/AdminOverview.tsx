"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Database, HardDrive, Layers, Network, Server, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { fetchAdminAudit, fetchAllNodes, fetchAllServers, fetchHealthStatus, fetchUsers, type ApiAdminAuditEvent, type ApiHealthCheck, type ApiNode, type ApiServer } from "@/lib/api";
import { AdminPageLayout, SectionHeader, AdminSection, Card, CardHeader, EmptyState, Pill, StatsRow, Btn } from "./admin-ui";

function StatusBreakdown({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]">
        {data.map((item) => {
          const width = (item.value / safeTotal) * 100;
          if (width <= 0) return null;
          return <div key={item.label} className="h-full transition-all" style={{ width: `${width}%`, backgroundColor: item.color }} title={`${item.label}: ${item.value} (${((item.value / safeTotal) * 100).toFixed(1)}%)`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="tabular-nums">{item.value}</span>
            <span className="text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleBarChart({ data, title }: { data: { id: string; label: string; value: number; max: number }[]; title: string }) {
  const maxValue = Math.max(0, ...data.map((item) => item.max));
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-200 mb-3">{title}</h4>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.id} className="flex items-center gap-2 min-w-0">
            <span className="truncate min-w-0 flex-shrink text-xs text-slate-400" title={item.label}>{item.label}</span>
            <div className="flex-1 h-4 rounded-full bg-white/[0.05] overflow-hidden min-w-0">
              <div className="h-full rounded-full bg-sky-400/80 transition-all" style={{ width: `${maxValue > 0 ? Math.min(100, (item.value / maxValue) * 100) : item.value > 0 ? 100 : 0}%` }} />
            </div>
            <span className="whitespace-nowrap tabular-nums ml-auto text-xs text-slate-400">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueryError({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-700/30 bg-red-900/10 p-4 text-center text-sm text-red-300">{message}</div>;
}
function QueryLoading({ message }: { message: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center text-sm text-slate-400">{message}</div>;
}
function reportedTotal(records: Array<ApiNode | ApiServer>, field: "memoryMb" | "diskMb") {
  const values = records.map((record) => record[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return { value: values.reduce((sum, value) => sum + value, 0), reported: values.length, total: records.length };
}
function hasHealthyPersistedHeartbeat(node: ApiNode) {
  return node.heartbeatState === "healthy";
}

export function AdminOverview() {
  const router = useRouter();
  const nodesQuery = useQuery({ queryKey: ["nodes", "all"], queryFn: fetchAllNodes, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: 3 });
  const serversQuery = useQuery({ queryKey: ["servers", "all"], queryFn: fetchAllServers, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: 3 });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: 2 });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: fetchHealthStatus, retry: 2, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const activityQuery = useQuery<ApiAdminAuditEvent[]>({ queryKey: ["admin-audit"], queryFn: fetchAdminAudit, retry: 2, refetchInterval: 15_000, refetchIntervalInBackground: false });

  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data]);
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
  const users = usersQuery.data ?? [];
  const checks: ApiHealthCheck[] = healthQuery.data?.checks ?? [];
  const failedChecks = checks.filter((c: ApiHealthCheck) => c.status !== "ok" && c.status !== "warning");

  const onlineNodes = useMemo(() => Array.isArray(nodes) ? nodes.filter(hasHealthyPersistedHeartbeat).length : 0, [nodes]);
  const heartbeatReportedNodes = useMemo(() => Array.isArray(nodes) ? nodes.filter((node) => Boolean(node.heartbeatState)).length : 0, [nodes]);
  const runningServers = useMemo(() => Array.isArray(servers) ? servers.filter((server) => server.status === "running").length : 0, [servers]);
  const failures = useMemo(() => [
    ...(nodesQuery.isError ? [] : Array.isArray(nodes) ? nodes.filter((node) => !hasHealthyPersistedHeartbeat(node) || node.heartbeatError).map((node) => ({ id: `node-${node.id}`, label: node.name, detail: node.heartbeatError ?? `Persisted heartbeat is ${node.heartbeatState ?? "unreported"}` })) : []),
    ...(serversQuery.isError ? [] : Array.isArray(servers) ? servers.filter((server) => server.status === "crashed" || server.transferError).map((server) => ({ id: `server-${server.id}`, label: server.name, detail: server.transferError ?? `Server is ${server.status}` })) : []),
    ...(healthQuery.isError ? [] : failedChecks.map((check) => ({ id: `health-${check.name}`, label: check.label ?? check.name, detail: check.notificationMessage ?? check.status }))),
  ], [nodes, servers, nodesQuery.isError, serversQuery.isError, healthQuery.isError, failedChecks]);
  const nodeMemoryCapacity = useMemo(() => reportedTotal(nodes, "memoryMb"), [nodes]);
  const nodeDiskCapacity = useMemo(() => reportedTotal(nodes, "diskMb"), [nodes]);
  const serverMemoryConfiguration = useMemo(() => reportedTotal(servers, "memoryMb"), [servers]);
  const serverDiskConfiguration = useMemo(() => reportedTotal(servers, "diskMb"), [servers]);

  const serverStatusData = useMemo(() => {
    const srv = Array.isArray(servers) ? servers : [];
    const running = srv.filter((s) => s.status === "running").length;
    const stopped = srv.filter((s) => s.status === "stopped" && !s.suspended).length;
    const failed = srv.filter((s) => s.status === "crashed").length;
    const suspended = srv.filter((s) => s.suspended).length;
    const installing = srv.filter((s) => s.status === "installing").length;
    const other = srv.length - running - stopped - failed - suspended - installing;
    return [
      { label: "Running", value: running, color: "#22c55e" },
      { label: "Stopped", value: stopped, color: "#64748b" },
      ...(failed > 0 ? [{ label: "Failed", value: failed, color: "#ef4444" }] : []),
      ...(suspended > 0 ? [{ label: "Suspended", value: suspended, color: "#eab308" }] : []),
      ...(installing > 0 ? [{ label: "Installing", value: installing, color: "#38bdf8" }] : []),
      ...(other > 0 ? [{ label: "Other", value: other, color: "#a78bfa" }] : []),
    ];
  }, [servers]);

  const nodeResourceData = useMemo(() => Array.isArray(nodes)
    ? nodes.filter((node): node is ApiNode & { memoryMb: number } => typeof node.memoryMb === "number" && Number.isFinite(node.memoryMb)).map((node) => ({ id: node.id, label: node.name, value: node.memoryMb, max: node.memoryMb }))
    : [], [nodes]);

  const overallStatus: string = ((healthQuery.data as { status?: string } | undefined)?.status as string) ?? (failures.length > 0 ? "degraded" : "ok");
  const overallTone = overallStatus === "ok" ? "green" : overallStatus === "warning" || overallStatus === "degraded" ? "yellow" : "red";
  const pendingAttention = failures.length;

  return (
    <AdminPageLayout>
      <SectionHeader
        title="Overview"
        sub="Forge state, attention, fleet, workloads, capacity and recent activity — what to know right now."
        action={
          <div className="flex gap-2">
            <Btn tone="ghost" onClick={() => router.push("/admin/monitoring")}>Monitoring <ArrowUpRight size={12} /></Btn>
            <Btn tone="ghost" onClick={() => router.push("/admin/health")}>Health <ArrowUpRight size={12} /></Btn>
          </div>
        }
      />

      {/* Forge state + Attention banner — distinct per target-ia §4 */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={`xl:col-span-2 flex flex-col justify-between border ${overallTone === "green" ? "border-emerald-500/20 bg-emerald-500/[0.04]" : overallTone === "yellow" ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-red-500/20 bg-red-500/[0.06]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-9 w-9 place-items-center rounded-xl border ${overallTone === "green" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : overallTone === "yellow" ? "border-amber-500/20 bg-amber-500/10 text-amber-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
                {overallTone === "green" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100">{healthQuery.isLoading ? "Loading control-plane state…" : healthQuery.isError ? "Control plane unreachable" : overallTone === "green" ? "Forge operational" : overallTone === "yellow" ? "Forge degraded" : "Forge attention required"}</p>
                <p className="text-xs text-slate-500">{healthQuery.isLoading ? "Checking health, nodes and workloads…" : healthQuery.isError ? String(healthQuery.error?.message ?? "Health API unavailable") : `${onlineNodes}/${nodes.length} beacons healthy · ${runningServers}/${servers.length} workloads running · ${users.length} users`}</p>
              </div>
            </div>
            <Pill tone={overallTone === "green" ? "green" : overallTone === "yellow" ? "yellow" : "red"}>{healthQuery.isLoading ? "…" : healthQuery.isError ? "unavailable" : overallStatus}</Pill>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Pill tone={nodesQuery.isError ? "red" : nodesQuery.isLoading ? "yellow" : onlineNodes === nodes.length && nodes.length > 0 ? "green" : "yellow"}>Beacons: {nodesQuery.isError ? "unavailable" : nodesQuery.isLoading ? "…" : `${onlineNodes} healthy of ${nodes.length}`}</Pill>
            <Pill tone={serversQuery.isError ? "red" : serversQuery.isLoading ? "yellow" : runningServers > 0 ? "green" : "neutral"}>Workloads: {serversQuery.isError ? "unavailable" : serversQuery.isLoading ? "…" : `${runningServers} running`}</Pill>
            <Pill tone={healthQuery.isError ? "red" : healthQuery.isLoading ? "yellow" : failedChecks.length > 0 ? "red" : "green"}>Checks: {healthQuery.isError ? "unavailable" : healthQuery.isLoading ? "…" : `${checks.length - failedChecks.length}/${checks.length} ok`}</Pill>
          </div>
        </Card>

        <Card className={pendingAttention > 0 ? "border-amber-500/20 bg-amber-500/[0.04]" : "border-white/[0.07] bg-white/[0.015]"}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><AlertTriangle size={14} className={pendingAttention > 0 ? "text-amber-400" : "text-emerald-400"} /> Attention</h3>
            <span className="font-mono text-xs text-slate-500">{pendingAttention} item{pendingAttention === 1 ? "" : "s"}</span>
          </div>
          {pendingAttention === 0 ? (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs leading-5 text-emerald-200">No actionable failures — fleet heartbeat, workloads and control-plane checks are healthy. See <button type="button" className="underline hover:text-emerald-100" onClick={() => router.push("/admin/health")}>Health</button> for deep diagnostics.</div>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-black/10">
              {failures.slice(0, 3).map((f) => (
                <li key={f.id} className="px-3 py-2">
                  <p className="truncate text-xs font-semibold text-amber-200">{f.label}</p>
                  <p className="truncate text-xs text-slate-500">{f.detail}</p>
                </li>
              ))}
            </ul>
          )}
          {pendingAttention > 3 && <button type="button" onClick={() => router.push("/admin/health")} className="mt-2 text-xs text-amber-300 hover:text-amber-200">View all {pendingAttention} →</button>}
        </Card>
      </div>

      {/* Pills row — compact inventory availability */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="self-center text-xs text-slate-600 mr-1">Sources:</span>
        <Pill tone={nodesQuery.isError ? "red" : nodesQuery.isLoading ? "yellow" : "green"}>Nodes: {nodesQuery.isError ? "unavailable" : nodesQuery.isLoading ? "loading" : "available"}</Pill>
        <Pill tone={serversQuery.isError ? "red" : serversQuery.isLoading ? "yellow" : "green"}>Servers: {serversQuery.isError ? "unavailable" : serversQuery.isLoading ? "loading" : "available"}</Pill>
        <Pill tone={usersQuery.isError ? "red" : usersQuery.isLoading ? "yellow" : "green"}>Users: {usersQuery.isError ? "unavailable" : usersQuery.isLoading ? "loading" : "available"}</Pill>
        <Pill tone={healthQuery.isError ? "red" : healthQuery.isLoading ? "yellow" : "green"}>Health: {healthQuery.isError ? "unavailable" : healthQuery.isLoading ? "loading" : "available"}</Pill>
        <Pill tone={activityQuery.isError ? "red" : activityQuery.isLoading ? "yellow" : "green"}>Activity: {activityQuery.isError ? "unavailable" : activityQuery.isLoading ? "loading" : "available"}</Pill>
      </div>

      {(nodesQuery.isError || serversQuery.isError || usersQuery.isError || healthQuery.isError || activityQuery.isError) && (
        <div className="space-y-2">
          {nodesQuery.isError && <QueryError message={`Beacons unavailable — fleet and capacity coverage incomplete. (${nodesQuery.error?.message ?? "unknown error"})`} />}
          {serversQuery.isError && <QueryError message={`Workload inventory unavailable — status and capacity incomplete. (${serversQuery.error?.message ?? "unknown error"})`} />}
          {usersQuery.isError && <QueryError message={`Users unavailable. (${usersQuery.error?.message ?? "unknown error"})`} />}
          {healthQuery.isError && <QueryError message={`Control-plane health unavailable — Attention list is incomplete. (${healthQuery.error?.message ?? "unknown error"})`} />}
          {activityQuery.isError && <QueryError message={`Activity unavailable. (${activityQuery.error?.message ?? "unknown error"})`} />}
        </div>
      )}

      <StatsRow items={[
        { label: "Beacons", value: nodesQuery.isError ? "Unavailable" : nodesQuery.isLoading ? "…" : nodes.length, icon: Network, tone: nodesQuery.isError || nodesQuery.isLoading || nodes.length === 0 ? "neutral" : onlineNodes === nodes.length ? "green" : "yellow" },
        { label: "Workloads", value: serversQuery.isError ? "Unavailable" : serversQuery.isLoading ? "…" : servers.length, icon: Layers, tone: serversQuery.isError || serversQuery.isLoading ? "neutral" : "blue" },
        { label: "Running", value: serversQuery.isError ? "Unavailable" : serversQuery.isLoading ? "…" : runningServers, icon: Server, tone: serversQuery.isError || serversQuery.isLoading ? "neutral" : "green" },
        { label: "Users", value: usersQuery.isError ? "Unavailable" : usersQuery.isLoading ? "…" : users.length, icon: Shield, tone: "neutral" },
      ]} />

      {/* Fleet vs Workloads — distinct per §4 Build/Run */}
      <div className="grid gap-6 lg:grid-cols-2">
        {serversQuery.isError ? (
          <Card><CardHeader title="Workload status distribution" icon={Activity} /><QueryError message="Workload inventory is unavailable." /></Card>
        ) : serversQuery.isLoading ? (
          <Card><CardHeader title="Workload status distribution" icon={Activity} /><QueryLoading message="Loading workload inventory…" /></Card>
        ) : (
          <Card>
            <CardHeader title="Workload status distribution" icon={Activity} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/servers")}>View workloads <ArrowUpRight size={12} /></Btn>} />
            {servers.length === 0 ? <EmptyState icon={Activity} message="No workloads yet — create one from Catalog." /> : <StatusBreakdown data={serverStatusData} total={servers.length} />}
            <p className="mt-3 text-xs text-slate-600">Tap a workload type in Build → Servers/Apps/Game Servers for the filtered list. See Monitoring for resource usage over time.</p>
          </Card>
        )}

        {nodesQuery.isError ? (
          <Card><CardHeader title="Beacon capacity — memory per beacon" icon={HardDrive} /><QueryError message="Beacons are unavailable." /></Card>
        ) : nodesQuery.isLoading ? (
          <Card><CardHeader title="Beacon capacity — memory per beacon" icon={HardDrive} /><QueryLoading message="Loading beacon capacity…" /></Card>
        ) : (
          <Card>
            <CardHeader title="Beacon capacity — memory per beacon" icon={HardDrive} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/nodes")}>Manage beacons <ArrowUpRight size={12} /></Btn>} />
            {nodes.length === 0 ? <EmptyState icon={HardDrive} message="No beacons — add a beacon to host workloads." /> : nodeResourceData.length === 0 ? <EmptyState icon={HardDrive} message="Memory capacity not reported by beacons." /> : <><SimpleBarChart data={nodeResourceData} title="Configured memory capacity per beacon (MiB)" /><p className="mt-4 text-xs text-slate-500">Coverage: {nodeResourceData.length} of {nodes.length} beacons reported configured memory.</p></>}
          </Card>
        )}
      </div>

      {/* Capacity overview — mirrors Build/Infra model */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="min-h-[160px]">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Configured server memory — sum of Workload resources.memory</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{serversQuery.isError ? "Unavailable" : serversQuery.isLoading ? "…" : serverMemoryConfiguration.reported ? `${serverMemoryConfiguration.value.toLocaleString()} MiB` : "Not reported"}</p>
          <p className="mt-1 text-xs text-slate-500">{serversQuery.isError ? "Workload inventory is unavailable." : serversQuery.isLoading ? "Waiting for workload inventory." : `Reported by ${serverMemoryConfiguration.reported} of ${serverMemoryConfiguration.total} workloads.`}</p>
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs text-slate-400">Beacon configured capacity: {nodesQuery.isError ? "unavailable" : nodesQuery.isLoading ? "…" : nodeMemoryCapacity.reported ? `${nodeMemoryCapacity.value.toLocaleString()} MiB across ${nodeMemoryCapacity.reported}/${nodeMemoryCapacity.total} beacons` : "not reported"}</p>
          <p className="mt-1 text-xs text-slate-600">Capacity is configured allocation, not live usage. See Monitoring for live CPU/mem/disk over time.</p>
        </Card>
        <Card className="min-h-[160px]">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Configured server disk — sum of Workload resources.disk</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{serversQuery.isError ? "Unavailable" : serversQuery.isLoading ? "…" : serverDiskConfiguration.reported ? `${serverDiskConfiguration.value.toLocaleString()} MiB` : "Not reported"}</p>
          <p className="mt-1 text-xs text-slate-500">{serversQuery.isError ? "Workload inventory is unavailable." : serversQuery.isLoading ? "Waiting for workload inventory." : `Reported by ${serverDiskConfiguration.reported} of ${serverDiskConfiguration.total} workloads.`}</p>
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs text-slate-400">Beacon configured capacity: {nodesQuery.isError ? "unavailable" : nodesQuery.isLoading ? "…" : nodeDiskCapacity.reported ? `${nodeDiskCapacity.value.toLocaleString()} MiB across ${nodeDiskCapacity.reported}/${nodeDiskCapacity.total} beacons` : "not reported"}</p>
        </Card>
      </div>

      {/* Heartbeat & Server inventory — fleet deep dive */}
      <div className="grid gap-6 md:grid-cols-2">
        {nodesQuery.isError ? (
          <Card><CardHeader title="Persisted beacon heartbeat" icon={Network} /><QueryError message="Beacons are unavailable." /></Card>
        ) : nodesQuery.isLoading ? (
          <Card><CardHeader title="Persisted beacon heartbeat" icon={Network} /><QueryLoading message="Loading persisted heartbeat…" /></Card>
        ) : (
          <Card>
            <CardHeader title="Persisted beacon heartbeat" icon={Network} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/nodes")}>Beacons →</Btn>} />
            {nodes.length === 0 ? <EmptyState icon={Network} message="No beacons configured." /> : (
              <>
                <div className="-mx-4 sm:-mx-5 border-b border-white/[0.04] px-4 sm:px-5 py-3 text-xs text-slate-400">{onlineNodes} healthy · {heartbeatReportedNodes}/{nodes.length} beacons have a persisted heartbeat</div>
                <ul className="-mx-4 sm:-mx-5 divide-y divide-white/[0.04] max-h-[280px] overflow-auto">
                  {nodes.slice(0, 10).map((node) => (
                    <li key={node.id} className="flex items-center justify-between px-4 sm:px-5 py-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{node.name}</p><p className="truncate text-xs text-slate-500">{node.fqdn ?? node.region}</p></div>
                      <Pill tone={hasHealthyPersistedHeartbeat(node) ? "green" : node.heartbeatState === "degraded" ? "yellow" : node.heartbeatState ? "red" : "neutral"}>{hasHealthyPersistedHeartbeat(node) ? "healthy" : `${node.heartbeatState ?? "unreported"}`}</Pill>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        {serversQuery.isError ? (
          <Card><CardHeader title="Workload inventory" icon={Layers} /><QueryError message="Workload inventory is unavailable." /></Card>
        ) : serversQuery.isLoading ? (
          <Card><CardHeader title="Workload inventory" icon={Layers} /><QueryLoading message="Loading workload inventory…" /></Card>
        ) : (
          <Card>
            <CardHeader title="Workload inventory — newest 8" icon={Layers} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/servers")}>All workloads →</Btn>} />
            {servers.length === 0 ? <EmptyState icon={Layers} message="No workloads yet." /> : (
              <>
                <div className="-mx-4 sm:-mx-5 border-b border-white/[0.04] px-4 sm:px-5 py-3 text-xs text-slate-400">Showing {Math.min(8, servers.length)} of {servers.length} workloads.</div>
                <ul className="-mx-4 sm:-mx-5 divide-y divide-white/[0.04]">
                  {servers.slice(0, 8).map((server) => (
                    <li key={server.id} className="flex items-center justify-between px-4 sm:px-5 py-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{server.name}</p><p className="truncate text-xs text-slate-500">{String((server as unknown as { node?: unknown }).node ?? (server as unknown as { nodeId?: unknown }).nodeId ?? "—")}</p></div>
                      <Pill tone={server.status === "running" ? "green" : server.status === "stopped" ? "neutral" : "yellow"}>{(server as unknown as { suspended?: boolean }).suspended ? "suspended" : server.status}</Pill>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Configured capacity coverage" icon={HardDrive} />
          {serversQuery.isError ? <QueryError message="Workload inventory is unavailable; configured capacity cannot be calculated." /> : serversQuery.isLoading ? <QueryLoading message="Loading configured capacity…" /> : (
            <div className="space-y-3 text-sm">
              <div><p className="text-xs uppercase text-slate-500">Memory configuration</p><p className="mt-1 font-semibold text-slate-200">{serverMemoryConfiguration.reported ? `${serverMemoryConfiguration.value.toLocaleString()} MiB across ${serverMemoryConfiguration.reported} of ${serverMemoryConfiguration.total} workloads` : `No memory configuration reported by ${serverMemoryConfiguration.total} workloads.`}</p></div>
              <div><p className="text-xs uppercase text-slate-500">Disk configuration</p><p className="mt-1 font-semibold text-slate-200">{serverDiskConfiguration.reported ? `${serverDiskConfiguration.value.toLocaleString()} MiB across ${serverDiskConfiguration.reported} of ${serverDiskConfiguration.total} workloads` : `No disk configuration reported by ${serverDiskConfiguration.total} workloads.`}</p></div>
              <p className="border-t border-white/[0.06] pt-3 text-xs text-slate-500">Totals include only finite configured values. Capacity is configured allocation, not live usage.</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Actionable failures — Attention lane" icon={AlertTriangle} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/health")}>Health →</Btn>} />
          {(nodesQuery.isError || serversQuery.isError || healthQuery.isError) ? (
            <><QueryError message={`List incomplete: ${[nodesQuery.isError && "beacons", serversQuery.isError && "workloads", healthQuery.isError && "health"].filter(Boolean).join(", ")} unavailable.`} />
              {failures.length > 0 && <ul className="-mx-4 sm:-mx-5 divide-y divide-white/[0.04]">{failures.slice(0, 10).map((failure) => <li className="px-4 sm:px-5 py-3" key={failure.id}><p className="truncate font-semibold text-red-300">{failure.label}</p><p className="text-xs text-slate-400">{failure.detail}</p></li>)}</ul>}</>
          ) : (nodesQuery.isLoading || serversQuery.isLoading || healthQuery.isLoading) ? (
            <QueryLoading message="Loading heartbeat, workloads and health…" />
          ) : failures.length === 0 ? (
            <EmptyState icon={AlertTriangle} message="No failures reported — fleet and control plane are healthy." />
          ) : (
            <ul className="-mx-4 sm:-mx-5 divide-y divide-white/[0.04]">
              {failures.slice(0, 10).map((failure) => <li className="px-4 sm:px-5 py-3" key={failure.id}><p className="truncate font-semibold text-red-300">{failure.label}</p><p className="text-xs text-slate-400">{failure.detail}</p></li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-600">For incident remediation, see Health. For time-series degradation, see Monitoring.</p>
        </Card>

        {activityQuery.isError ? (
          <Card><CardHeader title="Recent admin activity" icon={Shield} /><QueryError message="Activity API unavailable." /></Card>
        ) : activityQuery.isLoading ? (
          <Card><CardHeader title="Recent admin activity" icon={Shield} /><QueryLoading message="Loading administrative activity…" /></Card>
        ) : (
          <Card>
            <CardHeader title="Recent admin activity" icon={Shield} action={<Btn size="sm" tone="ghost" onClick={() => router.push("/admin/activity")}>Activity →</Btn>} />
            {(activityQuery.data ?? []).length === 0 ? <EmptyState icon={Shield} message="No administrative activity." /> : (
              <ul className="-mx-4 sm:-mx-5 divide-y divide-white/[0.04]">
                {(activityQuery.data ?? []).slice(0, 8).map((event) => (
                  <li className="px-4 sm:px-5 py-4" key={event.id}>
                    <div className="flex justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-200">{event.action}</p><time className="shrink-0 text-xs tabular-nums text-slate-500">{new Date(event.createdAt).toLocaleString()}</time></div>
                    <p className="truncate text-xs text-slate-500">{event.actorEmail ?? "system"} · {event.targetType}{event.targetId ? `:${event.targetId}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card>
          <CardHeader title="Command links" icon={Database} />
          <div className="grid gap-2">
            {([
              { label: "Monitoring — what happens over time", desc: "Charts 1h–30d · node-scoped · no telemetry = empty, not fake", href: "/admin/monitoring" },
              { label: "Health — what's wrong", desc: "Failures, degraded, remediation · distinct from Monitoring", href: "/admin/health" },
              { label: "Activity — who did what", desc: "Audit timeline · timeline_events · export CSV/JSON", href: "/admin/activity" },
              { label: "Beacons — where workloads run", desc: "8-tab detail · capability delta · placements", href: "/admin/nodes" },
            ] as const).map((link) => (
              <button key={link.href} type="button" onClick={() => router.push(link.href)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] hover:border-white/10 transition">
                <div><p className="text-sm font-medium text-slate-200">{link.label}</p><p className="text-xs text-slate-500">{link.desc}</p></div>
                <ArrowUpRight size={14} className="text-slate-600" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
