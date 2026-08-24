'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchOrganization,
  fetchProjects,
  createProject,
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  deleteOrganization,
  fetchOrgServers,
} from '@/lib/api/tenancy';
import type { Organization, Project, TeamMember } from '@/lib/api/tenancy';
import type { ApiServer } from '@/lib/api/types';
import { Pagination } from '@/components/ui/primitives';

export default function OrganizationDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'projects' | 'members' | 'servers'>('projects');

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrganization(params.slug);
      setOrg(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params.slug]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const fetchProjectList = useCallback(async () => {
    if (!org) return;
    try {
      const data = await fetchProjects(org.id);
      setProjects(data);
    } catch {}
  }, [org]);

  const fetchMemberList = useCallback(async () => {
    if (!org) return;
    try {
      const data = await fetchTeamMembers(org.id);
      setMembers(data);
    } catch {}
  }, [org]);

  useEffect(() => { fetchProjectList(); fetchMemberList(); }, [fetchProjectList, fetchMemberList]);

  const handleDelete = async () => {
    if (!org || !confirm(`Delete organization "${org.name}"? This cannot be undone.`)) return;
    try {
      await deleteOrganization(org.id);
      router.push('/organizations');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-8 text-gray-400">Loading...</div>;
  if (error) return <div className="mx-auto max-w-4xl px-4 py-8 text-red-400">{error}</div>;
  if (!org) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/organizations" className="text-sm text-gray-500 hover:text-gray-300">← Organizations</Link>
          <h1 className="mt-2 text-2xl font-bold text-white">{org.name}</h1>
          <p className="text-sm text-gray-400">Owner: {org.ownerName}</p>
        </div>
        <button
          onClick={handleDelete}
          className="rounded-lg border border-red-500/20 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>

      <div className="mb-6 flex gap-4 border-b border-white/10">
        <button
          onClick={() => setTab('projects')}
          className={`pb-3 text-sm font-medium transition ${tab === 'projects' ? 'border-b-2 text-[var(--brand)] border-[var(--brand)]' : 'text-gray-400 hover:text-gray-300'}`}
        >
          Projects ({projects.length})
        </button>
        <button
          onClick={() => setTab('members')}
          className={`pb-3 text-sm font-medium transition ${tab === 'members' ? 'border-b-2 text-[var(--brand)] border-[var(--brand)]' : 'text-gray-400 hover:text-gray-300'}`}
        >
          Members ({members.length})
        </button>
        <button
          onClick={() => setTab('servers')}
          className={`pb-3 text-sm font-medium transition ${tab === 'servers' ? 'border-b-2 text-[var(--brand)] border-[var(--brand)]' : 'text-gray-400 hover:text-gray-300'}`}
        >
          Servers
        </button>
      </div>

      {tab === 'projects' && <ProjectsTab orgId={org.id} projects={projects} onRefresh={fetchProjectList} />}
      {tab === 'members' && <MembersTab orgId={org.id} members={members} onRefresh={fetchMemberList} />}
      {tab === 'servers' && <OrgServersTab orgId={org.id} />}
    </div>
  );
}

function ProjectsTab({ orgId, projects, onRefresh }: { orgId: string; projects: Project[]; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createProject(orgId, name.trim(), undefined, desc.trim() || undefined);
      setName(''); setDesc(''); onRefresh();
    } catch {}
    setCreating(false);
  };

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 flex gap-3">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--brand)]/50 focus:outline-none" required
        />
        <input
          value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description"
          className="w-48 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--brand)]/50 focus:outline-none"
        />
        <button type="submit" disabled={creating || !name.trim()} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {creating ? '...' : 'Add'}
        </button>
      </form>

      {projects.length === 0 && <p className="text-sm text-gray-500">No projects yet.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">{p.name}</h3>
            {p.description && <p className="mt-1 text-xs text-gray-400">{p.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersTab({ orgId, members, onRefresh }: { orgId: string; members: TeamMember[]; onRefresh: () => void }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;
    setAdding(true);
    try {
      await addTeamMember(orgId, userId.trim(), role);
      setUserId(''); setRole('member'); onRefresh();
    } catch {}
    setAdding(false);
  };

  const handleRemove = async (memberUserId: string) => {
    try {
      await removeTeamMember(orgId, memberUserId);
      onRefresh();
    } catch {}
  };

  return (
    <div>
      <form onSubmit={handleAdd} className="mb-6 flex gap-3">
        <input
          value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID"
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--brand)]/50 focus:outline-none" required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="submit" disabled={adding || !userId.trim()} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {adding ? '...' : 'Add'}
        </button>
      </form>

      {members.length === 0 && <p className="text-sm text-gray-500">No members yet.</p>}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-white">{m.email}</span>
              <span className={`ml-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                m.role === 'owner' ? 'bg-yellow-500/20 text-yellow-400' :
                m.role === 'admin' ? 'bg-[var(--brand)]/20 text-[var(--brand)]' :
                m.role === 'viewer' ? 'bg-gray-500/20 text-gray-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>{m.role}</span>
            </div>
            {m.role !== 'owner' && (
              <button onClick={() => handleRemove(m.userId)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgServersTab({ orgId }: { orgId: string }) {
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOrgServers(orgId, { page, per_page: perPage, search: search || undefined });
      setServers(res.data ?? []);
      const pagination = res.meta?.pagination;
      if (pagination) {
        // backend returns total as total records, per_page as page size
        setTotal(pagination.total ?? res.data.length);
      } else {
        setTotal(res.data?.length ?? 0);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, page, perPage, search]);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search servers..."
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--brand)]/50 focus:outline-none"
        />
        <button type="submit" className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">Search</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5">Clear</button>
        )}
      </form>

      {loading ? (
        <div className="p-6 text-sm text-slate-400">Loading servers...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      ) : servers.length === 0 ? (
        <p className="text-sm text-gray-500">No servers in this organization.</p>
      ) : (
        <>
          <div className="space-y-2">
            {servers.map((s) => (
              <Link
                key={s.id}
                href={`/server/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-[var(--brand)]/30 hover:bg-white/[0.07]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{s.name}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                      s.status === 'offline' ? 'bg-gray-500/20 text-gray-400' :
                      s.status === 'installing' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>{s.status}</span>
                  </div>
                  {s.description && <p className="mt-1 truncate text-xs text-gray-400">{s.description}</p>}
                  <p className="mt-1 text-xs text-gray-500">{s.node} • {s.allocation ?? s.primaryAllocationId ?? ''}</p>
                </div>
                <span className="ml-3 shrink-0 text-xs text-gray-400">→</span>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} label="Organization servers pagination" />
          <p className="mt-2 text-center text-xs text-gray-500">{total} total • page {page} of {pageCount}</p>
        </>
      )}
    </div>
  );
}
