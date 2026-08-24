import { getCSRFToken } from "@/lib/csrf";

export type ProcedureStep = {
  id: string;
  procedureId: string;
  position: number;
  name: string;
  action: string;
  config: Record<string, unknown>;
  maxRetries: number;
  timeoutSeconds: number;
  requiresApproval: boolean;
  continueOnFailure: boolean;
  rollbackEnabled: boolean;
  createdAt: string;
};

export type ProcedureSchedule = {
  id: string;
  procedureId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Procedure = {
  id: string;
  name: string;
  description: string;
  tenantId?: string | null;
  enabled: boolean;
  steps: ProcedureStep[];
  schedule?: ProcedureSchedule | null;
  createdAt: string;
  updatedAt: string;
};

export type ProcedureStepExecution = {
  id: string;
  executionId: string;
  stepId: string;
  position: number;
  status: string;
  attempt: number;
  maxAttempts: number;
  output: string;
  error?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  operationId?: string | null;
};

export type ProcedureExecution = {
  id: string;
  procedureId: string;
  status: string;
  trigger: string;
  tenantId?: string | null;
  actorId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  steps: ProcedureStepExecution[];
};

export type ProcedureStepLog = {
  id: string;
  stepExecutionId: string;
  level: string;
  message: string;
  createdAt: string;
};

export type CreateProcedureRequest = {
  name: string;
  description: string;
  tenantId?: string | null;
  enabled: boolean;
  steps: {
    position: number;
    name: string;
    action: string;
    config: Record<string, unknown>;
    maxRetries: number;
    timeoutSeconds: number;
    requiresApproval: boolean;
    continueOnFailure: boolean;
    rollbackEnabled: boolean;
  }[];
  schedule?: { cronExpression: string; timezone: string; enabled: boolean } | null;
};

function unwrap<T>(data: unknown): T {
  if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  return unwrap<T>(json);
}

export async function listProcedures(tenantId?: string): Promise<Procedure[]> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return api<Procedure[]>(`/api/proxy/procedures/${qs}`);
}

export async function getProcedure(id: string): Promise<Procedure> {
  return api<Procedure>(`/api/proxy/procedures/${encodeURIComponent(id)}`);
}

export async function createProcedure(payload: CreateProcedureRequest): Promise<Procedure> {
  return api<Procedure>("/api/proxy/procedures/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function updateProcedure(id: string, payload: CreateProcedureRequest): Promise<Procedure> {
  return api<Procedure>(`/api/proxy/procedures/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify(payload),
  });
}

export async function deleteProcedure(id: string): Promise<void> {
  await api<void>(`/api/proxy/procedures/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function executeProcedure(id: string): Promise<ProcedureExecution> {
  return api<ProcedureExecution>(`/api/proxy/procedures/${encodeURIComponent(id)}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRFToken() },
    body: JSON.stringify({}),
  });
}

export async function getExecution(id: string): Promise<ProcedureExecution> {
  return api<ProcedureExecution>(`/api/proxy/procedures/executions/${encodeURIComponent(id)}`);
}

export async function listExecutions(procedureId: string, limit = 20): Promise<ProcedureExecution[]> {
  return api<ProcedureExecution[]>(`/api/proxy/procedures/${encodeURIComponent(procedureId)}/executions?limit=${limit}`);
}

export async function cancelExecution(id: string): Promise<void> {
  await api<void>(`/api/proxy/procedures/executions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function approveStep(stepId: string): Promise<void> {
  await api<void>(`/api/proxy/procedures/executions/steps/${encodeURIComponent(stepId)}/approve`, {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function rejectStep(stepId: string): Promise<void> {
  await api<void>(`/api/proxy/procedures/executions/steps/${encodeURIComponent(stepId)}/reject`, {
    method: "POST",
    headers: { "X-CSRF-Token": getCSRFToken() },
  });
}

export async function listStepLogs(stepId: string): Promise<ProcedureStepLog[]> {
  return api<ProcedureStepLog[]>(`/api/proxy/procedures/executions/steps/${encodeURIComponent(stepId)}/logs`);
}
