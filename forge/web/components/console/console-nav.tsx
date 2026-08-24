"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Archive, HeartPulse, Server, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCurrentUser, fetchServer } from "@/lib/api";
import { useT } from "@/components/TranslationProvider";
import { computeServerAccess, hasServerPermission } from "@/components/server/server-context";
import { serverTabHref, serverTabs, serverTabGroups } from "@/components/server/server-tabs";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export type ConsoleNavGroup = {
  title: string;
  items: ConsoleNavItem[];
};

// Only routes with pages under app/console/ are listed; the workloads,
// web-server, domains, etc. sections have no console pages yet.
export const consoleNavGroups: ConsoleNavGroup[] = [
  { title: "Overview", items: [
    { href: "/console/health", label: "Health", icon: HeartPulse },
  ] },
  { title: "Workloads", items: [
    { href: "/console/servers", label: "Servers", icon: Server },
  ] },
  { title: "Console", items: [
    { href: "/console/backups", label: "Backups", icon: Archive },
  ] },
];

function matchServerId(pathname: string): string | null {
  const match = pathname.match(/^\/console\/servers\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function statusDot(server: { suspended?: boolean; transferring?: boolean; status?: string }) {
  if (server.suspended) return "bg-rose-400";
  if (server.transferring) return "bg-sky-400";
  if (server.status === "running") return "bg-emerald-400";
  if (server.status === "installing") return "bg-amber-400";
  return "bg-slate-500";
}

function ServerSection() {
  const t = useT();
  const pathname = usePathname();
  const serverId = matchServerId(pathname);

  const serverQuery = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => fetchServer(serverId as string),
    enabled: Boolean(serverId),
    staleTime: 30_000,
    retry: 1,
  });
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 30_000,
    retry: 1,
  });

  if (!serverId) return null;

  const server = serverQuery.data;
  const user = userQuery.data ?? null;
  const access = server ? computeServerAccess(server, user) : null;
  const tr = (key: string, fallback: string) => { const value = t(key); return value === key ? fallback : value; };
  const visibleTabs = access
    ? serverTabs.filter((tab) =>
        tab.id === "console"
          ? hasServerPermission(access, "websocket.connect") && hasServerPermission(access, "control.console")
          : hasServerPermission(access, tab.permissions),
      )
    : [];
  const state = server
    ? (server.suspended ? tr("server.nav.suspended", "Suspended")
      : server.transferring ? tr("server.nav.transferring", "Transferring")
      : server.status || tr("server.nav.unknown", "Unknown"))
    : null;

  return (
    <div>
      <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{tr("server.nav.title", "Server")}</p>
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", server ? statusDot(server) : "animate-pulse bg-slate-600")} />
        <p className="min-w-0 truncate text-xs font-bold text-slate-200">{server?.name ?? serverId}</p>
        {state ? <span className="ml-auto shrink-0 text-[10px] text-slate-400">{state}</span> : null}
      </div>
      <div className="space-y-3">
        {serverTabGroups.map((group) => {
          const groupVisible = group.tabs.map((id) => visibleTabs.find((tab) => tab.id === id)).filter(Boolean) as typeof visibleTabs;
          if (groupVisible.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>
              <ul className="space-y-0.5">
                {groupVisible.map((tab) => {
                  const Icon = tab.icon;
                  const href = serverTabHref(serverId, tab.id);
                  const active = pathname === href;
                  const label = t(tab.labelKey);
                  return (
                    <li key={tab.id}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav)]",
                          active
                            ? "border-l-2 border-red-400 bg-red-500/10 pl-2.5 text-red-300"
                            : "text-slate-300 hover:bg-white/[0.04] hover:text-white",
                        )}
                        href={href}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{label === tab.labelKey ? tab.fallback : label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!access && serverQuery.isPending ? (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-300">
            <span className="h-3.5 w-3.5 animate-pulse rounded bg-white/[0.06]" />
            <span className="animate-pulse text-xs">Loading server…</span>
          </div>
        ) : null}
        {serverQuery.isError ? (
          <p className="px-3 text-xs text-slate-400">Server unavailable — tabs are hidden.</p>
        ) : null}
      </div>
    </div>
  );
}

export function ConsoleNav() {
  const pathname = usePathname();

  // Longest-match wins so nested sections (/console/apps) never light up the
  // Dashboard (/console) entry. Server tabs are exact matches and are longer
  // than the /console/servers list entry, so they win while inside a server.
  const serverId = matchServerId(pathname);
  const serverNavItems: ConsoleNavItem[] = serverId
    ? serverTabs.map((tab) => ({ href: serverTabHref(serverId, tab.id), label: tab.fallback, icon: tab.icon }))
    : [];
  const flat = [...consoleNavGroups.flatMap((group) => group.items), ...serverNavItems];
  const best = flat
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];

  return (
    <div className="space-y-5">
      {consoleNavGroups.map((group, index) => (
        <Fragment key={group.title}>
          {index === 0 && serverId ? <ServerSection /> : null}
          <div>
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = best?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav)]",
                        active
                          ? "border-l-2 border-red-400 bg-red-500/10 pl-2.5 text-red-300"
                          : "text-slate-300 hover:bg-white/[0.04] hover:text-white",
                      )}
                      href={item.href}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-slate-300">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Fragment>
      ))}
    </div>
  );
}