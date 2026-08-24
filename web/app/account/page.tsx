import { WebAuthnManager } from "@/components/admin/webauthn-manager";
import { AdminPageLayout } from "@/components/admin/admin-layout";
import Link from "next/link";

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-nav px-6 text-sm text-white">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-6 w-6 place-items-center rounded bg-red font-serif text-white">F</span>
          Forge Account
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/admin/billing" className="rounded border border-line px-3 py-1.5 text-xs hover:bg-paper">Admin</Link>
          <Link href="/" className="text-xs text-muted hover:text-white">Back to Docs</Link>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <AdminPageLayout
          title="Account — Passkeys"
          description="Manage WebAuthn credentials for passwordless authentication. 6 routes: register/begin+finish, login/begin+finish, list/ delete credentials."
          breadcrumbs={[{ label: "Account" }]}
        >
          <WebAuthnManager />
        </AdminPageLayout>
      </div>
    </div>
  );
}
