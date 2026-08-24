import Link from "next/link";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

export function AdminPageLayout({
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex gap-2 text-xs text-[var(--text-subtle)]">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2">
              {idx > 0 && <span aria-hidden className="text-[var(--text-subtle)]/60">/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] rounded">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-[var(--text)]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="relative flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 h-1 w-10 rounded-full bg-[var(--brand)]" aria-hidden="true" />
          <h1 className="text-[clamp(1.4rem,2vw,1.85rem)] font-semibold tracking-[-0.025em] text-[var(--text)]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-subtle)]">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function AdminCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] motion-safe:transition-colors motion-reduce:transition-none ${className ?? ""}`}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-white/[0.018] -m-6 mb-4 px-6 py-4 rounded-t-xl">
          <div>
            {title && <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text)]">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-[var(--line)] bg-[var(--nav)] px-6 text-sm text-[var(--text)]">
        <Link href="/" className="flex items-center gap-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] rounded">
          <span className="grid h-6 w-6 place-items-center rounded bg-[var(--brand)] font-serif text-white">F</span>
          Forge Admin
        </Link>
        <nav className="ml-6 flex items-center gap-4 text-xs font-medium text-[var(--text-subtle)]">
          <Link href="/admin/billing" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Billing</Link>
          <Link href="/admin/node-autoscaler" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Node Autoscaler</Link>
          <Link href="/admin/mail" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Mail</Link>
          <Link href="/admin/procedures" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Procedures</Link>
          <Link href="/admin/zerodowntime" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Zero-Downtime</Link>
          <Link href="/admin/forgefile" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Forgefile</Link>
          <Link href="/admin/onboarding" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Onboarding</Link>
          <Link href="/admin/env-affinity" className="hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Env Affinity</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/account" className="rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Account</Link>
          <Link href="/" className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">Back to Docs</Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">{children}</div>
    </div>
  );
}
