"use client";

import type { ApiEndpointHealthRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

export type HealthLevel = "healthy" | "degraded" | "critical" | "unknown";

export function aggregateHealth(checks: ApiEndpointHealthRecord[]): {
  level: HealthLevel;
  score: number | null;
  reachable: number;
  total: number;
} {
  if (checks.length === 0) return { level: "unknown", score: null, reachable: 0, total: 0 };
  const reachable = checks.filter((check) => check.reachable).length;
  const scored = checks.filter((check) => check.healthScore > 0);
  const score = scored.length > 0 ? scored.reduce((sum, check) => sum + check.healthScore, 0) / scored.length : null;
  const level: HealthLevel =
    reachable === checks.length ? "healthy"
    : reachable === 0 ? "critical"
    : "degraded";
  return { level, score, reachable, total: checks.length };
}

const LEVEL_STYLES: Record<HealthLevel, { stroke: string; label: string; text: string; dot: string }> = {
  healthy: { stroke: "text-emerald-400", label: "Healthy", text: "text-emerald-300", dot: "bg-emerald-400" },
  degraded: { stroke: "text-amber-400", label: "Degraded", text: "text-amber-300", dot: "bg-amber-400" },
  critical: { stroke: "text-rose-400", label: "Critical", text: "text-rose-300", dot: "bg-rose-400" },
  unknown: { stroke: "text-slate-400", label: "No data", text: "text-slate-400", dot: "bg-slate-500" },
};

export function HealthStatusGauge({ checks, className }: { checks: ApiEndpointHealthRecord[]; className?: string }) {
  const { level, score, reachable, total } = aggregateHealth(checks);
  const styles = LEVEL_STYLES[level];
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("flex items-center gap-5 rounded-xl border border-white/[0.07] bg-white/[0.018] p-5", className)}>
      <div className="relative h-32 w-32 shrink-0">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10" className="stroke-white/[0.07]" />
          <circle
            cx="64" cy="64" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
            className={cn("transition-all duration-700", styles.stroke)}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * pct) / 100}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", styles.text)}>{score != null ? `${Math.round(score)}%` : "—"}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Health</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
          <p className="text-sm font-bold text-slate-200">{styles.label}</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {total === 0
            ? "No endpoint health checks recorded yet."
            : `${reachable} of ${total} endpoints reachable`}
        </p>
        {level !== "unknown" ? (
          <p className="mt-3 text-xs text-slate-400">
            Aggregate score across the last recorded health checks. Updated every few minutes by the monitoring loop.
          </p>
        ) : null}
      </div>
    </div>
  );
}