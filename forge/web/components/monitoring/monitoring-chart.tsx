"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NodeMetrics } from "@/lib/api/monitoring";

type Metric = "cpuPercent" | "memoryPercent" | "diskPercent" | "networkRxBytes";

function metricColor(m: Metric): string {
  if (m === "cpuPercent") return "var(--phosphor)";
  if (m === "memoryPercent") return "var(--success)";
  if (m === "diskPercent") return "var(--fault)";
  return "var(--concrete)";
}

export function MonitoringAreaChart({
  data,
  metric,
  nodeId,
  nodeName,
}: {
  data: NodeMetrics[];
  metric: Metric;
  nodeId: string | null;
  nodeName?: string;
}) {
  const chartData = [...(data ?? [])]
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .map((m) => ({ ts: m.observedAt, v: (m as unknown as Record<string, number>)[metric] ?? 0 }));

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={metricColor(metric)} stopOpacity={0.28} />
            <stop offset="95%" stopColor={metricColor(metric)} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis
          dataKey="ts"
          tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => new Date(v).toLocaleTimeString()}
        />
        <YAxis
          tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v: number) => (metric === "networkRxBytes" ? `${(v / 1024).toFixed(0)} KB` : `${v}%`)}
          domain={metric === "networkRxBytes" ? [0, "auto"] : [0, 100]}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 shadow-xl">
                <div className="text-xs text-[var(--text-subtle)]">
                  {label ? new Date(label as string).toLocaleString() : ""}
                </div>
                <div className="text-sm font-medium text-[var(--text)]">
                  {(payload[0].value as number)}
                  {metric === "networkRxBytes" ? " bytes" : "%"} · {nodeName ?? (nodeId ? nodeId.slice(0, 8) : "all nodes")}
                </div>
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="v" stroke={metricColor(metric)} strokeWidth={1.8} fill="url(#g)" dot={false} activeDot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
