import { fetchJSON, postJSON } from './http';
import type { ApiEndpointHealthRecord } from './types';

export interface NodeMetrics {
  id: string;
  nodeId: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  cpuLoad1m: number;
  cpuLoad5m: number;
  cpuLoad15m: number;
  networkRxBytes: number;
  networkTxBytes: number;
  containerRunning: number;
  containerTotal: number;
  observedAt: string;
}

// The summary returns health_history rows, not complete endpoint telemetry.
// Optional endpoint fields are retained only when actually reported.
export type MonitoringHealthRecord = Partial<ApiEndpointHealthRecord> & {
  checkName?: string;
  name?: string;
  message?: string;
  latencyMs?: number;
  critical?: boolean;
  details?: Record<string, unknown>;
};

export interface SystemInfo {
  nodes?: NodeMetrics[] | null;
  unacknowledgedAlerts?: number | null;
  recentHealthChecks?: MonitoringHealthRecord[] | null;
  totalServers?: number;
  totalUsers?: number;
}

export interface AlertEvent {
  id: string;
  type: string;
  message: string;
  severity: string;
  acknowledged: boolean;
  createdAt: string;
}

export async function getNodeMetrics(params?: { nodeId?: string; period?: string; limit?: number; since?: string }): Promise<NodeMetrics[]> {
  const query = new URLSearchParams();
  if (params?.nodeId) query.set('nodeId', params.nodeId);
  if (params?.period) query.set('period', params.period);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.since) query.set('since', params.since);
  const qs = query.toString();
  const res = await fetchJSON<{ data: NodeMetrics[] }>(`/monitoring/nodes/metrics${qs ? `?${qs}` : ''}`);
  return res.data ?? [];
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const data = await fetchJSON<SystemInfo>('/monitoring/summary');
  return {
    ...data,
    recentHealthChecks: data.recentHealthChecks?.map((row) => ({
      ...row,
      endpointId: row.endpointId ?? row.checkName ?? row.name,
    })),
  };
}

export async function getAlertHistory(params?: { page?: number; limit?: number }): Promise<AlertEvent[]> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const res = await fetchJSON<{ alerts: AlertEvent[] }>(`/alerts${qs ? `?${qs}` : ''}`);
  return res.alerts ?? [];
}

export function acknowledgeAlert(id: string): Promise<void> {
  return postJSON<void>(`/alerts/${encodeURIComponent(id)}/acknowledge`);
}

export function getAlert(id: string): Promise<AlertEvent> {
  return fetchJSON<AlertEvent>(`/alerts/${encodeURIComponent(id)}`);
}

export function resolveAlert(id: string): Promise<void> {
  return postJSON<void>(`/alerts/${encodeURIComponent(id)}/resolve`);
}

/** @deprecated Use resolveAlert (POST) — kept for backward compat with task spec mentioning GET */
export function resolveAlertGET(id: string): Promise<void> {
  return fetchJSON<void>(`/alerts/${encodeURIComponent(id)}/resolve`);
}

export type MetricPeriod = "1h" | "6h" | "24h" | "7d" | "30d";

export function metricWindow(period: MetricPeriod): { limit: number; since: string } {
  const now = Date.now();
  const map: Record<MetricPeriod, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const duration = map[period] ?? map["1h"];
  const limit = period === "1h" ? 60 : period === "6h" ? 72 : period === "24h" ? 96 : period === "7d" ? 168 : 240;
  return { limit, since: new Date(now - duration).toISOString() };
}
