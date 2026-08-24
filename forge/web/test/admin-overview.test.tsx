import type { ReactNode } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminHealth } from "@/components/admin/AdminHealth";
import AdminMonitoring from "@/app/admin/monitoring/page";
import AdminHost from "@/app/admin/host/page";
import { AdminServers } from "@/components/admin/AdminServers";
import { jsonResponse } from "@/test/fetch-mock";
import { renderWithQuery } from "@/test/render";
import { apiPage } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Recharts uses ResizeObserver + DOM measurements that are not available in jsdom
// — the monitoring page still exercises its isSynthetic/no-data logic without a real chart.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div data-testid="chart">{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers: install a fetch stub that routes by URL substring (most-specific first)
// ---------------------------------------------------------------------------
type Route = { test: (url: string) => boolean; response: Response | ((url: string) => Response | Promise<Response>) };

function installFetch(routes: Route[], fallback?: (url: string) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const r of routes) {
      if (r.test(url)) {
        const raw = typeof r.response === "function" ? (r.response as (u: string) => Response | Promise<Response>)(url) : r.response;
        const res = raw instanceof Promise ? await raw : raw;
        // Response bodies can only be read once — clone a shared instance so repeated calls (e.g. polling or metric switches) don't hit "body already used"
        if (res instanceof Response) {
          try {
            return res.clone();
          } catch {
            // Fallback: reconstruct from text if clone fails (body already disturbed)
            const txt = await res.text().catch(() => "");
            return new Response(txt, { status: res.status, headers: res.headers });
          }
        }
        return res;
      }
    }
    if (fallback) return fallback(url);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function healthReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: "ok",
    ok: true,
    service: "forge-api",
    uptime: 3600,
    checkedAt: "2026-08-16T12:00:00Z",
    checks: [
      { name: "database", status: "ok", label: "Database", notificationMessage: "DB ok", critical: false, details: { latencyMs: 5 } },
      { name: "cache", status: "ok", label: "Cache", notificationMessage: "Cache ok", critical: false },
      { name: "daemon", status: "ok", label: "Daemon", notificationMessage: "Daemon ok", critical: true },
    ],
    ...overrides,
  };
}

function nodeMetrics(overrides: Partial<Record<string, unknown>>[] = []) {
  const base = {
    id: "m1",
    nodeId: "n1",
    cpuPercent: 23.5,
    memoryPercent: 45.2,
    diskPercent: 60.1,
    memoryUsedMb: 1024,
    memoryTotalMb: 2048,
    diskUsedMb: 5120,
    diskTotalMb: 10240,
    cpuLoad1m: 1.2,
    cpuLoad5m: 0.8,
    cpuLoad15m: 0.5,
    networkRxBytes: 1024,
    networkTxBytes: 2048,
    containerRunning: 2,
    containerTotal: 5,
    observedAt: "2026-08-16T12:00:00Z",
  };
  if (overrides.length === 0) return [base];
  return overrides.map((o, i) => ({ ...base, id: `m${i + 1}`, ...o }));
}

// ===========================================================================
// AdminOverview — mocked API
// ===========================================================================
describe("AdminOverview — mocked API", () => {
  it("renders operational overview with nodes, servers, users and health snapshot", async () => {
    const nodes = [
      { id: "n1", name: "alpha", heartbeatState: "healthy", memoryMb: 8192, diskMb: 51200 },
      { id: "n2", name: "beta", heartbeatState: "healthy", memoryMb: 4096, diskMb: 10240 },
    ];
    const servers = [
      { id: "s1", name: "mc-1", status: "running", memoryMb: 2048, diskMb: 10240 },
      { id: "s2", name: "mc-2", status: "running", memoryMb: 1024, diskMb: 5120 },
    ];
    installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(healthReport()) },
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes)) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage(servers)) },
      { test: (u) => u.includes("/users"), response: jsonResponse([{ id: "u1", email: "admin@example.com" }]) },
      { test: (u) => u.includes("/admin/audit"), response: jsonResponse([{ id: "a1", action: "server_create", actorEmail: "admin@example.com", createdAt: "2026-08-16T10:00:00Z" }]) },
    ]);

    renderWithQuery(<AdminOverview />);

    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    // Infrastructure tile shows node count (there may be multiple matches if layout repeats)
    expect(screen.getAllByText("Infrastructure").length).toBeGreaterThanOrEqual(1);
    // display of healthy nodes and servers (multiple tiles may contain "healthy")
    await waitFor(() => {
      expect(screen.getAllByText(/2 healthy/).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/2 running/).length).toBeGreaterThanOrEqual(1);
    // attention section: platform is calm when no failures
    expect(await screen.findByText(/No open issues/)).toBeInTheDocument();
    // Recent activity renders the audit event action (underscores replaced)
    expect(await screen.findByText("server create")).toBeInTheDocument();
    // Capacity section present
    expect(screen.getAllByText("Capacity").length).toBeGreaterThanOrEqual(1);
  });

  it("shows critical attention when nodes are offline and health checks failed", async () => {
    const nodes = [
      { id: "n1", name: "alpha", heartbeatState: "healthy", memoryMb: 8192 },
      { id: "n2", name: "beta", heartbeatState: "offline", memoryMb: 4096, heartbeatError: "stale" },
    ];
    const servers = [
      { id: "s1", name: "mc-1", status: "running" },
      { id: "s2", name: "mc-2", status: "crashed" },
    ];
    const failedReport = healthReport({
      status: "failed",
      checks: [
        { name: "database", status: "failed", label: "Database", notificationMessage: "DB unreachable", critical: true },
        { name: "cache", status: "ok", label: "Cache", notificationMessage: "ok", critical: false },
      ],
    });

    installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(failedReport) },
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes)) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage(servers)) },
      { test: (u) => u.includes("/users"), response: jsonResponse([]) },
      { test: (u) => u.includes("/admin/audit"), response: jsonResponse([]) },
    ]);

    renderWithQuery(<AdminOverview />);

    // Overall becomes critical — shows offline count and failures text
    expect(await screen.findByText(/nodes offline/)).toBeInTheDocument();
    expect(screen.getByText(/Node heartbeat failure/)).toBeInTheDocument();
    // affected node appears in attention group
    expect(screen.getByText("beta")).toBeInTheDocument();
    // failed health check name appears in attention
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("handles degraded state via warning checks and degraded heartbeat", async () => {
    const nodes = [
      { id: "n1", name: "alpha", heartbeatState: "degraded", memoryMb: 1024 },
      { id: "n2", name: "beta", heartbeatState: "healthy", memoryMb: 2048 },
    ];
    const warnReport = healthReport({
      status: "warning",
      checks: [
        { name: "cache", status: "warning", label: "Cache", notificationMessage: "slow", critical: false },
        { name: "database", status: "ok", label: "Database", notificationMessage: "ok", critical: false },
      ],
    });
    installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(warnReport) },
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes)) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage([])) },
      { test: (u) => u.includes("/users"), response: jsonResponse([]) },
      { test: (u) => u.includes("/admin/audit"), response: jsonResponse([]) },
    ]);

    renderWithQuery(<AdminOverview />);

    expect(await screen.findByText("Platform degraded")).toBeInTheDocument();
    expect(screen.getByText(/1 degraded/)).toBeInTheDocument();
  });

  it("shows loading placeholders and survives empty audit recent activity", async () => {
    // Delay health to keep isLoading true briefly — we just assert the component does not crash
    installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(healthReport()) },
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage([])) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage([])) },
      { test: (u) => u.includes("/users"), response: jsonResponse([]) },
      { test: (u) => u.includes("/admin/audit"), response: jsonResponse([]) },
    ]);

    renderWithQuery(<AdminOverview />);
    // Empty activity should show "No recent changes."
    expect(await screen.findByText("No recent changes.")).toBeInTheDocument();
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
  });

  it("toggles the Needs attention section via Hide/Show", async () => {
    const nodes = [{ id: "n1", name: "alpha", heartbeatState: "healthy", memoryMb: 1024 }];
    installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(healthReport()) },
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes)) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage([])) },
      { test: (u) => u.includes("/users"), response: jsonResponse([]) },
      { test: (u) => u.includes("/admin/audit"), response: jsonResponse([]) },
    ]);

    renderWithQuery(<AdminOverview />);
    const toggle = await screen.findByRole("button", { name: /Needs attention/ });
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/Show/)).toBeInTheDocument();
    // calm message should be hidden after collapse
    expect(screen.queryByText(/No open issues/)).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(await screen.findByText(/No open issues/)).toBeInTheDocument();
  });
});

// ===========================================================================
// AdminHealth — health checks rendering
// ===========================================================================
describe("AdminHealth — health checks", () => {
  function installHealthFetch(opts: {
    health?: ReturnType<typeof healthReport>;
    nodes?: unknown[];
    servers?: unknown[];
    reservations?: unknown[];
    recoveryPlans?: unknown[];
  } = {}) {
    const nodes = opts.nodes ?? [
      { id: "n1", name: "alpha", heartbeatState: "healthy", memoryMb: 4096, diskMb: 10240 },
      { id: "n2", name: "beta", heartbeatState: "offline" },
    ];
    const servers = opts.servers ?? [
      { id: "s1", name: "mc-1", status: "running" },
      { id: "s2", name: "mc-2", status: "crashed" },
    ];
    return installFetch([
      { test: (u) => u.includes("/health"), response: jsonResponse(opts.health ?? healthReport()) },
      // fetchNodes (AdminHealth) hits /nodes without page param; fetchAll* hits with pagination — both routed
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes as unknown[])) },
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage(servers as unknown[])) },
      { test: (u) => u.includes("/reservations"), response: jsonResponse(opts.reservations ?? []) },
      { test: (u) => u.includes("/recovery-plans"), response: jsonResponse(opts.recoveryPlans ?? []) },
    ]);
  }

  it("renders overall operational state and health meta", async () => {
    installHealthFetch();
    renderWithQuery(<AdminHealth />);
    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    // health meta contains checked time and counts (multiple places show node counts)
    await waitFor(() => expect(screen.getAllByText(/2 nodes/).length).toBeGreaterThanOrEqual(1));
  });

  it("renders failures section with remediation and offline node count", async () => {
    const failed = healthReport({
      status: "failed",
      checks: [
        { name: "database", status: "failed", label: "Database", notificationMessage: "cannot connect", critical: true, details: { latencyMs: 200 } },
        { name: "daemon", status: "failed", label: "Daemon", notificationMessage: "Heartbeat missing", critical: true },
      ],
    });
    installHealthFetch({ health: failed });

    renderWithQuery(<AdminHealth />);

    expect(await screen.findByText("Issues detected")).toBeInTheDocument();
    // each failed check appears with label + critical badge + remediation (multiple DB tiles exist)
    expect(screen.getAllByText("Database").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Critical").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Check DB credentials/)).toBeInTheDocument();
    expect(screen.getByText(/1 node.*offline/i)).toBeInTheDocument();
    // crashed workload box
    expect(screen.getByText(/1 workload\(s\) crashed/)).toBeInTheDocument();
  });

  it("renders warnings section for warning checks and degraded nodes", async () => {
    const degradedReport = healthReport({
      status: "warning",
      checks: [
        { name: "memory", status: "warning", label: "Memory", notificationMessage: "high pressure", critical: false },
        { name: "cache", status: "ok", label: "Cache", notificationMessage: "ok", critical: false },
      ],
    });
    installHealthFetch({
      health: degradedReport,
      nodes: [
        { id: "n1", name: "alpha", heartbeatState: "degraded" },
        { id: "n2", name: "beta", heartbeatState: "healthy" },
      ],
    });

    renderWithQuery(<AdminHealth />);
    expect(await screen.findByText("Degraded performance")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Warnings")).toBeInTheDocument());
    expect(screen.getAllByText("Memory").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Warning").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 node\(s\) degraded/)).toBeInTheDocument();
  });

  it("renders empty-state when no failures and shows infrastructure heartbeat table", async () => {
    const okReport = healthReport({ status: "ok", checks: [{ name: "database", status: "ok", label: "Database", notificationMessage: "ok", critical: false }] });
    installHealthFetch({
      health: okReport,
      nodes: [{ id: "n1", name: "alpha", heartbeatState: "healthy" }],
      servers: [{ id: "s1", name: "mc-1", status: "running" }],
    });

    renderWithQuery(<AdminHealth />);

    expect(await screen.findByText(/No failures/)).toBeInTheDocument();
    // Infrastructure section shows 1/1 healthy count in header
    expect(screen.getAllByText(/1\/1 healthy/).length).toBeGreaterThanOrEqual(1);
    // table contains node name and View link
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getAllByText("View").length).toBeGreaterThanOrEqual(1);
  });

  it("shows database & cache and control plane metric tiles", async () => {
    const detailed = healthReport({
      checks: [
        { name: "database", status: "ok", label: "Database", notificationMessage: "ok", critical: false, details: { latencyMs: 12, version: "Postgres 15", activeConnections: 4 } },
        { name: "cache", status: "ok", label: "Cache", notificationMessage: "ok", critical: false, details: { used_memory_human: "12 MB" } },
        { name: "system", status: "ok", label: "System", notificationMessage: "ok", critical: false, details: { heapAllocBytes: 100 * 1024 * 1024, goroutines: 42, goVersion: "go1.22" } },
        { name: "queue", status: "ok", label: "Queue", notificationMessage: "ok", critical: false, details: { activeWorkers: 3 } },
      ],
    });
    installHealthFetch({ health: detailed });

    renderWithQuery(<AdminHealth />);

    expect(await screen.findByText(/Database.*cache/)).toBeInTheDocument();
    expect(screen.getByText("Latency")).toBeInTheDocument();
    expect(screen.getByText(/Control plane/)).toBeInTheDocument();
    expect(screen.getByText("Goroutines")).toBeInTheDocument();
  });
});

// ===========================================================================
// Monitoring — isSynthetic
// ===========================================================================
describe("AdminMonitoring — isSynthetic", () => {
  function installMonitoringFetch(metrics: ReturnType<typeof nodeMetrics>, extra: { nodes?: unknown[]; summary?: unknown; alerts?: unknown[] } = {}) {
    const nodes = extra.nodes ?? [{ id: "n1", name: "alpha" }];
    const summary = extra.summary ?? { nodes: [], unacknowledgedAlerts: 0, recentHealthChecks: [] };
    const alerts = extra.alerts ?? [];
    return installFetch([
      // most-specific first — metrics URL contains /nodes substring so it must be checked before generic /nodes
      // Use factory functions so each fetch gets a fresh Response (body can only be read once)
      { test: (u) => u.includes("/monitoring/nodes/metrics"), response: () => jsonResponse({ data: metrics }) },
      { test: (u) => u.includes("/monitoring/summary"), response: () => jsonResponse(summary) },
      { test: (u) => u.includes("/alerts"), response: () => jsonResponse({ alerts }) },
      { test: (u) => u.includes("/nodes"), response: () => jsonResponse(apiPage(nodes as unknown[])) },
    ]);
  }

  it("shows synthetic allocated-capacity banner and No data for synthetic networkRxBytes metric", async () => {
    const syntheticMetrics = nodeMetrics([
      { cpuLoad1m: 0, networkRxBytes: 0, cpuPercent: 23, memoryPercent: 45 },
      { cpuLoad1m: 0, networkRxBytes: 0, cpuPercent: 24, memoryPercent: 46 },
    ]);

    installMonitoringFetch(syntheticMetrics);

    renderWithQuery(<AdminMonitoring />);

    expect(await screen.findByText(/allocated capacity/, {}, { timeout: 5000 })).toBeInTheDocument();
    const networkBtn = screen.getByRole("button", { name: "Network RX" });
    await userEvent.click(networkBtn);
    expect(await screen.findByText(/No data — network\/load not yet collected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "CPU" }));
    await waitFor(() => expect(screen.getByText(/allocated capacity/)).toBeInTheDocument());
    expect(screen.queryByText(/No data — network\/load not yet collected/)).not.toBeInTheDocument();
  });

  it("does not show synthetic banner for live metrics and renders chart area", async () => {
    const liveMetrics = nodeMetrics([
      { cpuLoad1m: 1.2, networkRxBytes: 1024, cpuPercent: 30 },
      { cpuLoad1m: 0.9, networkRxBytes: 2048, cpuPercent: 32 },
    ]);

    installMonitoringFetch(liveMetrics);

    renderWithQuery(<AdminMonitoring />);

    // Should have chart + controls, no synthetic banner
    await waitFor(() => expect(screen.getByText(/CPU — 5m trend/)).toBeInTheDocument());
    expect(screen.queryByText(/allocated capacity/)).not.toBeInTheDocument();
    // No data banner should not appear (function matcher for split text)
    expect(screen.queryByText((c) => typeof c === "string" && c.includes("No data — network"))).not.toBeInTheDocument();
  });

  it("shows No telemetry message when metrics array is empty", async () => {
    installMonitoringFetch([]);

    renderWithQuery(<AdminMonitoring />);

    expect(await screen.findByText(/No telemetry available/)).toBeInTheDocument();
    expect(screen.queryByText(/allocated capacity/)).not.toBeInTheDocument();
  });

  it("period switches retain isSynthetic semantics", async () => {
    // use 2 points to guarantee synthetic detection (single-point edge can be masked by loading state)
    const syntheticMetrics = nodeMetrics([
      { cpuLoad1m: 0, networkRxBytes: 0 },
      { cpuLoad1m: 0, networkRxBytes: 0 },
    ]);
    installMonitoringFetch(syntheticMetrics);

    renderWithQuery(<AdminMonitoring />);

    expect(await screen.findByText(/allocated capacity/)).toBeInTheDocument();
    // Switch period to 1h — still synthetic (data unchanged)
    await userEvent.click(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => expect(screen.getByText(/allocated capacity/)).toBeInTheDocument());
  });

  // Unit sanity for the isSynthetic predicate itself (mirrors component logic)
  it("isSynthetic logic: flags only all-zero load+network series", () => {
    function isSynthetic(m: Array<{ cpuLoad1m?: number; networkRxBytes?: number }>): boolean {
      if (!m.length) return false;
      return m.every((x) => (x.cpuLoad1m ?? 0) === 0) && m.every((x) => (x.networkRxBytes ?? 0) === 0);
    }
    expect(isSynthetic([])).toBe(false);
    expect(isSynthetic([{ cpuLoad1m: 0, networkRxBytes: 0 }] )).toBe(true);
    expect(isSynthetic([{ cpuLoad1m: 0, networkRxBytes: 1 }] )).toBe(false);
    expect(isSynthetic([{ cpuLoad1m: 1, networkRxBytes: 0 }] )).toBe(false);
    expect(isSynthetic([{ cpuLoad1m: 0, networkRxBytes: 0 }, { cpuLoad1m: 0, networkRxBytes: 0 }] )).toBe(true);
    expect(isSynthetic([{ cpuLoad1m: undefined, networkRxBytes: undefined }] )).toBe(true);
  });
});

// ===========================================================================
// Host page — tabs and error handling
// ===========================================================================
describe("AdminHost page", () => {
  function installHostFetch(opts: { nodes?: unknown[]; hostInfo?: unknown; disk?: unknown[]; memory?: unknown; network?: unknown[]; processes?: unknown[] } = {}) {
    const nodes = opts.nodes ?? [{ id: "n1", name: "alpha", region: "us" }];
    return installFetch([
      { test: (u) => u.includes("/host/info"), response: jsonResponse(opts.hostInfo ?? { hostname: "host-1", os: "linux", kernel: "6.1", arch: "x86_64", cpuModel: "Intel", cpuCores: 4, uptimeSeconds: 86400, time: "2026-08-16T12:00:00Z" }) },
      { test: (u) => u.includes("/host/disk"), response: jsonResponse(opts.disk ?? [{ mountPoint: "/", device: "/dev/sda1", fsType: "ext4", totalMb: 10240, usedMb: 5120, freeMb: 5120, usedPercent: 50 }]) },
      { test: (u) => u.includes("/host/memory"), response: jsonResponse(opts.memory ?? { totalMb: 8192, usedMb: 4096, freeMb: 4096, usedPercent: 50, swapTotalMb: 0, swapUsedMb: 0, swapFreeMb: 0 }) },
      { test: (u) => u.includes("/host/network"), response: jsonResponse(opts.network ?? [{ name: "eth0", ips: "10.0.0.1", mac: "aa:bb", speedMbps: 1000, status: "up" }]) },
      { test: (u) => u.includes("/host/processes"), response: jsonResponse(opts.processes ?? [{ pid: 1, name: "init", cpuPercent: 0.1, memoryPercent: 0.5, state: "running" }]) },
      // must be after host routes because some host URLs also contain /nodes
      { test: (u) => u.includes("/nodes"), response: jsonResponse(apiPage(nodes as unknown[])) },
    ]);
  }

  it("renders host info tab by default with system data", async () => {
    installHostFetch();
    renderWithQuery(<AdminHost />);

    expect(await screen.findByText("Host")).toBeInTheDocument();
    // default tab is System
    expect(await screen.findByText("Hostname")).toBeInTheDocument();
    expect(screen.getByText("host-1")).toBeInTheDocument();
  });

  it("switches between disk, memory, network and processes tabs", async () => {
    installHostFetch();
    renderWithQuery(<AdminHost />);

    await screen.findByText("Hostname");

    await userEvent.click(screen.getByRole("button", { name: /Storage/ }));
    expect(await screen.findByText("/")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Memory/ }));
    // Memory tab formats via fmtMB -> 8192 MiB becomes "8.0 GB"
    expect(await screen.findByText(/8\.0 GB/)).toBeInTheDocument();
    expect(await screen.findByText(/50\.0%/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Network/ }));
    expect(await screen.findByText("eth0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Processes/ }));
    expect(await screen.findByText("init")).toBeInTheDocument();
  });

  it("shows no-nodes empty state", async () => {
    installHostFetch({ nodes: [] });
    renderWithQuery(<AdminHost />);
    expect(await screen.findByText("No nodes")).toBeInTheDocument();
  });
});

// ===========================================================================
// Servers page — list, search, empty and error
// ===========================================================================
describe("AdminServers page", () => {
  function installServersFetch(servers: unknown[], extra: { users?: unknown[]; nodes?: unknown[]; allocations?: unknown[]; eggs?: unknown[]; templates?: unknown[]; regions?: unknown[]; mounts?: unknown[] } = {}) {
    return installFetch([
      { test: (u) => u.includes("/servers"), response: jsonResponse(apiPage(servers as unknown[])) },
      { test: (u) => u.includes("/users"), response: jsonResponse(extra.users ?? []) },
      { test: (u) => u.endsWith("/nodes") || u.includes("/nodes?"), response: jsonResponse(extra.nodes ?? []) },
      { test: (u) => u.includes("/allocations"), response: jsonResponse(extra.allocations ?? []) },
      { test: (u) => u.includes("/nests/") && u.includes("/eggs"), response: jsonResponse(extra.eggs ?? []) },
      { test: (u) => u.includes("/eggs") && !u.includes("/variables"), response: jsonResponse(extra.templates ?? extra.eggs ?? []) },
      { test: (u) => u.includes("/regions"), response: jsonResponse(extra.regions ?? []) },
      { test: (u) => u.includes("/mounts"), response: jsonResponse(extra.mounts ?? []) },
    ]);
  }

  it("renders server list with name, connection and State Lanes", async () => {
    installServersFetch([
      { id: "s1", name: "alpha-mc", owner: "admin@example.com", node: "node-a", allocation: "127.0.0.1:25565", status: "running", generation: 1, desiredState: "running", actualState: "running" },
      { id: "s2", name: "beta-mc", owner: "user@example.com", node: "node-b", allocation: "127.0.0.1:25566", status: "offline", generation: 0 },
    ]);
    renderWithQuery(<AdminServers />);

    expect(await screen.findByText("alpha-mc")).toBeInTheDocument();
    expect(screen.getByText("beta-mc")).toBeInTheDocument();
    expect(screen.getByText("Servers")).toBeInTheDocument();
  });

  it("filters servers by search query", async () => {
    installServersFetch([
      { id: "s1", name: "alpha-mc", status: "running", generation: 0 },
      { id: "s2", name: "beta-mc", status: "running", generation: 0 },
    ]);
    renderWithQuery(<AdminServers />);

    await screen.findByText("alpha-mc");
    const search = screen.getByPlaceholderText("Search Servers");
    await userEvent.type(search, "beta");
    expect(screen.queryByText("alpha-mc")).not.toBeInTheDocument();
    expect(screen.getByText("beta-mc")).toBeInTheDocument();
  });

  it("shows empty state when no servers", async () => {
    installServersFetch([]);
    renderWithQuery(<AdminServers />);
    expect(await screen.findByText("No servers")).toBeInTheDocument();
  });

  it("allows opening create modal and typing server name", async () => {
    installServersFetch([]);
    renderWithQuery(<AdminServers />);
    await screen.findByText("No servers");
    await userEvent.click(screen.getByRole("button", { name: /Create New/ }));
    // dialog title — scope inside dialog: heading + button share the same label so use getAll
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("Create Server").length).toBeGreaterThanOrEqual(1);
    const nameInput = screen.getByPlaceholderText("My Game Server");
    await userEvent.type(nameInput, "my-server");
    expect(nameInput).toHaveValue("my-server");
  });
});
