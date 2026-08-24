"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, AlertTriangle, Menu, X, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCurrentUser, logout } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api/http";
import { useBranding } from "@/components/branding";
import { useServerStore } from "@/stores/use-server-store";
import { useT } from "@/components/TranslationProvider";
import { adminPagesForRole, findAdminPage, ADMIN_ALIAS_ROUTES } from "./admin-registry";

function resolveAlias(pathname: string): string {
  return ADMIN_ALIAS_ROUTES[pathname] ?? pathname;
}

function NavStateLaneBadge({ hasPending }: { hasPending?: boolean }) {
  if (!hasPending) return null;
  return (
    <span className="ml-auto flex items-center gap-1" aria-label="Pending generation">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-safe:animate-pulse" />
    </span>
  );
}

const SUB_GROUPS: Record<string, { title: string; hrefs: string[] }[]> = {
  // Consolidated IA per docs/architecture/target-ia.md §3 — INFRA 4 top: Beacons/Networking/Storage/Cloud
  Build: [
    { title: "Workloads", hrefs: ["/admin/servers", "/admin/apps"] },
    { title: "Catalog", hrefs: ["/admin/catalog", "/admin/app-store", "/admin/nests", "/admin/app-templates", "/admin/templates", "/admin/forgefile"] },
  ],
  Deploy: [
    { title: "Releases", hrefs: ["/admin/deployments", "/admin/preview-deployments", "/admin/source-deployments", "/admin/zerodowntime"] },
    { title: "Pipelines & Git", hrefs: ["/admin/pipelines", "/admin/compose", "/admin/git", "/admin/git-providers"] },
  ],
  Infra: [
    { title: "Beacons", hrefs: ["/admin/nodes", "/admin/regions", "/admin/locations", "/admin/host", "/admin/kubernetes", "/admin/docker", "/admin/capabilities", "/admin/onboarding-tokens", "/admin/allocations"] },
    { title: "Networking", hrefs: ["/admin/endpoints", "/admin/discovery", "/admin/firewall", "/admin/load-balancer", "/admin/traffic", "/admin/domains", "/admin/dns", "/admin/gateways", "/admin/crossnode", "/admin/certificates", "/admin/mtls", "/admin/security", "/admin/webhooks", "/admin/acme"] },
    { title: "Storage", hrefs: ["/admin/databases", "/admin/database-services", "/admin/mounts", "/admin/sftp", "/admin/files", "/admin/terminal"] },
    { title: "Cloud", hrefs: ["/admin/cloud"] },
  ],
  Operations: [
    { title: "Data & Recovery", hrefs: ["/admin/backups", "/admin/migrations", "/admin/reconciliation", "/admin/operations", "/admin/orphans", "/admin/cleanup"] },
    { title: "Automation", hrefs: ["/admin/cron-jobs", "/admin/procedures", "/admin/scheduler", "/admin/autoscaler", "/admin/failover", "/admin/node-autoscaler", "/admin/env-affinity"] },
  ],
  Access: [
    { title: "Identity", hrefs: ["/admin/users", "/admin/roles", "/admin/oauth-clients", "/admin/social"] },
    { title: "Tenancy", hrefs: ["/admin/organizations", "/admin/projects", "/admin/environments"] },
  ],
  Platform: [
    { title: "Integrations", hrefs: ["/admin/plugins", "/admin/api"] },
    { title: "Settings", hrefs: ["/admin/settings", "/admin/mail", "/admin/notifications", "/admin/billing", "/admin/onboarding"] },
  ],
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const tOr = (key: string, fallback: string) => { const value = t(key); return value === key ? fallback : value; };
  const pathname = usePathname();
  const resolvedPath = resolveAlias(pathname);
  const router = useRouter();
  const { companyName } = useBranding();
  const { currentUser, setCurrentUser } = useServerStore();
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 30_000,
    retry: 1,
  });
  const user = userQuery.data === null ? null : userQuery.data ?? currentUser;

  useEffect(() => {
    if (userQuery.data === null) {
      router.replace("/");
    } else if (user && user.role !== "admin") {
      router.replace("/servers");
    }
  }, [router, user, userQuery.data]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Record<string, boolean>>({});
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const navGroups = useMemo(() => {
        const plan = [
      { title: "Command", titleKey: "admin.navGroup.command", hrefs: ["/admin/overview", "/admin/monitoring", "/admin/health", "/admin/activity"] },
      { title: "Build", titleKey: "admin.navGroup.build", hrefs: ["/admin/servers", "/admin/apps", "/admin/app-store", "/admin/catalog", "/admin/nests", "/admin/app-templates", "/admin/templates", "/admin/forgefile"] },
      { title: "Deploy", titleKey: "admin.navGroup.deploy", hrefs: ["/admin/deployments", "/admin/preview-deployments", "/admin/source-deployments", "/admin/compose", "/admin/git", "/admin/git-providers", "/admin/pipelines", "/admin/zerodowntime"] },
      { title: "Infra", titleKey: "admin.navGroup.infra", hrefs: ["/admin/nodes", "/admin/regions", "/admin/locations", "/admin/allocations", "/admin/capabilities", "/admin/onboarding-tokens", "/admin/host", "/admin/kubernetes", "/admin/docker", "/admin/cloud", "/admin/files", "/admin/terminal", "/admin/databases", "/admin/database-services", "/admin/mounts", "/admin/sftp", "/admin/endpoints", "/admin/discovery", "/admin/firewall", "/admin/load-balancer", "/admin/traffic", "/admin/domains", "/admin/dns", "/admin/gateways", "/admin/crossnode", "/admin/certificates", "/admin/mtls", "/admin/security", "/admin/webhooks", "/admin/acme"] },
      { title: "Operations", titleKey: "admin.navGroup.operations", hrefs: ["/admin/operations", "/admin/migrations", "/admin/reconciliation", "/admin/cron-jobs", "/admin/orphans", "/admin/cleanup", "/admin/backups", "/admin/procedures", "/admin/scheduler", "/admin/autoscaler", "/admin/failover", "/admin/env-affinity", "/admin/node-autoscaler"] },
      { title: "Access", titleKey: "admin.navGroup.access", hrefs: ["/admin/users", "/admin/roles", "/admin/organizations", "/admin/projects", "/admin/environments", "/admin/oauth-clients", "/admin/social"] },
      { title: "Platform", titleKey: "admin.navGroup.platform", hrefs: ["/admin/plugins", "/admin/api", "/admin/settings", "/admin/mail", "/admin/notifications", "/admin/billing", "/admin/onboarding"] },
    ];
    const entries = adminPagesForRole(user?.role).flatMap((group) => group.items);
    return plan.map((group) => ({ ...group, items: group.hrefs.map((href) => entries.find((item) => item.href === href)).filter((item): item is (typeof entries)[number] => Boolean(item)) }))
      .filter((group) => group.items.length > 0)
      .map((group) => ({ ...group, items: group.items.filter((item) => !navSearch.trim() || `${item.label} ${item.description}`.toLowerCase().includes(navSearch.toLowerCase())) }))
      .filter((group) => group.items.length > 0);
  }, [navSearch, user?.role]);

  const currentPage = findAdminPage(resolvedPath);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMobileOpen(false);
        if (e.key === "Tab" && drawerRef.current) {
          const focusable = drawerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener("keydown", handleKey);
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleKey);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileOpen]);

  const toggleGroup = (title: string) => setCollapsedGroups((current) => ({ ...current, [title]: !current[title] }));
  const toggleSubGroup = (key: string) => setCollapsedSubGroups((current) => ({ ...current, [key]: !current[key] }));
  const isGroupCollapsed = (title: string) => Boolean(collapsedGroups[title] && !navSearch.trim());
  const isSubGroupCollapsed = (key: string) => Boolean(collapsedSubGroups[key] && !navSearch.trim());

  const handleLogout = async () => {
      await logout();
      setCurrentUser(null);
      router.push("/");
    };

  if (userQuery.isPending) {
      return (
        <div className="grid min-h-screen place-items-center bg-[var(--canvas)] p-4 text-sm text-[var(--text-subtle)]">
          {tOr("admin.shell.redirecting", "Redirecting to sign in…")}
        </div>
      );
    }

    if (!userQuery.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--canvas)] p-4">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--surface-raised)] p-6 text-center" role="alert">
          <AlertTriangle size={28} className="mx-auto text-amber-400" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-[var(--text)]">{tOr("admin.shell.verifyFailedTitle", "Unable to verify admin access")}</h1>
          <p className="text-sm text-red-300">
            {userQuery.isError
              ? `${tOr("admin.shell.apiUnreachable", "API not reachable at")} ${API_BASE_URL}. ${tOr("admin.shell.apiUnreachableHint", "Make sure the Go backend is running.")}`
              : tOr("admin.shell.userLoadFailed", "The current user could not be loaded. Admin content remains hidden until the API responds.")
            }
          </p>
          <div className="flex justify-center gap-2">
            <button
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60 transition-colors motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              disabled={userQuery.isFetching}
              onClick={() => void userQuery.refetch()}
              type="button"
            >
              {userQuery.isFetching ? tOr("admin.shell.retrying", "Retrying…") : tOr("common.retry", "Retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--canvas)] p-4 text-sm text-[var(--text-subtle)]">
        {tOr("admin.shell.verifying", "Verifying admin access…")}
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--canvas)]">
      {/* Top bar — fixed */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6">
        <button aria-label="Open admin navigation" className="mr-3 rounded-lg p-2 text-[var(--text-subtle)] hover:bg-white/[0.06] max-[899px]:inline-flex hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]" onClick={() => setMobileOpen(true)} type="button"><Menu size={19} /></button>
        <button
          className="text-lg font-bold text-[var(--text)] tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          onClick={() => router.push("/servers")}
          type="button"
        >
          {companyName}
        </button>
        <div className="flex items-center gap-3 text-sm text-[var(--text-subtle)]">
          <button
            className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            onClick={() => router.push("/servers")}
            type="button"
          >
            {tOr("server.myServers", "My Servers")}
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar — independently scrollable */}
        <aside className="max-[899px]:hidden w-72 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] flex">
          <div className="border-b border-[var(--line)] p-3"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-600"/><input aria-label="Search admin navigation" value={navSearch} onChange={(event) => setNavSearch(event.target.value)} placeholder="Find a control…" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-input)] pl-9 pr-3 text-xs text-[var(--text)] outline-none focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus)]/15"/></div></div>
          <nav className="flex-1 overflow-y-auto px-3 py-5">
            {navGroups.map((group) => {
              const subGroups = SUB_GROUPS[group.title];
              if (subGroups && !navSearch.trim()) {
                const groupItems = group.items;
                return (
                  <div key={group.title} className="mb-4">
                    <button type="button" onClick={() => toggleGroup(group.title)} className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" aria-expanded={!isGroupCollapsed(group.title)}>
                      <span>{tOr(group.titleKey, group.title)} <span className="ml-1 text-slate-700">{group.items.length}</span></span>
                      <ChevronDown size={13} className={cn("transition-transform motion-safe:transition-transform", isGroupCollapsed(group.title) && "-rotate-90")} />
                    </button>
                    {!isGroupCollapsed(group.title) && subGroups.map((sub) => {
                      const subItems = sub.hrefs.map((href) => groupItems.find((item) => item.href === href)).filter((item): item is NonNullable<typeof item> => Boolean(item));
                      if (subItems.length === 0) return null;
                      const subKey = `${group.title}::${sub.title}`;
                      return (
                        <div key={subKey} className="ml-2 border-l border-[var(--line)] pl-2">
                          <button type="button" onClick={() => toggleSubGroup(subKey)} className="mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-semibold text-[var(--text-subtle)] hover:text-[var(--text)]" aria-expanded={!isSubGroupCollapsed(subKey)}>
                            <span>{sub.title} <span className="ml-1 text-slate-700">{subItems.length}</span></span>
                            <ChevronDown size={11} className={cn("transition-transform motion-safe:transition-transform", isSubGroupCollapsed(subKey) && "-rotate-90")} />
                          </button>
                          {!isSubGroupCollapsed(subKey) && subItems.map((item) => {
                            const Icon = item.icon;
                            const active = resolvedPath === item.href || resolvedPath.startsWith(`${item.href}/`);
                            return (
                              <button
                                key={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
                                  active
                                    ? "border-l-2 border-[var(--brand)] bg-[var(--brand)]/10 pl-2.5 text-[var(--brand)] shadow-sm"
                                    : "text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)]",
                                )}
                                onClick={() => router.push(item.href)}
                                type="button"
                              >
                                <Icon size={15} className="shrink-0" />
                                <span className="truncate">{tOr(item.labelKey, item.label)}</span>
                                <NavStateLaneBadge hasPending={item.hasPendingGenerations} />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {/* Fallback: any items not in sub-groups (should be none, but safe) */}
                    {(() => {
                      const subHrefs = new Set(subGroups.flatMap((s) => s.hrefs));
                      const leftover = groupItems.filter((item) => !subHrefs.has(item.href));
                      if (leftover.length === 0) return null;
                      return leftover.map((item) => {
                        const Icon = item.icon;
                        const active = resolvedPath === item.href || resolvedPath.startsWith(`${item.href}/`);
                        return (
                          <button key={item.href} aria-current={active ? "page" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]", active ? "border-l-2 border-[var(--brand)] bg-[var(--brand)]/10 pl-2.5 text-[var(--brand)]" : "text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)]")} onClick={() => router.push(item.href)} type="button"><Icon size={15} className="shrink-0" /><span className="truncate">{tOr(item.labelKey, item.label)}</span><NavStateLaneBadge hasPending={item.hasPendingGenerations} /></button>
                        );
                      });
                    })()}
                  </div>
                );
              }
              return (
                <div key={group.title} className="mb-4">
                  <button type="button" onClick={() => toggleGroup(group.title)} className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" aria-expanded={!isGroupCollapsed(group.title)}>
                    <span>{tOr(group.titleKey, group.title)} <span className="ml-1 text-slate-700">{group.items.length}</span></span>
                    <ChevronDown size={13} className={cn("transition-transform motion-safe:transition-transform", isGroupCollapsed(group.title) && "-rotate-90")} />
                  </button>
                  {!isGroupCollapsed(group.title) && group.items.map((item) => {
                    const Icon = item.icon;
                    const active = resolvedPath === item.href || resolvedPath.startsWith(`${item.href}/`);
                    return (
                      <button
                        key={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
                          active
                            ? "border-l-2 border-[var(--brand)] bg-[var(--brand)]/10 pl-2.5 text-[var(--brand)] shadow-sm"
                            : "text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)]",
                        )}
                        onClick={() => router.push(item.href)}
                        type="button"
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{tOr(item.labelKey, item.label)}</span>
                        <NavStateLaneBadge hasPending={item.hasPendingGenerations} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="shrink-0 border-t border-[var(--line)] px-3 py-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-white/[0.04] rounded-lg transition-all motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              type="button"
            >
              <LogOut size={15} />
              {tOr("auth.logout", "Sign Out")}
            </button>
          </div>
        </aside>

        {/* Content — independently scrollable */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--brand)_10%,transparent),transparent_32rem)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1280px]">
            {currentPage ? <div className="mb-5 hidden border-b border-[var(--line)] pb-4 md:block"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">{currentPage.label}</p><p className="mt-1 text-sm text-[var(--text-subtle)]">{currentPage.description}</p></div> : null}{children}
          </div>
        </main>
      </div>
      {mobileOpen ? <div className="fixed inset-0 z-50 max-[899px]:flex hidden" role="dialog" aria-modal="true" aria-label="Admin navigation"><button aria-label="Close navigation overlay" className="absolute inset-0 bg-black/70 backdrop-blur-sm motion-safe:transition-opacity" onClick={() => setMobileOpen(false)} type="button"/><aside ref={drawerRef} className="relative flex h-full w-[min(88vw,340px)] flex-col border-r border-[var(--line)] bg-[var(--surface)] shadow-2xl motion-safe:animate-[slideIn_0.2s_ease-out]"><div className="flex items-center justify-between border-b border-[var(--line)] p-4"><span className="text-sm font-semibold text-[var(--text)]">Admin navigation</span><button ref={closeButtonRef} aria-label="Close admin navigation" className="rounded-lg p-2 text-[var(--text-subtle)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" onClick={() => setMobileOpen(false)} type="button"><X size={18}/></button></div><div className="border-b border-[var(--line)] p-3"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-600"/><input aria-label="Search admin navigation" value={navSearch} onChange={(event) => setNavSearch(event.target.value)} placeholder="Find a control…" className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-input)] pl-9 pr-3 text-xs text-[var(--text)] outline-none focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus)]/15"/></div></div><nav className="flex-1 overflow-y-auto px-3 py-5">{navGroups.map((group) => <div key={group.title} className="mb-4"><button type="button" onClick={() => toggleGroup(group.title)} className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)]" aria-expanded={!isGroupCollapsed(group.title)}><span>{tOr(group.titleKey, group.title)} <span className="ml-1 text-slate-700">{group.items.length}</span></span><ChevronDown size={13} className={cn("transition-transform motion-safe:transition-transform", isGroupCollapsed(group.title) && "-rotate-90")} /></button>{!isGroupCollapsed(group.title) && group.items.map((item) => { const Icon = item.icon; const active = resolvedPath === item.href || resolvedPath.startsWith(`${item.href}/`); return <button key={item.href} aria-current={active ? "page" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]", active ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "text-[var(--text-subtle)] hover:bg-white/[0.04] hover:text-[var(--text)]")} onClick={() => router.push(item.href)} type="button"><Icon size={15}/><span className="truncate">{tOr(item.labelKey, item.label)}</span><NavStateLaneBadge hasPending={item.hasPendingGenerations} /></button>; })}</div>)}</nav></aside></div> : null}
    </div>
  );
}
