"use client";

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, fetchJSON, postJSON, patchJSON, deleteJSON } from '@/lib/api/http';
import { Plus, MoreVertical, RefreshCw, Trash2, Lock, Unlock, Play, XCircle, RotateCcw, Download, Database, Server, AppWindow, Folder, RotateCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AdminPageLayout, AdminPageHeader, AdminTabs, AdminTable, AdminTHead, AdminTh, AdminTBody, AdminTr, AdminTd, Card, CardHeader, Btn, Input, Modal, ModalFooter, EmptyState, AdminLoadingState, AdminErrorState, Pill } from '@/components/admin/admin-ui';
import { useToast } from '@/components/ui/toast';

// Types
interface BackupConfiguration {
  id: string;
  name: string;
  description: string;
  backupType: 'app' | 'volume' | 'database' | 'server';
  serverId?: string;
  appId?: string;
  databaseId?: string;
  volumeId?: string;
  isScheduled: boolean;
  cronExpression: string;
  storageProvider: string;
  maxBackups: number;
  retentionDays: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  enabled: boolean;
  lastStatus: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackupJob {
  id: string;
  name: string;
  jobType: 'app' | 'volume' | 'database' | 'server' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  bytesProcessed: number;
  totalBytes: number;
  startedAt: string | null;
  completedAt: string | null;
  triggeredBy: string;
  createdAt: string;
}

interface CreateBackupJobRequest {
  name: string;
  jobType: 'app' | 'volume' | 'database' | 'server';
  serverId?: string;
  appId?: string;
  databaseId?: string;
  volumeId?: string;
  description?: string;
}

interface BackupArtifact {
  id: string;
  name: string;
  displayName: string;
  artifactType: 'app' | 'volume' | 'database' | 'server';
  storageProvider: string;
  fileSize: number;
  fileHash: string;
  status: string;
  isVerified: boolean;
  isLocked: boolean;
  createdAt: string;
  uploadedAt: string | null;
}

interface BackupRestore {
  id: string;
  name: string;
  description?: string;
  overwrite?: boolean;
  restoreType: 'app' | 'volume' | 'database' | 'server';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  triggeredBy: string;
  createdAt: string;
}

interface StorageProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isDefault: boolean;
}

interface BackupSystemStatus {
  backupConfigurations: {
    total: number;
    scheduled: number;
    enabled: number;
  };
  backupJobs: {
    total: number;
    running: number;
    pending: number;
    failed: number;
  };
  backupArtifacts: {
    total: number;
    verified: number;
    locked: number;
    expired: number;
  };
  backupRestores: {
    total: number;
    completed: number;
    failed: number;
  };
  storageProviders: number;
}

// API Functions
const api = {
  getBackupConfigs: (): Promise<BackupConfiguration[]> =>
    fetchJSON<BackupConfiguration[]>('/admin/backups/configs'),

  createBackupConfig: (data: Partial<BackupConfiguration>): Promise<BackupConfiguration> =>
    postJSON<BackupConfiguration>('/admin/backups/configs', data),

  updateBackupConfig: (id: string, data: Partial<BackupConfiguration>): Promise<BackupConfiguration> =>
    patchJSON<BackupConfiguration>(`/admin/backups/configs/${encodeURIComponent(id)}`, data),

  deleteBackupConfig: (id: string): Promise<void> =>
    deleteJSON(`/admin/backups/configs/${encodeURIComponent(id)}`),

  executeBackupConfig: (id: string): Promise<BackupJob> =>
    postJSON<BackupJob>(`/admin/backups/configs/${encodeURIComponent(id)}/execute`),

  getBackupJobs: (): Promise<BackupJob[]> =>
    fetchJSON<BackupJob[]>('/admin/backups/jobs'),

  createBackupJob: (data: CreateBackupJobRequest): Promise<BackupJob> =>
    postJSON<BackupJob>('/admin/backups/jobs', data),

  cancelBackupJob: async (id: string): Promise<void> => {
    await postJSON(`/admin/backups/jobs/${encodeURIComponent(id)}/cancel`);
  },

  deleteBackupJob: (id: string): Promise<void> =>
    deleteJSON(`/admin/backups/jobs/${encodeURIComponent(id)}`),

  getBackupArtifacts: (): Promise<BackupArtifact[]> =>
    fetchJSON<BackupArtifact[]>('/admin/backups/artifacts'),

  deleteBackupArtifact: (id: string): Promise<void> =>
    deleteJSON(`/admin/backups/artifacts/${encodeURIComponent(id)}`),

  lockBackupArtifact: async (id: string, reason: string): Promise<void> => {
    await postJSON(`/admin/backups/artifacts/${encodeURIComponent(id)}/lock`, { reason });
  },

  unlockBackupArtifact: async (id: string): Promise<void> => {
    await postJSON(`/admin/backups/artifacts/${encodeURIComponent(id)}/unlock`);
  },

  downloadBackupArtifact: async (id: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/admin/backups/artifacts/${encodeURIComponent(id)}/download`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to download backup artifact');
    return response.blob();
  },

  getBackupRestores: (): Promise<BackupRestore[]> =>
    fetchJSON<BackupRestore[]>('/admin/backups/restores'),

  createRestore: (data: Partial<BackupRestore> & { artifactId: string }): Promise<BackupRestore> =>
    postJSON<BackupRestore>('/admin/backups/restore', data),

  deleteBackupRestore: (id: string): Promise<void> =>
    deleteJSON(`/admin/backups/restores/${encodeURIComponent(id)}`),

  getStorageProviders: (): Promise<StorageProvider[]> =>
    fetchJSON<StorageProvider[]>('/admin/backups/storage-providers'),

  getBackupSystemStatus: (): Promise<BackupSystemStatus> =>
    fetchJSON<BackupSystemStatus>('/admin/backups/status'),
};

// Helper Functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
};

const getStatusTone = (status: string): "green" | "red" | "yellow" | "neutral" | "blue" => {
  switch (status) {
    case 'completed':
    case 'verified':
    case 'restored':
      return 'green';
    case 'running':
    case 'restoring':
      return 'blue';
    case 'enabled':
      return 'green';
    case 'disabled':
      return 'neutral';
    case 'pending':
      return 'yellow';
    case 'failed':
    case 'cancelled':
    case 'restore_failed':
      return 'red';
    default:
      return 'neutral';
  }
};

const backupTypeIcons: Record<string, React.ReactNode> = {
  app: <AppWindow size={14} />,
  volume: <Folder size={14} />,
  database: <Database size={14} />,
  server: <Server size={14} />,
};

const getBackupTypeIcon = (type: string) => backupTypeIcons[type] ?? null;

// Main Component
export default function BackupManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const [isCreateConfigOpen, setIsCreateConfigOpen] = useState(false);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<BackupArtifact | null>(null);

  const ALL_KEY = ["admin", "backups"];

  const backupConfigsQuery = useQuery({
    queryKey: [...ALL_KEY, "configs"],
    queryFn: api.getBackupConfigs,
    refetchInterval: 30_000,
  });

  const backupJobsQuery = useQuery({
    queryKey: [...ALL_KEY, "jobs"],
    queryFn: api.getBackupJobs,
    refetchInterval: 30_000,
  });

  const backupArtifactsQuery = useQuery({
    queryKey: [...ALL_KEY, "artifacts"],
    queryFn: api.getBackupArtifacts,
    refetchInterval: 30_000,
  });

  const backupRestoresQuery = useQuery({
    queryKey: [...ALL_KEY, "restores"],
    queryFn: api.getBackupRestores,
    refetchInterval: 30_000,
  });

  const storageProvidersQuery = useQuery({
    queryKey: [...ALL_KEY, "storage-providers"],
    queryFn: api.getStorageProviders,
    refetchInterval: 30_000,
  });

  const systemStatusQuery = useQuery({
    queryKey: [...ALL_KEY, "status"],
    queryFn: api.getBackupSystemStatus,
    refetchInterval: 30_000,
  });

  const backupConfigs = useMemo(() => Array.isArray(backupConfigsQuery.data) ? backupConfigsQuery.data : [], [backupConfigsQuery.data]);
  const backupJobs = useMemo(() => Array.isArray(backupJobsQuery.data) ? backupJobsQuery.data : [], [backupJobsQuery.data]);
  const backupArtifacts = useMemo(() => Array.isArray(backupArtifactsQuery.data) ? backupArtifactsQuery.data : [], [backupArtifactsQuery.data]);
  const backupRestores = useMemo(() => Array.isArray(backupRestoresQuery.data) ? backupRestoresQuery.data : [], [backupRestoresQuery.data]);
  const storageProviders = useMemo(() => Array.isArray(storageProvidersQuery.data) ? storageProvidersQuery.data : [], [storageProvidersQuery.data]);
  const systemStatus = systemStatusQuery.data ?? null;
  const loading = backupConfigsQuery.isLoading || backupJobsQuery.isLoading || backupArtifactsQuery.isLoading || backupRestoresQuery.isLoading || storageProvidersQuery.isLoading || systemStatusQuery.isLoading;
  const error = backupConfigsQuery.error || backupJobsQuery.error || backupArtifactsQuery.error || backupRestoresQuery.error || storageProvidersQuery.error || systemStatusQuery.error;

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ALL_KEY });

  const createConfigMut = useMutation({
    mutationFn: (data: Partial<BackupConfiguration>) => api.createBackupConfig(data),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup configuration created successfully" }); setIsCreateConfigOpen(false); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to create backup configuration" }),
  });

  const executeConfigMut = useMutation({
    mutationFn: (id: string) => api.executeBackupConfig(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup configuration executed successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to execute backup configuration" }),
  });

  const createJobMut = useMutation({
    mutationFn: (data: CreateBackupJobRequest) => api.createBackupJob(data),
    onSuccess: () => {
      invalidateAll();
      toast({ tone: "success", title: "Backup job created successfully" });
      setIsCreateJobOpen(false);
    },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to create backup job" }),
  });

  const deleteConfigMut = useMutation({
    mutationFn: (id: string) => api.deleteBackupConfig(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup configuration deleted successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to delete backup configuration" }),
  });

  const deleteJobMut = useMutation({
    mutationFn: (id: string) => api.deleteBackupJob(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup job deleted successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to delete backup job" }),
  });

  const cancelJobMut = useMutation({
    mutationFn: (id: string) => api.cancelBackupJob(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup job cancelled successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to cancel backup job" }),
  });

  const deleteArtifactMut = useMutation({
    mutationFn: (id: string) => api.deleteBackupArtifact(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup artifact deleted successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to delete backup artifact" }),
  });

  const lockArtifactMut = useMutation({
    mutationFn: (id: string) => api.lockBackupArtifact(id, 'Manual lock'),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup artifact locked successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to lock backup artifact" }),
  });

  const unlockArtifactMut = useMutation({
    mutationFn: (id: string) => api.unlockBackupArtifact(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup artifact unlocked successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to unlock backup artifact" }),
  });

  const downloadArtifactMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const blob = await api.downloadBackupArtifact(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to download backup artifact" }),
  });

  const createRestoreMut = useMutation({
    mutationFn: (data: Partial<BackupRestore> & { artifactId: string }) => api.createRestore(data),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Restore operation created successfully" }); setIsRestoreOpen(false); setSelectedArtifact(null); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to create restore operation" }),
  });

  const deleteRestoreMut = useMutation({
    mutationFn: (id: string) => api.deleteBackupRestore(id),
    onSuccess: () => { invalidateAll(); toast({ tone: "success", title: "Backup restore deleted successfully" }); },
    onError: (err) => toast({ tone: "error", title: err instanceof Error ? err.message : "Failed to delete backup restore" }),
  });

  const handleSearch = (query: string) => setSearchQuery(query);

  const filteredConfigs = useMemo(() => Array.isArray(backupConfigs) ? backupConfigs.filter(config =>
    config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    config.description.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [], [backupConfigs, searchQuery]);

  const filteredJobs = useMemo(() => Array.isArray(backupJobs) ? backupJobs.filter(job =>
    job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.status.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [], [backupJobs, searchQuery]);

  const filteredArtifacts = useMemo(() => Array.isArray(backupArtifacts) ? backupArtifacts.filter(artifact =>
    artifact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    artifact.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [], [backupArtifacts, searchQuery]);

  const filteredRestores = useMemo(() => Array.isArray(backupRestores) ? backupRestores.filter(restore =>
    restore.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    restore.status.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [], [backupRestores, searchQuery]);

  const renderStatusPill = (status: string) => (
    <Pill tone={getStatusTone(status)}>{status}</Pill>
  );

  const renderBackupTypePill = (type: string) => (
    <Pill tone="blue" className="flex items-center gap-1">
      {getBackupTypeIcon(type)}
      {type}
    </Pill>
  );

  const renderProgress = (progress: number) => (
    <span className="text-xs text-slate-400">{Math.round(progress)}%</span>
  );

  const CreateConfigModal = ({ onClose, storageProviders: sp }: { onClose: () => void; storageProviders: StorageProvider[] }) => {
    const [targetId, setTargetId] = useState('');
    const [volumeServerId, setVolumeServerId] = useState('');
    const [formData, setFormData] = useState<Partial<BackupConfiguration>>({
      backupType: 'app',
      isScheduled: false,
      storageProvider: Array.isArray(sp) ? (sp.find(p => p.isDefault)?.name || sp[0]?.name || '') : '',
      maxBackups: 10,
      retentionDays: 30,
      compressionEnabled: true,
      encryptionEnabled: false,
      enabled: true,
    });

    const handleSubmit = () => {
      const backupType = formData.backupType || 'server';
      const targetField = {
        app: 'appId',
        volume: 'volumeId',
        database: 'databaseId',
        server: 'serverId',
      }[backupType];
      createConfigMut.mutate({
        ...formData,
        [targetField]: targetId.trim(),
        ...(backupType === 'volume' ? { serverId: volumeServerId.trim() } : {}),
      });
    };

    return (
      <Modal title="Create Backup Configuration" onClose={onClose} description="Create a new backup configuration for scheduled or on-demand backups.">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Name *" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Backup Type *</label>
            <select className="h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 text-sm text-slate-100" value={formData.backupType} onChange={(e) => setFormData({...formData, backupType: e.target.value as 'app' | 'volume' | 'database' | 'server'})}>
              <option value="app">App</option>
              <option value="volume">Volume</option>
              <option value="database">Database</option>
              <option value="server">Server</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Input label="Description" value={formData.description || ''} onChange={(v) => setFormData({...formData, description: v})} />
          </div>
          <Input label="Target ID *" value={targetId} onChange={setTargetId} />
          {formData.backupType === 'volume' && (
            <Input label="Server ID *" value={volumeServerId} onChange={setVolumeServerId} />
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Storage Provider *</label>
            <select className="h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 text-sm text-slate-100" value={formData.storageProvider} onChange={(e) => setFormData({...formData, storageProvider: e.target.value})}>
              {Array.isArray(sp) && sp.map(p => (
                <option key={p.id} value={p.name}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
          <Input label="Max Backups" value={String(formData.maxBackups ?? 10)} onChange={(v) => setFormData({...formData, maxBackups: parseInt(v) || 0})} type="number" />
          <Input label="Retention Days" value={String(formData.retentionDays ?? 30)} onChange={(v) => setFormData({...formData, retentionDays: parseInt(v) || 0})} type="number" />
          <Input label="Cron Expression" value={formData.cronExpression || ''} onChange={(v) => setFormData({...formData, cronExpression: v, isScheduled: v !== ''})} placeholder="0 0 * * *" />
        </div>
        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formData.compressionEnabled || false} onChange={(e) => setFormData({...formData, compressionEnabled: e.target.checked})} className="rounded border-white/20" />
            Compression
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formData.encryptionEnabled || false} onChange={(e) => setFormData({...formData, encryptionEnabled: e.target.checked})} className="rounded border-white/20" />
            Encryption
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formData.enabled || false} onChange={(e) => setFormData({...formData, enabled: e.target.checked})} className="rounded border-white/20" />
            Enabled
          </label>
        </div>
        <ModalFooter onCancel={onClose} onConfirm={handleSubmit} disabled={createConfigMut.isPending || !targetId.trim() || (formData.backupType === 'volume' && !volumeServerId.trim())} confirmLabel={createConfigMut.isPending ? "Creating..." : "Create Configuration"} />
      </Modal>
    );
  };

  const CreateJobModal = ({ onClose }: { onClose: () => void }) => {
    const [name, setName] = useState('');
    const [jobType, setJobType] = useState<CreateBackupJobRequest['jobType']>('server');
    const [targetId, setTargetId] = useState('');
    const [volumeServerId, setVolumeServerId] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = () => {
      const targetField = {
        app: 'appId',
        volume: 'volumeId',
        database: 'databaseId',
        server: 'serverId',
      }[jobType];
      createJobMut.mutate({
        name: name.trim(),
        jobType,
        description: description.trim() || undefined,
        [targetField]: targetId.trim(),
        ...(jobType === 'volume' ? { serverId: volumeServerId.trim() } : {}),
      });
    };

    return (
      <Modal title="Create Backup Job" onClose={onClose} description="Create an on-demand backup for one application resource.">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Name *" value={name} onChange={setName} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Backup Type *</label>
            <select className="h-10 w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 text-sm text-slate-100" value={jobType} onChange={(e) => setJobType(e.target.value as CreateBackupJobRequest['jobType'])}>
              <option value="app">App</option>
              <option value="volume">Volume</option>
              <option value="database">Database</option>
              <option value="server">Server</option>
            </select>
          </div>
          <Input label="Target ID *" value={targetId} onChange={setTargetId} />
          {jobType === 'volume' && (
            <Input label="Server ID *" value={volumeServerId} onChange={setVolumeServerId} />
          )}
          <div className="md:col-span-2">
            <Input label="Description" value={description} onChange={setDescription} />
          </div>
        </div>
        <ModalFooter onCancel={onClose} onConfirm={handleSubmit} disabled={createJobMut.isPending || !name.trim() || !targetId.trim() || (jobType === 'volume' && !volumeServerId.trim())} confirmLabel={createJobMut.isPending ? 'Creating...' : 'Create Job'} />
      </Modal>
    );
  };

  const RestoreModal = ({ onClose, artifact }: { onClose: () => void; artifact: BackupArtifact | null }) => {
    const [formData, setFormData] = useState<Partial<BackupRestore> & { artifactId: string }>({
      artifactId: artifact?.id || '',
      restoreType: artifact?.artifactType || 'app',
      triggeredBy: 'manual',
    });

    const handleSubmit = () => {
      createRestoreMut.mutate(formData);
    };

    return (
      <Modal title="Restore Backup" onClose={onClose} description={`Restore from backup artifact: ${artifact?.displayName || artifact?.name || ''}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Restore Name" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} placeholder={artifact ? `restore-${artifact.name}-${new Date().toISOString().slice(0, 10)}` : ''} />
          <Input label="Restore Type" value={formData.restoreType || ''} onChange={() => {}} readOnly />
          <div className="md:col-span-2">
            <Input label="Description" value={formData.description || ''} onChange={(v) => setFormData({...formData, description: v})} placeholder="Optional description for this restore operation" />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={formData.overwrite || false} onChange={(e) => setFormData({...formData, overwrite: e.target.checked})} className="rounded border-white/20" />
            Overwrite Existing
          </label>
        </div>
        <ModalFooter onCancel={onClose} onConfirm={handleSubmit} disabled={createRestoreMut.isPending} confirmLabel="Start Restore" />
      </Modal>
    );
  };

  const OverviewTab = () => (
    <div className="space-y-6">
      {error && (
        <AdminErrorState message={error instanceof Error ? error.message : 'Failed to fetch data'} retry={() => queryClient.invalidateQueries({ queryKey: ALL_KEY })} />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <Server size={12} /> Backup Configurations
          </div>
          <div className="text-2xl font-bold text-slate-100">{systemStatus?.backupConfigurations.total || 0}</div>
          <p className="text-xs text-slate-500">{systemStatus?.backupConfigurations.scheduled || 0} scheduled, {systemStatus?.backupConfigurations.enabled || 0} enabled</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <Database size={12} /> Backup Jobs
          </div>
          <div className="text-2xl font-bold text-slate-100">{systemStatus?.backupJobs.total || 0}</div>
          <p className="text-xs text-slate-500">{systemStatus?.backupJobs.running || 0} running, {systemStatus?.backupJobs.pending || 0} pending</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <Folder size={12} /> Backup Artifacts
          </div>
          <div className="text-2xl font-bold text-slate-100">{systemStatus?.backupArtifacts.total || 0}</div>
          <p className="text-xs text-slate-500">{systemStatus?.backupArtifacts.verified || 0} verified, {systemStatus?.backupArtifacts.locked || 0} locked</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <RotateCw size={12} /> Restore Operations
          </div>
          <div className="text-2xl font-bold text-slate-100">{systemStatus?.backupRestores.total || 0}</div>
          <p className="text-xs text-slate-500">{systemStatus?.backupRestores.completed || 0} completed</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Storage Providers" icon={Server} />
        <div className="divide-y divide-white/[0.04]">
          {Array.isArray(storageProviders) && storageProviders.map(provider => (
            <div key={provider.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{provider.name}</span>
                <Pill tone="blue">{provider.type}</Pill>
                {provider.isDefault && <Pill tone="green">Default</Pill>}
              </div>
              <Pill tone={provider.enabled ? "green" : "neutral"}>{provider.enabled ? 'Enabled' : 'Disabled'}</Pill>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Quick Actions" />
        <div className="flex flex-wrap gap-3 p-5">
          <Btn onClick={() => setIsCreateConfigOpen(true)}><Plus size={14} /> Create Configuration</Btn>
          <Btn tone="ghost" onClick={() => setIsCreateJobOpen(true)}><Plus size={14} /> Create Backup Job</Btn>
          <Btn tone="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ALL_KEY })} disabled={loading}><RefreshCw size={14} /> Refresh Data</Btn>
        </div>
      </Card>
    </div>
  );

  const ConfigurationsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input label="" value={searchQuery} onChange={handleSearch} placeholder="Search configurations..." />
        <Btn onClick={() => setIsCreateConfigOpen(true)}><Plus size={14} /> Create Configuration</Btn>
      </div>

      <Card>
        <CardHeader title="Backup Policies" />
        {backupConfigsQuery.isLoading ? (
          <AdminLoadingState label="Loading configurations..." />
        ) : backupConfigsQuery.isError ? (
          <AdminErrorState message={backupConfigsQuery.error.message} retry={() => void backupConfigsQuery.refetch()} />
        ) : !Array.isArray(filteredConfigs) || filteredConfigs.length === 0 ? (
          <EmptyState icon={Server} message="No backup policies found" />
        ) : (
          <AdminTable>
            <AdminTHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Storage</AdminTh>
              <AdminTh>Schedule</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh><span /></AdminTh>
            </AdminTHead>
            <AdminTBody>
              {filteredConfigs.map(config => (
                <AdminTr key={config.id}>
                  <AdminTd className="font-medium">{config.name}</AdminTd>
                  <AdminTd>{renderBackupTypePill(config.backupType)}</AdminTd>
                  <AdminTd className="text-slate-400">{config.storageProvider}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">
                    {config.isScheduled ? (
                      <span>{config.cronExpression}{config.nextRunAt ? <span className="block text-slate-500">Next: {formatDate(config.nextRunAt)}</span> : null}</span>
                    ) : (
                      <span>Manual</span>
                    )}
                  </AdminTd>
                  <AdminTd>{renderStatusPill(config.enabled ? 'enabled' : 'disabled')}</AdminTd>
                  <AdminTd>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Btn size="sm" tone="ghost"><MoreVertical size={14} /></Btn>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => executeConfigMut.mutate(config.id)}><Play className="mr-2 h-4 w-4" /> Execute Now</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push(`/admin/backups/configs/${config.id}`)}><Server className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/admin/backups/configs/${config.id}/edit`)}><Server className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteConfigMut.mutate(config.id)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTBody>
          </AdminTable>
        )}
      </Card>
    </div>
  );

  const JobsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input label="" value={searchQuery} onChange={handleSearch} placeholder="Search jobs..." />
        <Btn onClick={() => setIsCreateJobOpen(true)}><Plus size={14} /> Create Job</Btn>
      </div>

      <Card>
        <CardHeader title="Backup Jobs" />
        {backupJobsQuery.isLoading ? (
          <AdminLoadingState label="Loading jobs..." />
        ) : backupJobsQuery.isError ? (
          <AdminErrorState message={backupJobsQuery.error.message} retry={() => void backupJobsQuery.refetch()} />
        ) : !Array.isArray(filteredJobs) || filteredJobs.length === 0 ? (
          <EmptyState icon={Database} message="No backup jobs found" />
        ) : (
          <AdminTable>
            <AdminTHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Progress</AdminTh>
              <AdminTh>Triggered By</AdminTh>
              <AdminTh>Created At</AdminTh>
              <AdminTh><span /></AdminTh>
            </AdminTHead>
            <AdminTBody>
              {filteredJobs.map(job => (
                <AdminTr key={job.id}>
                  <AdminTd className="font-medium">{job.name}</AdminTd>
                  <AdminTd>{renderBackupTypePill(job.jobType)}</AdminTd>
                  <AdminTd>{renderStatusPill(job.status)}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{renderProgress(job.progress)}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{job.triggeredBy}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{formatDate(job.createdAt)}</AdminTd>
                  <AdminTd>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Btn size="sm" tone="ghost"><MoreVertical size={14} /></Btn>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        {job.status === 'running' && (
                          <DropdownMenuItem onClick={() => cancelJobMut.mutate(job.id)}><XCircle className="mr-2 h-4 w-4" /> Cancel</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => router.push(`/admin/backups/jobs/${job.id}`)}><Server className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteJobMut.mutate(job.id)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTBody>
          </AdminTable>
        )}
      </Card>
    </div>
  );

  const ArtifactsTab = () => (
    <div className="space-y-4">
      <Input label="" value={searchQuery} onChange={handleSearch} placeholder="Search artifacts..." />

      <Card>
        <CardHeader title="Backup Artifacts" />
        {backupArtifactsQuery.isLoading ? (
          <AdminLoadingState label="Loading artifacts..." />
        ) : backupArtifactsQuery.isError ? (
          <AdminErrorState message={backupArtifactsQuery.error.message} retry={() => void backupArtifactsQuery.refetch()} />
        ) : !Array.isArray(filteredArtifacts) || filteredArtifacts.length === 0 ? (
          <EmptyState icon={Folder} message="No backup artifacts found" />
        ) : (
          <AdminTable>
            <AdminTHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Storage</AdminTh>
              <AdminTh>Size</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Verified</AdminTh>
              <AdminTh>Locked</AdminTh>
              <AdminTh><span /></AdminTh>
            </AdminTHead>
            <AdminTBody>
              {filteredArtifacts.map(artifact => (
                <AdminTr key={artifact.id}>
                  <AdminTd className="font-medium">{artifact.displayName || artifact.name}</AdminTd>
                  <AdminTd>{renderBackupTypePill(artifact.artifactType)}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{artifact.storageProvider}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{formatBytes(artifact.fileSize)}</AdminTd>
                  <AdminTd>{renderStatusPill(artifact.status)}</AdminTd>
                  <AdminTd className="text-xs">{artifact.isVerified ? <Pill tone="green">Yes</Pill> : <Pill>No</Pill>}</AdminTd>
                  <AdminTd className="text-xs">{artifact.isLocked ? <Pill tone="yellow">Yes</Pill> : <Pill>No</Pill>}</AdminTd>
                  <AdminTd>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Btn size="sm" tone="ghost"><MoreVertical size={14} /></Btn>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => downloadArtifactMut.mutate({ id: artifact.id, name: artifact.name })}><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuItem>
                        {artifact.isLocked ? (
                          <DropdownMenuItem onClick={() => unlockArtifactMut.mutate(artifact.id)}><Unlock className="mr-2 h-4 w-4" /> Unlock</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => lockArtifactMut.mutate(artifact.id)}><Lock className="mr-2 h-4 w-4" /> Lock</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => { setSelectedArtifact(artifact); setIsRestoreOpen(true); }}><RotateCcw className="mr-2 h-4 w-4" /> Restore</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteArtifactMut.mutate(artifact.id)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTBody>
          </AdminTable>
        )}
      </Card>
    </div>
  );

  const RestoresTab = () => (
    <div className="space-y-4">
      <Input label="" value={searchQuery} onChange={handleSearch} placeholder="Search restores..." />

      <Card>
        <CardHeader title="Restore Operations" />
        {backupRestoresQuery.isLoading ? (
          <AdminLoadingState label="Loading restores..." />
        ) : backupRestoresQuery.isError ? (
          <AdminErrorState message={backupRestoresQuery.error.message} retry={() => void backupRestoresQuery.refetch()} />
        ) : !Array.isArray(filteredRestores) || filteredRestores.length === 0 ? (
          <EmptyState icon={RotateCw} message="No restore operations found" />
        ) : (
          <AdminTable>
            <AdminTHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Progress</AdminTh>
              <AdminTh>Triggered By</AdminTh>
              <AdminTh>Created At</AdminTh>
              <AdminTh><span /></AdminTh>
            </AdminTHead>
            <AdminTBody>
              {filteredRestores.map(restore => (
                <AdminTr key={restore.id}>
                  <AdminTd className="font-medium">{restore.name}</AdminTd>
                  <AdminTd>{renderBackupTypePill(restore.restoreType)}</AdminTd>
                  <AdminTd>{renderStatusPill(restore.status)}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{renderProgress(restore.progress)}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{restore.triggeredBy}</AdminTd>
                  <AdminTd className="text-xs text-slate-400">{formatDate(restore.createdAt)}</AdminTd>
                  <AdminTd>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Btn size="sm" tone="ghost"><MoreVertical size={14} /></Btn>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => router.push(`/admin/backups/restores/${restore.id}`)}><Server className="mr-2 h-4 w-4" /> View Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => deleteRestoreMut.mutate(restore.id)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTBody>
          </AdminTable>
        )}
      </Card>
    </div>
  );

  const tabs: Array<{ id: string; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "policies", label: "Policies" },
    { id: "jobs", label: "Jobs" },
    { id: "artifacts", label: "Artifacts" },
    { id: "restores", label: "Restores" },
  ];

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Backup & Recovery"
        description="Manage backup configurations, jobs, artifacts, and restore operations"
        action={
          <Btn tone="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ALL_KEY })} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </Btn>
        }
      />

      <AdminTabs active={activeTab} onChange={setActiveTab} tabs={tabs} />

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "policies" && <ConfigurationsTab />}
      {activeTab === "jobs" && <JobsTab />}
      {activeTab === "artifacts" && <ArtifactsTab />}
      {activeTab === "restores" && <RestoresTab />}

      {isCreateConfigOpen && <CreateConfigModal onClose={() => setIsCreateConfigOpen(false)} storageProviders={storageProviders} />}
      {isCreateJobOpen && <CreateJobModal onClose={() => setIsCreateJobOpen(false)} />}
      {isRestoreOpen && <RestoreModal onClose={() => { setIsRestoreOpen(false); setSelectedArtifact(null); }} artifact={selectedArtifact} />}
    </AdminPageLayout>
  );
}
