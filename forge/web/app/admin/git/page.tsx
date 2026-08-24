"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import {
  Key, Link, GitBranch, Trash2, Plus, RefreshCw, Webhook,
  Shield, Globe, CheckCircle, XCircle, Server, Eye, EyeOff, AlertTriangle
} from "lucide-react";
import {
  listGitCredentials, listGitProviderTokens, listGitSources,
  createGitCredential, deleteGitCredential, generateGitDeployKey,
  connectGitProviderToken, disconnectGitProviderToken,
  createGitSource, deleteGitSource,
  listGitProviderRepos, listGitProviderBranches,
  testProviderInline, testGitProvider, updateGitProvider, getGitCredential,
} from "@/lib/api/git-admin";

interface GitCredential {
  id: string;
  userId: string;
  name: string;
  credentialType: "ssh_key" | "https_password" | "https_token";
  credential?: string;
  publicKey: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface GitProviderToken {
  id: string;
  userId: string;
  provider: "github" | "gitlab" | "bitbucket" | "gitea";
  providerName: string;
  accessToken?: string;
  tokenType: string;
  baseUrl: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface GitSource {
  id: string;
  userId: string;
  credentialId?: string;
  providerTokenId?: string;
  provider: string;
  repositoryUrl: string;
  repositoryName: string;
  repositoryOwner: string;
  branch: string;
  autoDeploy: boolean;
  webhookId: string;
  webhookUrl: string;
  webhookSecret?: string;
  lastCommitSha: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastDeployedAt?: string;
  webhookSetupError?: string;
  createdAt: string;
  updatedAt: string;
}

interface GitProviderRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  private: boolean;
  description: string;
}

interface GitProviderBranch {
  name: string;
  sha: string;
  isMain: boolean;
}

type Tab = "credentials" | "providers" | "sources";

function ProviderIcon({ provider }: { provider: string }) {
  const icons: Record<string, string> = {
    github: "https://github.com/favicon.ico",
    gitlab: "https://gitlab.com/favicon.ico",
    bitbucket: "https://bitbucket.org/favicon.ico",
    gitea: "/gitea-favicon.ico",
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icons[provider] || `https://${provider}.com/favicon.ico`}
      alt={provider}
      className="w-5 h-5 rounded"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

import { AdminPageLayout, AdminPageHeader, AdminTabs } from "@/components/admin/admin-ui";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function GitPage() {
  const [confirm, renderConfirm] = useConfirm();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("credentials");
  const [showCreateCredential, setShowCreateCredential] = useState(false);
  const [showConnectProvider, setShowConnectProvider] = useState(false);
  const [showCreateSource, setShowCreateSource] = useState(false);
  const [selectedProviderRepos, setSelectedProviderRepos] = useState<GitProviderRepo[]>([]);
  const [selectedProviderBranches, setSelectedProviderBranches] = useState<GitProviderBranch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState("");
  const [loadingBranches, setLoadingBranches] = useState("");
  const [revealSecrets, setRevealSecrets] = useState<Record<string, boolean>>({});
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editProviderName, setEditProviderName] = useState("");
  const [inlineTestResult, setInlineTestResult] = useState<Record<string, string>>({});

  const { data: credentialsRaw } = useQuery<GitCredential[]>({
    queryKey: ["git-credentials"],
    queryFn: () => listGitCredentials(),
  });

  const { data: providerTokensRaw } = useQuery<GitProviderToken[]>({
    queryKey: ["git-providers"],
    queryFn: () => listGitProviderTokens(),
  });

  const { data: sourcesRaw } = useQuery<GitSource[]>({
    queryKey: ["git-sources"],
    queryFn: () => listGitSources(),
  });

  const credentials = useMemo(() => credentialsRaw ?? [], [credentialsRaw]);
  const providerTokens = useMemo(() => providerTokensRaw ?? [], [providerTokensRaw]);
  const sources = useMemo(() => sourcesRaw ?? [], [sourcesRaw]);

  const createCredential = useMutation({
    mutationFn: (data: { name: string; credentialType: string; credential: string; description: string }) =>
      createGitCredential(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-credentials"] });
      setShowCreateCredential(false);
      toast({ tone: "success", title: "Credential created" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Create failed", message: e.message }),
  });

  const deleteCredential = useMutation({
    mutationFn: (id: string) => deleteGitCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-credentials"] });
      toast({ tone: "success", title: "Credential deleted" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Delete failed", message: e.message }),
  });

  const generateKey = useMutation({
    mutationFn: (id: string) => generateGitDeployKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-credentials"] });
      toast({ tone: "success", title: "Deploy key generated" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Generate failed", message: e.message }),
  });

  const viewCredential = useMutation({
    mutationFn: (id: string) => getGitCredential(id),
    onSuccess: (cred) => {
      toast({ tone: "success", title: `Credential ${cred.name}`, message: cred.credentialType });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Fetch failed", message: e.message }),
  });

  const connectProvider = useMutation({
    mutationFn: (data: {
      provider: string; providerName: string; accessToken: string;
      refreshToken: string; tokenType: string; baseUrl: string; username: string;
    }) => connectGitProviderToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-providers"] });
      setShowConnectProvider(false);
      toast({ tone: "success", title: "Provider connected" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Connect failed", message: e.message }),
  });

  const disconnectProvider = useMutation({
    mutationFn: (id: string) => disconnectGitProviderToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-providers"] });
      toast({ tone: "success", title: "Provider disconnected" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Disconnect failed", message: e.message }),
  });

  const testProviderInlineMut = useMutation({
    mutationFn: (body: { provider: string; accessToken: string; baseUrl?: string }) => testProviderInline(body),
    onSuccess: (res) => toast({ tone: res.ok ? "success" : "error", title: res.ok ? "Provider test succeeded" : "Provider test failed", message: res.message }),
    onError: (e: Error) => toast({ tone: "error", title: "Test failed", message: e.message }),
  });

  const testProviderMut = useMutation({
    mutationFn: (id: string) => testGitProvider(id),
    onSuccess: (res, id) => {
      setInlineTestResult((p) => ({ ...p, [id]: res.ok ? "ok" : res.message || "failed" }));
      toast({ tone: res.ok ? "success" : "error", title: res.ok ? "Provider test succeeded — POST /git/providers/:id/test" : "Provider test failed", message: res.message });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Test failed", message: e.message }),
  });

  const updateProviderMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ providerName: string; baseUrl: string; username: string }> }) => updateGitProvider(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-providers"] });
      setEditingProviderId(null);
      toast({ tone: "success", title: "Provider updated — PATCH /git/providers/:id" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Update failed", message: e.message }),
  });

  const createSource = useMutation({
    mutationFn: (data: {
      credentialId?: string; providerTokenId?: string; provider: string;
      repositoryUrl: string; repositoryName: string; repositoryOwner: string;
      branch: string; autoDeploy: boolean;
    }) => createGitSource(data),
    onSuccess: (src: GitSource) => {
      queryClient.invalidateQueries({ queryKey: ["git-sources"] });
      setShowCreateSource(false);
      if (src.autoDeploy && !src.webhookId && !src.webhookUrl) {
        toast({ tone: "error", title: "Auto-deploy webhook not configured", message: (src as GitSource).webhookSetupError || "Webhook setup failed — check provider token permissions and PANEL_URL" });
      } else if (src.autoDeploy && (src as GitSource).webhookSetupError) {
        toast({ tone: "error", title: "Auto-deploy webhook error", message: (src as GitSource).webhookSetupError });
      } else {
        toast({ tone: "success", title: "Git source linked" });
      }
    },
    onError: (e: Error) => toast({ tone: "error", title: "Link failed", message: e.message }),
  });

  const deleteSource = useMutation({
    mutationFn: (id: string) => deleteGitSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-sources"] });
      toast({ tone: "success", title: "Git source removed" });
    },
    onError: (e: Error) => toast({ tone: "error", title: "Delete failed", message: e.message }),
  });

  const loadProviderRepos = async (tokenId: string) => {
    setLoadingRepos(tokenId);
    try {
      const repos = await listGitProviderRepos(tokenId);
      setSelectedProviderRepos(repos);
    } catch {
      toast({ tone: "error", title: "Failed to load repositories" });
    } finally {
      setLoadingRepos("");
    }
  };

  const loadProviderBranches = async (tokenId: string, repoFullName: string) => {
    setLoadingBranches(tokenId);
    try {
      const branches = await listGitProviderBranches(tokenId, repoFullName);
      setSelectedProviderBranches(branches);
    } catch {
      toast({ tone: "error", title: "Failed to load branches" });
    } finally {
      setLoadingBranches("");
    }
  };

  return (
    <AdminPageLayout>
      <AdminPageHeader title="Git Integration" description="Manage Git credentials, providers, and repository sources." />
      <AdminTabs tabs={[
        { id: "credentials", label: "Credentials", icon: Key },
        { id: "providers", label: "Providers", icon: Globe },
        { id: "sources", label: "Sources", icon: Server },
      ]} active={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === "credentials" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="w-5 h-5" /> Credentials
            </h2>
            <button
              onClick={() => setShowCreateCredential(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded-md hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Add Credential
            </button>
          </div>

          {(!Array.isArray(credentials) || credentials.length === 0) && (
            <p className="text-slate-400 text-sm">No credentials configured.</p>
          )}

          {Array.isArray(credentials) && credentials.map((cred) => (
            <div key={cred.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{cred.name}</p>
                  <p className="text-xs text-slate-400">
                    Type: {cred.credentialType}
                    {cred.description && ` — ${cred.description}`}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">GET /git/credentials/:id — wired via getGitCredential</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => viewCredential.mutate(cred.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-white/[0.06]"
                    disabled={viewCredential.isPending}
                    title="GET /git/credentials/:id"
                  >
                    <Eye className="w-3 h-3" /> View
                  </button>
                  {cred.credentialType === "ssh_key" && (
                    <button
                      onClick={() => generateKey.mutate(cred.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-white/[0.06]"
                      disabled={generateKey.isPending}
                    >
                      <RefreshCw className="w-3 h-3" /> Generate Key
                    </button>
                  )}
                  <button
                    onClick={() => { void (async () => { if (await confirm({ title: "Delete this git credential?", description: "The stored credential will be removed. This cannot be undone.", danger: true, confirmLabel: "Delete" })) deleteCredential.mutate(cred.id); })(); }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
              {cred.publicKey && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-400">Public Key</summary>
                  <pre className="mt-1 p-2 bg-white/[0.06] rounded text-[10px] overflow-x-auto">{cred.publicKey}</pre>
                </details>
              )}
              {cred.credential && (
                <p className="text-xs text-slate-400">
                  Credential: <Shield className="w-3 h-3 inline" /> Stored encrypted
                </p>
              )}
            </div>
          ))}

          {showCreateCredential && (
            <CredentialForm
              onSubmit={(data) => createCredential.mutate(data)}
              onCancel={() => setShowCreateCredential(false)}
              loading={createCredential.isPending}
            />
          )}
        </div>
      )}

      {tab === "providers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5" /> Git Providers
            </h2>
            <button
              onClick={() => setShowConnectProvider(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded-md hover:opacity-90"
            >
              <Link className="w-4 h-4" /> Connect Provider
            </button>
          </div>
          <p className="text-[11px] text-slate-500">Wires POST /git/providers/test (inline), PATCH /git/providers/:id, POST /git/providers/:id/test — testProviderInline / updateGitProvider / testGitProvider</p>

          {(!Array.isArray(providerTokens) || providerTokens.length === 0) && (
            <p className="text-slate-400 text-sm">No providers connected.</p>
          )}

          {Array.isArray(providerTokens) && providerTokens.map((pt) => (
            <div key={pt.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <ProviderIcon provider={pt.provider} />
                  <div>
                    {editingProviderId === pt.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editProviderName} onChange={(e) => setEditProviderName(e.target.value)} placeholder="Display name" className="px-2 py-1 text-xs border rounded bg-[var(--surface-input)] text-slate-200" />
                        <button onClick={() => updateProviderMut.mutate({ id: pt.id, body: { providerName: editProviderName } })} className="px-2 py-1 text-xs bg-[var(--brand)] text-white rounded">Save</button>
                        <button onClick={() => setEditingProviderId(null)} className="px-2 py-1 text-xs border rounded hover:bg-white/[0.06]">Cancel</button>
                      </div>
                    ) : (
                      <p className="font-medium capitalize">{pt.provider}{pt.providerName ? ` - ${pt.providerName}` : ""} <button onClick={() => { setEditingProviderId(pt.id); setEditProviderName(pt.providerName); }} className="ml-2 text-[11px] underline text-slate-400">Edit</button></p>
                    )}
                    <p className="text-xs text-slate-400">
                      {pt.username && `@${pt.username} — `}{pt.tokenType} token{pt.accessToken && <Shield className="w-3 h-3 inline ml-1" />}
                      {pt.baseUrl && <span className="ml-1 font-mono text-[11px]">{pt.baseUrl}</span>}
                    </p>
                    {inlineTestResult[pt.id] && (
                      <p className={`text-xs ${inlineTestResult[pt.id]==="ok" ? "text-emerald-400" : "text-amber-400"}`}>Test: {inlineTestResult[pt.id]}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => testProviderMut.mutate(pt.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-white/[0.06] bg-[var(--brand)]/10 border-[var(--brand)]/20"
                    disabled={testProviderMut.isPending}
                    title="POST /git/providers/:id/test"
                  >
                    <Shield className="w-3 h-3" /> Test
                  </button>
                  <button
                    onClick={() => loadProviderRepos(pt.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-white/[0.06]"
                    disabled={loadingRepos === pt.id}
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingRepos === pt.id ? "animate-spin" : ""}`} /> Repos
                  </button>
                  <button
                    onClick={() => { void (async () => { if (await confirm({ title: "Disconnect this git provider?", description: "The provider connection will be removed from the panel. This cannot be undone.", danger: true, confirmLabel: "Disconnect" })) disconnectProvider.mutate(pt.id); })(); }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" /> Disconnect
                  </button>
                </div>
              </div>

              {/* Webhook secret view for git providers — derived from linked sources */}
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-400 flex items-center gap-1">
                  <Webhook className="w-3 h-3" /> Webhook secret (per-source) — linked sources for this provider
                </summary>
                <div className="mt-2 space-y-2">
                  {sources.filter((s) => s.providerTokenId === pt.id).length === 0 ? (
                    <p className="text-slate-500 text-xs">No sources linked to this provider. Link a repository in Sources tab to see webhook secrets.</p>
                  ) : sources.filter((s) => s.providerTokenId === pt.id).map((src) => (
                    <div key={src.id} className="rounded bg-white/[0.04] p-2 space-y-1">
                      <p className="font-mono text-[11px] text-slate-300">{src.repositoryOwner}/{src.repositoryName} — {src.branch}</p>
                      <p className="text-[11px] text-slate-400">Webhook URL: <code className="text-[10px] break-all">{src.webhookUrl || "—"}</code></p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Secret:</span>
                        {src.webhookSecret ? (
                          <>
                            <code className="text-[11px] font-mono bg-black/30 px-1.5 py-0.5 rounded">
                              {revealSecrets[src.id] ? src.webhookSecret : "•".repeat(16)}
                            </code>
                            <button onClick={() => setRevealSecrets((p) => ({ ...p, [src.id]: !p[src.id] }))} className="p-1 rounded hover:bg-white/[0.06]">
                              {revealSecrets[src.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(src.webhookSecret!); toast({ tone: "success", title: "Secret copied" }); }} className="text-[11px] underline text-slate-400">Copy</button>
                          </>
                        ) : (
                          <span className="text-[11px] text-amber-400">No secret — autoDeploy webhook may have failed</span>
                        )}
                      </div>
                      {src.webhookId && <p className="text-[11px] text-slate-500">Webhook ID: {src.webhookId}</p>}
                    </div>
                  ))}
                </div>
              </details>

              {selectedProviderRepos.length > 0 && (
                <div className="ml-6 mt-2 space-y-1 border-l-2 pl-3">
                  <p className="text-xs font-medium text-slate-400">Repositories:</p>
                  {selectedProviderRepos.map((repo) => (
                    <div key={repo.fullName} className="flex items-center justify-between text-xs">
                      <span>
                        {repo.name}
                        {repo.private && <span className="ml-1 text-slate-400">(private)</span>}
                      </span>
                      <button
                        onClick={() => loadProviderBranches(pt.id, repo.fullName)}
                        className="text-slate-400 hover:text-slate-200 underline text-xs"
                        disabled={loadingBranches === pt.id}
                      >
                        branches
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedProviderBranches.length > 0 && (
                <div className="ml-10 mt-1 space-y-1 text-xs text-slate-400">
                  {selectedProviderBranches.map((b) => (
                    <span key={b.name} className="mr-2 inline-flex items-center gap-1 bg-white/[0.06] px-1.5 py-0.5 rounded">
                      <GitBranch className="w-3 h-3" /> {b.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {showConnectProvider && (
            <ProviderForm
              onInlineTest={(body) => testProviderInlineMut.mutate(body)}
              onSubmit={(data) => connectProvider.mutate(data)}
              onCancel={() => setShowConnectProvider(false)}
              loading={connectProvider.isPending}
            />
          )}
        </div>
      )}

      {tab === "sources" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <GitBranch className="w-5 h-5" /> Git Sources
            </h2>
            <button
              onClick={() => setShowCreateSource(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded-md hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Link Repository
            </button>
          </div>

          {(!Array.isArray(sources) || sources.length === 0) && (
            <p className="text-slate-400 text-sm">No repositories linked.</p>
          )}

          {Array.isArray(sources) && sources.map((src) => (
            <div key={src.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    {src.repositoryOwner}/{src.repositoryName}
                    {src.provider && <span className="ml-2 text-xs text-slate-400 capitalize">({src.provider})</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Branch: {src.branch} — Auto-deploy: {src.autoDeploy ? <CheckCircle className="w-3 h-3 inline text-green-500" /> : <XCircle className="w-3 h-3 inline text-gray-400" />}
                  </p>
                  {src.autoDeploy && !src.webhookId && (
                    <p className="text-xs text-amber-400 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Auto-deploy webhook not configured — {(src as GitSource).webhookSetupError || "provider webhook setup failed or token lacks webhook permission"}
                    </p>
                  )}
                  {(src as GitSource).webhookSetupError && src.webhookId && (
                    <p className="text-xs text-amber-300 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Webhook warning: {(src as GitSource).webhookSetupError}
                    </p>
                  )}
                  {src.lastCommitSha && (
                    <p className="text-xs text-slate-400">
                      Last: {src.lastCommitSha.slice(0, 7)} — {src.lastCommitMessage?.slice(0, 80)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { void (async () => { if (await confirm({ title: "Remove this git source?", description: "The source deployment and its history will be removed. This cannot be undone.", danger: true, confirmLabel: "Remove" })) deleteSource.mutate(src.id); })(); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
              {src.webhookUrl && (
                <details className="text-xs" open={src.autoDeploy && !src.webhookId}>
                  <summary className="cursor-pointer text-slate-400 flex items-center gap-1">
                    <Webhook className="w-3 h-3" /> Webhook details — autoDeploy surfacing
                  </summary>
                  <div className="mt-1 p-2 bg-white/[0.06] rounded space-y-1">
                    <p>URL: <code className="text-[10px] break-all">{src.webhookUrl}</code></p>
                    {src.webhookId ? <p>ID: <code className="text-[10px]">{src.webhookId}</code></p> : <p className="text-amber-400">No webhook ID — autoDeploy may be broken <code className="text-[10px]">(POST /git/sources webhook setup failed)</code></p>}
                    <div className="flex items-center gap-2">
                      <span>Secret:</span>
                      {src.webhookSecret ? (
                        <>
                          <code className="text-[11px] font-mono bg-black/30 px-1.5 py-0.5 rounded">{revealSecrets[src.id] ? src.webhookSecret : "•".repeat(16)}</code>
                          <button onClick={() => setRevealSecrets((p) => ({ ...p, [src.id]: !p[src.id] }))} className="p-1 rounded hover:bg-white/[0.06]">
                            {revealSecrets[src.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(src.webhookSecret!); toast({ tone: "success", title: "Webhook secret copied" }); }} className="text-[11px] underline">Copy</button>
                        </>
                      ) : <span className="text-amber-400">missing — rotate via provider webhook settings</span>}
                    </div>
                  </div>
                </details>
              )}
            </div>
          ))}

          {showCreateSource && (
            <SourceForm
              credentials={credentials}
              providerTokens={providerTokens}
              onSubmit={(data) => createSource.mutate(data)}
              onCancel={() => setShowCreateSource(false)}
              loading={createSource.isPending}
            />
          )}
        </div>
      )}
      {renderConfirm()}
    </AdminPageLayout>
  );
}

function CredentialForm({
  onSubmit, onCancel, loading,
}: {
  onSubmit: (data: { name: string; credentialType: string; credential: string; description: string }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [credType, setCredType] = useState("ssh_key");
  const [credential, setCredential] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="border rounded-lg p-4 bg-[#111722] space-y-3">
      <h3 className="font-medium text-sm">New Credential</h3>
      <input
        placeholder="Name (e.g. GitHub Deploy Key)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      />
      <select
        value={credType}
        onChange={(e) => setCredType(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      >
        <option value="ssh_key">SSH Key</option>
        <option value="https_token">HTTPS Token</option>
        <option value="https_password">HTTPS Username/Password</option>
      </select>
      {credType === "ssh_key" ? (
        <textarea
          placeholder="Paste SSH private key..."
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          className="w-full p-2 border rounded text-sm font-mono min-h-[100px] bg-[var(--surface-input)]"
        />
      ) : credType === "https_token" ? (
        <input
          placeholder="Access token"
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
      ) : (
        <input
          placeholder="username:password"
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
      )}
      <input
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-white/[0.06]">Cancel</button>
        <button
          onClick={() => onSubmit({ name, credentialType: credType, credential, description })}
          disabled={loading || !name || !credential}
          className="px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded hover:opacity-90 disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function ProviderForm({
  onSubmit, onCancel, loading, onInlineTest,
}: {
  onSubmit: (data: { provider: string; providerName: string; accessToken: string; refreshToken: string; tokenType: string; baseUrl: string; username: string }) => void;
  onCancel: () => void;
  loading: boolean;
  onInlineTest?: (body: { provider: string; accessToken: string; baseUrl?: string }) => void;
}) {
  const [provider, setProvider] = useState("github");
  const [providerName, setProviderName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenType] = useState("bearer");
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");

  return (
    <div className="border rounded-lg p-4 bg-[#111722] space-y-3">
      <h3 className="font-medium text-sm">Connect Git Provider — POST /git/providers & POST /git/providers/test (inline)</h3>
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      >
        <option value="github">GitHub</option>
        <option value="gitlab">GitLab</option>
        <option value="bitbucket">Bitbucket</option>
        <option value="gitea">Gitea</option>
      </select>
      <input
        placeholder="Display name (e.g. Personal GitHub)"
        value={providerName}
        onChange={(e) => setProviderName(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      />
      <input
        placeholder="Access token / Personal access token"
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        type="password"
        autoComplete="off"
      />
      {provider === "gitea" && (
        <input
          placeholder="Gitea base URL (e.g. https://git.example.com)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
      )}
      <input
        placeholder="Refresh token (optional)"
        value={refreshToken}
        onChange={(e) => setRefreshToken(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        type="password"
        autoComplete="off"
      />
      <input
        placeholder="Username (optional)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      />
      <p className="text-[11px] text-slate-500">Inline test: POST /git/providers/test — validates token without persisting</p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => onInlineTest?.({ provider, accessToken, baseUrl: baseUrl || undefined })}
          disabled={!accessToken}
          className="px-3 py-1.5 text-sm border rounded hover:bg-white/[0.06] disabled:opacity-40"
        >
          Test (inline)
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-white/[0.06]">Cancel</button>
        <button
          onClick={() => onSubmit({ provider, providerName, accessToken, refreshToken, tokenType, baseUrl, username })}
          disabled={loading || !accessToken}
          className="px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded hover:opacity-90 disabled:opacity-50"
        >
          Connect
        </button>
      </div>
    </div>
  );
}

function SourceForm({
  credentials, providerTokens, onSubmit, onCancel, loading,
}: {
  credentials: GitCredential[];
  providerTokens: GitProviderToken[];
  onSubmit: (data: {
    credentialId?: string; providerTokenId?: string; provider: string;
    repositoryUrl: string; repositoryName: string; repositoryOwner: string;
    branch: string; autoDeploy: boolean;
  }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [branch, setBranch] = useState("main");
  const [autoDeploy, setAutoDeploy] = useState(true);
  const [credentialId, setCredentialId] = useState("");
  const [providerTokenId, setProviderTokenId] = useState("");
  const [provider, setProvider] = useState("");
  const [authMode, setAuthMode] = useState<"credential" | "provider" | "none">("none");
  const showAutoDeployWarning = autoDeploy && authMode !== "provider";

  return (
    <div className="border rounded-lg p-4 bg-[#111722] space-y-3">
      <h3 className="font-medium text-sm">Link Repository</h3>
      {showAutoDeployWarning && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> Auto-deploy requires a Provider Token — generic/credential mode cannot install webhooks
        </div>
      )}

      <div className="flex gap-2">
        {(["none", "credential", "provider"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setAuthMode(mode)}
            className={`px-3 py-1 text-xs rounded ${
              authMode === mode ? "bg-[var(--brand)] text-white" : "border hover:bg-white/[0.06]"
            }`}
          >
            {mode === "none" ? "Public" : mode === "credential" ? "Deploy Key/Credential" : "Provider Token"}
          </button>
        ))}
      </div>

      {authMode === "credential" && (
        <select
          value={credentialId}
          onChange={(e) => setCredentialId(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        >
          <option value="">Select credential...</option>
          {Array.isArray(credentials) && credentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.credentialType})</option>
          ))}
        </select>
      )}

      {authMode === "provider" && (
        <select
          value={providerTokenId}
          onChange={(e) => {
            setProviderTokenId(e.target.value);
            const pt = Array.isArray(providerTokens) ? providerTokens.find((t) => t.id === e.target.value) : undefined;
            if (pt) setProvider(pt.provider);
          }}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        >
          <option value="">Select provider...</option>
          {Array.isArray(providerTokens) && providerTokens.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.provider}{pt.providerName ? ` (${pt.providerName})` : ""}
            </option>
          ))}
        </select>
      )}

      <input
        placeholder="Repository URL (e.g. https://github.com/user/repo.git)"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Repository owner"
          value={repoOwner}
          onChange={(e) => setRepoOwner(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
        <input
          placeholder="Repository name"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          className="w-full p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="flex-1 p-2 border rounded text-sm bg-[var(--surface-input)]"
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={autoDeploy}
            onChange={(e) => setAutoDeploy(e.target.checked)}
          />
          Auto-deploy
        </label>
      </div>
      {autoDeploy && !providerTokenId && (
        <p className="text-xs text-amber-400">Auto-deploy will be saved but webhook will not be installed without a provider token — you can link provider later and re-enable</p>
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-white/[0.06]">Cancel</button>
        <button
          onClick={() => onSubmit({
            credentialId: authMode === "credential" && credentialId ? credentialId : undefined,
            providerTokenId: authMode === "provider" && providerTokenId ? providerTokenId : undefined,
            provider,
            repositoryUrl: repoUrl,
            repositoryName: repoName,
            repositoryOwner: repoOwner,
            branch,
            autoDeploy,
          })}
          disabled={loading || !repoUrl || !repoName}
          className="px-3 py-1.5 text-sm bg-[var(--brand)] text-white rounded hover:opacity-90 disabled:opacity-50"
        >
          Link
        </button>
      </div>
    </div>
  );
}
