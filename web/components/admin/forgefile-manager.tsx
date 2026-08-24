"use client";

import { useEffect, useState } from "react";
import { AdminCard, AdminPageLayout } from "@/components/admin/admin-layout";
import * as api from "@/lib/api/forgefile";
import { sanitizeError } from "@/lib/sanitize";

const SAMPLE = `project:
  name: demo
  slug: demo
deploy:
  - name: web
    type: app
    source:
      repo: github.com/example/demo
      branch: main
    build:
      builder: nixpacks
    ports: [8080]
    env:
      NODE_ENV: production
    resources:
      replicas: 1
database:
  name: db
  kind: postgres
  version: "16"
environments: [dev, prod]
`;

export function ForgefileManager() {
  const [content, setContent] = useState(SAMPLE);
  const [validateRes, setValidateRes] = useState<api.ValidateResult | null>(null);
  const [applyRes, setApplyRes] = useState<api.ApplyResult | null>(null);
  const [manifests, setManifests] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [manifestDetail, setManifestDetail] = useState<{ slug: string; version: number; updatedAt: string; manifest: api.Manifest } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadManifests() {
    try {
      const list = await api.listManifests();
      setManifests(list);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Load manifests failed"));
    }
  }

  useEffect(() => {
    void loadManifests();
  }, []);

  async function handleValidate() {
    setError(null);
    try {
      const res = await api.validateForgefile(content);
      setValidateRes(res);
      if (res.valid) setSuccess("Valid forge.yaml");
      else setError(res.error || "Invalid");
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Validate failed"));
    }
  }

  async function handleApply() {
    setError(null);
    try {
      const res = await api.applyForgefile(content);
      setApplyRes(res);
      setSuccess(`Applied ${res.projectSlug} v${res.version}`);
      await loadManifests();
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Apply failed"));
    }
  }

  async function handleGet(slug: string) {
    setSelected(slug);
    try {
      const detail = await api.getManifest(slug);
      setManifestDetail(detail);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Get manifest failed"));
    }
  }

  return (
    <AdminPageLayout
      title="Forgefile (env-as-code)"
      description="Declarative forge.yaml — validate with checkKeys + apply via apphosting materialization. Max 256 KiB, unknown keys warned. Apply is idempotent upsert on project slug (version++)."
      breadcrumbs={[{ label: "Admin", href: "/admin/forgefile" }, { label: "Forgefile" }]}
    >
      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-wash p-4 text-sm text-red-dark">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-700">
          {success} <button onClick={() => setSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Editor" description="Paste forge.yaml or JSON {content: '<yaml>'} — backend accepts both. GET /forgefile/validate?manifest=… also supported.">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={20} className="w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs" spellCheck={false} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => void handleValidate()} className="rounded bg-ink px-4 py-2 text-xs font-bold text-white">Validate</button>
            <button onClick={() => void handleApply()} className="rounded bg-red px-4 py-2 text-xs font-bold text-white">Apply</button>
            <button onClick={() => setContent(SAMPLE)} className="rounded border border-line px-4 py-2 text-xs">Reset Sample</button>
          </div>
          {validateRes && (
            <div className={`mt-3 rounded-lg border p-3 text-xs ${validateRes.valid ? "border-green-300 bg-green-50" : "border-red-300 bg-red-wash"}`}>
              <p className="font-bold">{validateRes.valid ? "Valid" : "Invalid"} {validateRes.error ? `· ${validateRes.error}` : ""}</p>
              {validateRes.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-muted">
                  {validateRes.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {applyRes && (
            <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-xs">
              <p className="font-bold">Applied {applyRes.projectSlug} v{applyRes.version}</p>
              <p className="text-muted">Links: {Object.entries(applyRes.links).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}</p>
              <p className="text-muted">Apps: {applyRes.apps.map((a) => `${a.appName} (${a.domain})`).join(", ") || "—"}</p>
              {applyRes.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-amber-700">
                  {applyRes.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </AdminCard>

        <AdminCard title="Manifests" description="GET /forgefile lists slugs visible to caller (admin sees all, others only own). GET /forgefile/:slug returns version + updatedAt + manifest (requires ownership).">
          <div className="flex gap-2">
            <button onClick={() => void loadManifests()} className="rounded border border-line px-3 py-1.5 text-xs">Refresh</button>
            <span className="text-xs text-muted py-1.5">{manifests.length} manifest(s)</span>
          </div>
          {manifests.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No manifests. Apply one to create a project slug row (FORGEFILE_BASE_DOMAIN env controls app link base domain; empty → http://&lt;name&gt;.local/deploy/&lt;appId&gt;).</p>
          ) : (
            <div className="mt-3 space-y-2">
              {manifests.map((slug) => (
                <button key={slug} onClick={() => void handleGet(slug)} className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${selected === slug ? "border-red-400 bg-red-wash" : "border-line bg-surface"}`}>
                  {slug}
                </button>
              ))}
            </div>
          )}
          {manifestDetail && (
            <div className="mt-4 rounded-lg border border-line bg-surface p-3 text-xs">
              <p className="font-bold">{manifestDetail.slug} · v{manifestDetail.version} · {new Date(manifestDetail.updatedAt).toLocaleString()}</p>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-paper p-2 font-mono text-[11px]">{JSON.stringify(manifestDetail.manifest, null, 2)}</pre>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-xs text-muted">
            <p className="font-bold text-ink">Schema</p>
            <p>Top-level: project (name, slug), deploy[] (name, type app|compose|db, source.repo, build.builder dockerfile|nixpacks|heroku|static, ports, env, resources), database (name, kind, version), environments[]</p>
            <p className="mt-1">Base domain: <code className="rounded bg-surface px-1">{process.env.NEXT_PUBLIC_FORGEFILE_BASE_DOMAIN || "FORGEFILE_BASE_DOMAIN env (server)"}</code></p>
          </div>
        </AdminCard>
      </div>
    </AdminPageLayout>
  );
}
