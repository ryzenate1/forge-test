"use client";

import { CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import type { ApiEndpointHealthRecord } from "@/lib/api";
import { Card, CardHeader } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

function relativeTime(iso: string | undefined) {
  if (!iso) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function HealthSummaryRow({ check }: { check: ApiEndpointHealthRecord }) {
  const Icon = check.reachable ? CheckCircle2 : check.status === "degraded" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon
        size={16}
        className={cn(
          "mt-0.5 shrink-0",
          check.reachable ? "text-emerald-400" : check.status === "degraded" ? "text-amber-400" : "text-rose-400",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-slate-200">
            {check.endpointId}
            {check.version ? <span className="ml-2 text-xs font-normal text-slate-400">v{check.version}</span> : null}
          </p>
          <span className="shrink-0 text-xs text-slate-400">{relativeTime(check.observedAt)}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {check.reachable
            ? check.containers != null && check.images != null && check.volumes != null
              ? `${check.containers} containers · ${check.images} images · ${check.volumes} volumes`
              : "Check passed"
            : "Unreachable"}
        </p>
        {check.error ? <p className="mt-0.5 truncate text-xs text-rose-300/80">{check.error}</p> : null}
      </div>
    </div>
  );
}

export function HealthSummary({ checks }: { checks: ApiEndpointHealthRecord[] }) {
  return (
    <Card>
      <CardHeader
        title="Endpoint Health Checks"
        icon={Clock}
        action={<span className="text-xs text-slate-400">{checks.length} recorded</span>}
      />
      {checks.length === 0 ? (
        <EmptyState
          icon={<Clock size={20} />}
          title="No health checks yet"
          description="Endpoint health records will appear here once the monitoring loop runs."
        />
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {checks.map((check) => (
            <HealthSummaryRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </Card>
  );
}