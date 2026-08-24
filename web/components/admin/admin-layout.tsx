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
    <div className="space-y-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="breadcrumbs flex gap-2 text-xs text-muted">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2">
              {idx > 0 && <span aria-hidden>/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="text-red-dark hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
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
    <div className={`rounded-xl border border-line bg-paper p-6 ${className ?? ""}`}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted">{description}</p>}
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
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-nav px-6 text-sm text-white">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-6 w-6 place-items-center rounded bg-red font-serif text-white">F</span>
          Forge Admin
        </Link>
        <nav className="ml-6 flex items-center gap-4 text-xs font-medium text-muted">
          <Link href="/admin/billing" className="hover:text-white">Billing</Link>
          <Link href="/admin/node-autoscaler" className="hover:text-white">Node Autoscaler</Link>
          <Link href="/admin/mail" className="hover:text-white">Mail</Link>
          <Link href="/admin/procedures" className="hover:text-white">Procedures</Link>
          <Link href="/admin/zerodowntime" className="hover:text-white">Zero-Downtime</Link>
          <Link href="/admin/forgefile" className="hover:text-white">Forgefile</Link>
          <Link href="/admin/onboarding" className="hover:text-white">Onboarding</Link>
          <Link href="/admin/env-affinity" className="hover:text-white">Env Affinity</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/account" className="rounded border border-line px-3 py-1.5 text-xs hover:bg-paper">Account</Link>
          <Link href="/" className="text-xs text-muted hover:text-white">Back to Docs</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
