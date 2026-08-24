import Link from "next/link";
import { BackupManagerWrapper } from "@/components/dynamic-wrappers";
import { DocsShell } from "@/components/docs/docs-shell";
import Footer from "@/components/footer";

export default function BackupsPage() {
  return (
    <DocsShell>
      <main className="docs-main">
        <article>
          <div className="breadcrumbs">
            <Link href="/">Forge</Link><span>/</span>
            <Link href="/features">Features</Link><span>/</span>
            <span>Backups</span>
          </div>
          <p className="doc-kicker">Beacon Management</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">Backup Management</h1>
          <p className="doc-summary">Create, restore, and delete server backups.</p>
          <BackupManagerWrapper />
        </article>
        <Footer />
      </main>
    </DocsShell>
  );
}
