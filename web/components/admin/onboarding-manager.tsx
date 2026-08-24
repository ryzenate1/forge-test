"use client";

import { useEffect, useState } from "react";
import { AdminCard, AdminPageLayout } from "@/components/admin/admin-layout";
import * as api from "@/lib/api/onboarding";
import { sanitizeError } from "@/lib/sanitize";

export function OnboardingManager() {
  const [status, setStatus] = useState<api.StatusView | null>(null);
  const [repos, setRepos] = useState<api.GitProviderRepo[]>([]);
  const [branches, setBranches] = useState<api.GitProviderBranch[]>([]);
  const [loadedSources, setLoadedSources] = useState<api.LoadedSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("");
  const [repoName, setRepoName] = useState("");
  const [deployPayload, setDeployPayload] = useState({ repo: "", branch: "main", buildType: "nixpacks", name: "", port: 8080 });
  const [deployResult, setDeployResult] = useState<api.DeployResult | null>(null);

  const [connectForm, setConnectForm] = useState({ provider: "github", providerName: "", accessToken: "", username: "", baseUrl: "" });

  async function loadStatus() {
    try {
      const s = await api.getStatus();
      setStatus(s);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Status failed"));
    }
  }

  async function loadRepos() {
    try {
      const r = await api.listRepos(providerId || undefined);
      setRepos(r);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "List repos failed"));
    }
  }

  async function loadBranches() {
    if (!repoName.trim()) {
      setError("repo required");
      return;
    }
    try {
      const b = await api.listBranches(repoName.trim(), providerId);
      setBranches(b);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "List branches failed"));
    }
  }

  async function loadSources() {
    try {
      const s = await api.listLoadedSources();
      setLoadedSources(s);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Load sources failed"));
    }
  }

  useEffect(() => {
    void loadStatus();
    void loadSources();
  }, []);

  async function handleConnect() {
    setError(null);
    try {
      await api.connect(connectForm);
      setSuccess("Provider connected");
      await loadStatus();
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Connect failed"));
    }
  }

  async function handleDeploy() {
    setError(null);
    try {
      const res = await api.deploy({ repo: deployPayload.repo, branch: deployPayload.branch, buildType: deployPayload.buildType, name: deployPayload.name || undefined, port: deployPayload.port });
      setDeployResult(res);
      setSuccess(`Deployed ${res.appName} → ${res.url}`);
      await loadStatus();
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Deploy failed"));
    }
  }

  return (
    <AdminPageLayout
      title="Onboarding Wizard"
      description="Connect repo → get URL. Phase 8 scaffold: no remote registry push; returns queued deployment + demo URL. Endpoints: GET /onboarding/status, GET /onboarding/repos, GET /onboarding/repos/:repo/branches, POST /onboarding/connect, POST /onboarding/deploy, GET /ide/files."
      breadcrumbs={[{ label: "Admin", href: "/admin/onboarding" }, { label: "Onboarding" }]}
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
        <AdminCard title="Status" description="GET /onboarding/status — connected providers, source count, template keys, OAuth link.">
          {status ? (
            <div className="space-y-2 text-sm">
              <p>Connected: {String(status.connected)} · Sources: {status.sourceCount} · Has apps: {String(status.hasApps)}</p>
              <p className="text-xs text-muted">Providers: {status.providers.join(", ") || "none"} · Templates: {status.templateKeys.join(", ")}</p>
              {status.oauthUrl && <a href={status.oauthUrl} target="_blank" rel="noreferrer" className="text-xs text-red-dark underline">GitHub OAuth →</a>}
            </div>
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          )}
          <button onClick={() => void loadStatus()} className="mt-3 rounded border border-line px-3 py-1.5 text-xs">Refresh Status</button>

          <div className="mt-6 space-y-3 rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-bold uppercase text-muted">Connect Provider (paste token)</p>
            <input value={connectForm.provider} onChange={(e) => setConnectForm({ ...connectForm, provider: e.target.value })} placeholder="provider (github)" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
            <input value={connectForm.accessToken} onChange={(e) => setConnectForm({ ...connectForm, accessToken: e.target.value })} placeholder="accessToken" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={connectForm.username} onChange={(e) => setConnectForm({ ...connectForm, username: e.target.value })} placeholder="username" className="rounded border border-line bg-paper px-3 py-2 text-sm" />
              <input value={connectForm.baseUrl} onChange={(e) => setConnectForm({ ...connectForm, baseUrl: e.target.value })} placeholder="baseUrl (optional)" className="rounded border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <button onClick={() => void handleConnect()} className="rounded bg-ink px-4 py-2 text-xs font-bold text-white">Connect</button>
          </div>
        </AdminCard>

        <AdminCard title="Deploy" description="POST /onboarding/deploy — template pick → app + demo URL. Builder: static|node|next|nixpacks|dockerfile|heroku → nixpacks|dockerfile|static etc.">
          <div className="space-y-3">
            <input value={deployPayload.repo} onChange={(e) => setDeployPayload({ ...deployPayload, repo: e.target.value })} placeholder="repo (owner/name)" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={deployPayload.branch} onChange={(e) => setDeployPayload({ ...deployPayload, branch: e.target.value })} placeholder="branch" className="rounded border border-line bg-paper px-3 py-2 text-sm" />
              <input value={deployPayload.name} onChange={(e) => setDeployPayload({ ...deployPayload, name: e.target.value })} placeholder="app name (auto from repo)" className="rounded border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={deployPayload.buildType} onChange={(e) => setDeployPayload({ ...deployPayload, buildType: e.target.value })} className="rounded border border-line bg-paper px-3 py-2 text-sm">
                <option value="static">static</option>
                <option value="node">node</option>
                <option value="next">next</option>
                <option value="nixpacks">nixpacks</option>
                <option value="dockerfile">dockerfile</option>
                <option value="heroku">heroku</option>
              </select>
              <input type="number" value={deployPayload.port} onChange={(e) => setDeployPayload({ ...deployPayload, port: Number(e.target.value) })} placeholder="port" className="rounded border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <button onClick={() => void handleDeploy()} className="rounded bg-red px-4 py-2 text-sm font-bold text-white">Deploy</button>
            {deployResult && (
              <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-xs">
                <p className="font-bold">{deployResult.appName} · {deployResult.builder} · {deployResult.status}</p>
                <a href={deployResult.url} target="_blank" rel="noreferrer" className="text-red-dark underline">{deployResult.url}</a>
                <p className="text-muted">Internal: {deployResult.internalUrl} · Deployment {deployResult.deploymentId.slice(0, 8)}</p>
              </div>
            )}
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Repositories" description="GET /onboarding/repos?providerId= — autocomplete listing via git service.">
          <div className="flex gap-2">
            <input value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="providerId (optional auto-pick)" className="flex-1 rounded border border-line bg-paper px-3 py-2 text-sm" />
            <button onClick={() => void loadRepos()} className="rounded bg-ink px-4 py-2 text-xs font-bold text-white">List Repos</button>
          </div>
          {repos.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto space-y-1">
              {repos.map((r, i) => (
                <div key={i} className="rounded border border-line bg-surface px-3 py-2 text-xs">
                  <p className="font-bold">{(r as unknown as { fullName?: string; full_name?: string }).fullName ?? (r as unknown as { full_name?: string }).full_name ?? r.name}</p>
                  <p className="text-muted">{r.cloneUrl} · default {r.defaultBranch}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="repo (owner/name) for branches" className="flex-1 rounded border border-line bg-paper px-3 py-2 text-sm" />
            <button onClick={() => void loadBranches()} className="rounded border border-line px-4 py-2 text-xs">Branches</button>
          </div>
          {branches.length > 0 && (
            <div className="mt-2 space-y-1">
              {branches.map((b, i) => (
                <div key={i} className="rounded border border-line bg-surface px-3 py-1.5 text-xs">
                  {b.name} · {b.commit?.slice(0, 8)}
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard title="IDE Files" description="GET /ide/files — mock tree: loaded git sources + conventional entrypoints.">
          <button onClick={() => void loadSources()} className="rounded border border-line px-3 py-1.5 text-xs">Reload</button>
          {loadedSources.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No loaded sources. Connect a provider and load a repo.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {loadedSources.map((s) => (
                <div key={s.id} className="rounded-lg border border-line bg-surface p-3 text-xs">
                  <p className="font-bold">{s.owner}/{s.name} · {s.branch}</p>
                  <p className="text-muted">{s.cloneUrl}</p>
                  <p className="mt-1 font-mono text-[11px]">{s.files.join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminPageLayout>
  );
}
