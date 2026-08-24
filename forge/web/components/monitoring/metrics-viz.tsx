"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MetricKey = "cpuPercent" | "memoryPercent" | "diskPercent" | "networkRxBytes";

function formatValue(key: MetricKey, value: number) {
  if (key === "networkRxBytes") {
    const bytes = value;
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
  }
  return `${value.toFixed(1)}%`;
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
  metric: MetricKey;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-3 shadow-xl">
      <p className="text-xs text-[var(--text-subtle)]">{new Date(label ?? "").toLocaleTimeString()}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-semibold text-[var(--text)]">
          {entry.value.toFixed(1)}
          {metric === "networkRxBytes" ? " bytes" : "%"}
        </p>
      ))}
    </div>
  );
}

export function MetricsViz({
  chartData,
  selectedMetric,
  color,
}: {
  chartData: Array<{ timestamp: string; value: number }>;
  selectedMetric: MetricKey;
  color: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis
            dataKey="timestamp"
            tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => new Date(v).toLocaleTimeString()}
          />
          <YAxis
            tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatValue(selectedMetric, v)}
            width={60}
          />
          <Tooltip content={<ChartTooltip metric={selectedMetric} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#colorValue)"
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
