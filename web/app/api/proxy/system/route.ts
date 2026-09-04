import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/api-base";
import { authenticatedHeaders, NO_STORE } from "@/lib/forge-proxy";

type HostInfo = { os?: string; arch?: string; kernel?: string; cpuCores?: number; uptimeSeconds?: number };
type MemoryInfo = { totalMb?: number; usedMb?: number; freeMb?: number };
type DiskInfo = { mountPoint?: string; totalMb?: number; usedMb?: number; freeMb?: number };

const mib = (value = 0) => value * 1024 * 1024;

export async function GET(request: NextRequest) {
  const headers = authenticatedHeaders(request);
  if (headers instanceof NextResponse) return headers;

  // These endpoints describe one specific machine. Calling them without a
  // nodeId used to have the API pick whichever node happened to have
  // credentials first, so this page reported an arbitrary Beacon's CPU,
  // memory and disk as though they were "the system".
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) {
    return NextResponse.json(
      { error: "Select a Beacon to view its system information." },
      { status: 400, headers: { "Cache-Control": NO_STORE } },
    );
  }
  const query = `?nodeId=${encodeURIComponent(nodeId)}`;

  try {
    const options = { headers, signal: AbortSignal.timeout(5000), cache: "no-store" as const };
    const [hostResponse, memoryResponse, diskResponse] = await Promise.all([
      fetch(`${API_BASE}/api/v1/host/info${query}`, options),
      fetch(`${API_BASE}/api/v1/host/memory${query}`, options),
      fetch(`${API_BASE}/api/v1/host/disk${query}`, options),
    ]);
    if (!hostResponse.ok || !memoryResponse.ok || !diskResponse.ok) {
      return NextResponse.json({ error: "System info unavailable" }, { status: 502, headers: { "Cache-Control": NO_STORE } });
    }
    const host = await hostResponse.json() as HostInfo;
    const memory = await memoryResponse.json() as MemoryInfo;
    const partitions = await diskResponse.json() as DiskInfo[];
    const disk = partitions.find((entry) => entry.mountPoint === "/") ?? partitions[0] ?? {};
    return NextResponse.json({
      version: host.kernel ?? "unknown",
      os: host.os ?? "unknown",
      architecture: host.arch ?? "unknown",
      cpuThreads: host.cpuCores ?? 0,
      memory: { total: mib(memory.totalMb), used: mib(memory.usedMb), free: mib(memory.freeMb) },
      disk: { total: mib(disk.totalMb), used: mib(disk.usedMb), free: mib(disk.freeMb) },
      // All three host reads succeeded, so the Beacon answered.
      runtime: { reachable: true },
      uptime: host.uptimeSeconds ?? 0,
      // Nothing reports a session count for a Beacon. This was hardcoded to 0,
      // which reads as "no active sessions" rather than "not measured".
      activeSessions: null,
    }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json(
      { error: "System info unreachable" },
      { status: 502, headers: { "Cache-Control": NO_STORE } },
    );
  }
}
