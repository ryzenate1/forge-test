"use client";

import { useEffect, useState } from "react";
import { AdminCard, AdminPageLayout } from "@/components/admin/admin-layout";
import * as api from "@/lib/api/procedures";
import { sanitizeError } from "@/lib/sanitize";

export function ProceduresManager() {
  const [procedures, setProcedures] = useState<api.Procedure[]>([]);
  const [selected, setSelected] = useState<api.Procedure | null>(null);
  const [executions, setExecutions] = useState<api.ProcedureExecution[]>([]);
  const [selectedExec, setSelectedExec] = useState<api.ProcedureExecution | null>(null);
  const [logs, setLogs] = useState<Record<string, api.ProcedureStepLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<api.CreateProcedureRequest>({
    name: "",
    description: "",
    tenantId: null,
    enabled: true,
    steps: [
      { position: 0, name: "step-1", action: "run_command", config: { command: "echo hello" }, maxRetries: 3, timeoutSeconds: 300, requiresApproval: false, continueOnFailure: false, rollbackEnabled: false },
    ],
    schedule: null,
  });
  const [cron, setCron] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProcedures();
      setProcedures(list);
      if (list.length > 0 && !selected) {
        const first = list[0];
        if (first) setSelected(first);
      }
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Failed to load procedures"));
    } finally {
      setLoading(false);
    }
  }

  async function loadExecutions(procId: string) {
    try {
      const execs = await api.listExecutions(procId, 20);
      setExecutions(execs);
    } catch (e) {
      setError(sanitizeError(e instanceof Error ? e.message : "Failed to load executions"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) void loadExecutions(selected.id);
  }, [selected]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: api.CreateProcedureRequest = {
      ...form,
      schedule: cron.trim() ? { cronExpression: cron.trim(), timezone: "UTC", enabled: true } : null,
    };
    try {
      const created = await api.createProcedure(payload);
      setSuccess(`Created ${created.name}`);
      setForm({ ...form, name: "", description: "" });
      setCron("");
      await load();
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Create failed"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete procedure?")) return;
    try {
      await api.deleteProcedure(id);
      setSuccess("Deleted");
      setSelected(null);
      await load();
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Delete failed"));
    }
  }

  async function handleExecute() {
    if (!selected) return;
    try {
      const exec = await api.executeProcedure(selected.id);
      setSuccess(`Execution ${exec.id.slice(0, 8)} queued`);
      await loadExecutions(selected.id);
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Execute failed"));
    }
  }

  async function handleCancel(execId: string) {
    try {
      await api.cancelExecution(execId);
      setSuccess("Cancelled");
      if (selected) await loadExecutions(selected.id);
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Cancel failed"));
    }
  }

  async function handleApprove(stepExecId: string) {
    try {
      await api.approveStep(stepExecId);
      setSuccess("Approved");
      if (selectedExec) {
        const fresh = await api.getExecution(selectedExec.id);
        setSelectedExec(fresh);
      }
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Approve failed"));
    }
  }

  async function handleReject(stepExecId: string) {
    try {
      await api.rejectStep(stepExecId);
      setSuccess("Rejected");
      if (selectedExec) {
        const fresh = await api.getExecution(selectedExec.id);
        setSelectedExec(fresh);
      }
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Reject failed"));
    }
  }

  async function handleViewExec(execId: string) {
    try {
      const exec = await api.getExecution(execId);
      setSelectedExec(exec);
      // load logs for each step
      for (const step of exec.steps) {
        try {
          const stepLogs = await api.listStepLogs(step.id);
          setLogs((prev) => ({ ...prev, [step.id]: stepLogs }));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(sanitizeError(err instanceof Error ? err.message : "Load execution failed"));
    }
  }

  return (
    <AdminPageLayout
      title="Procedures"
      description="2384L procedure service: multi-step runbooks with approval gates, cron scheduling, retry/rollback, and audit logging. Routes under /procedures (+ /procedures/executions/*)."
      breadcrumbs={[{ label: "Admin", href: "/admin/procedures" }, { label: "Procedures" }]}
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

      <div className="grid gap-6 lg:grid-cols-3">
        <AdminCard title="Procedures" description={`${procedures.length} total`}>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : procedures.length === 0 ? (
            <p className="text-sm text-muted">No procedures. Create one with steps (run_command, sleep, run_procedure, etc.).</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-auto">
              {procedures.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`w-full text-left rounded-lg border p-3 ${selected?.id === p.id ? "border-red-400 bg-red-wash" : "border-line bg-surface hover:bg-paper"}`}
                >
                  <p className="text-sm font-bold text-ink">{p.name} {p.enabled ? "" : "(disabled)"}</p>
                  <p className="text-xs text-muted truncate">{p.description || "—"} · {p.steps?.length ?? 0} steps {p.schedule ? `· cron ${p.schedule.cronExpression}` : ""}</p>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => void load()} className="mt-3 rounded border border-line px-3 py-1.5 text-xs">Refresh</button>
        </AdminCard>

        <AdminCard title={selected ? `Detail: ${selected.name}` : "Detail"} description={selected ? `Enabled: ${String(selected.enabled)} · ${selected.schedule ? `Schedule ${selected.schedule.cronExpression} (${selected.schedule.timezone})` : "No schedule"}` : "Select a procedure"}>
          {!selected ? (
            <p className="text-sm text-muted">Select a procedure to inspect steps and schedule.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {selected.steps.map((s, idx) => (
                  <div key={s.id || idx} className="rounded-lg border border-line bg-surface p-3 text-xs">
                    <p className="font-bold text-ink">{idx + 1}. {s.name} <span className="font-normal text-muted">· {s.action}</span></p>
                    <p className="font-mono text-[11px] text-muted break-all">{JSON.stringify(s.config)}</p>
                    <p className="text-muted">retries {s.maxRetries} · timeout {s.timeoutSeconds}s {s.requiresApproval ? "· requires approval" : ""} {s.rollbackEnabled ? "· rollback" : ""} {s.continueOnFailure ? "· continue on failure" : ""}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => void handleExecute()} className="rounded bg-red px-4 py-2 text-xs font-bold text-white">Execute</button>
                <button onClick={() => void handleDelete(selected.id)} className="rounded border border-red-300 px-4 py-2 text-xs text-red-dark">Delete</button>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted">Executions (last 20)</p>
                {executions.length === 0 ? (
                  <p className="text-xs text-muted">No executions.</p>
                ) : (
                  <div className="mt-2 space-y-1 max-h-[260px] overflow-auto">
                    {executions.map((e) => (
                      <div key={e.id} className="flex items-center justify-between rounded border border-line bg-paper px-3 py-2 text-xs">
                        <div>
                          <p className="font-bold">{e.id.slice(0, 8)} · {e.status} <span className="font-normal text-muted">· {e.trigger}</span></p>
                          <p className="text-muted">{new Date(e.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => void handleViewExec(e.id)} className="rounded border border-line px-2 py-1">View</button>
                          <button onClick={() => void handleCancel(e.id)} className="rounded border border-line px-2 py-1">Cancel</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </AdminCard>

        <AdminCard title="Create Procedure" description="POST /procedures · name required, schedule cron validated (422) via robfig/cron.">
          <form onSubmit={handleCreate} className="space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" required />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full rounded border border-line bg-paper px-3 py-2 text-sm" />
            <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="Cron (e.g. 0 2 * * *) — leave empty for none" className="w-full rounded border border-line bg-paper px-3 py-2 font-mono text-sm" />
            <p className="text-xs text-muted">Cron is standard 5-field (minute hour dom month dow). Validated at admission (422).</p>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-muted">Steps JSON</p>
              <textarea
                value={JSON.stringify(form.steps, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value) as typeof form.steps;
                    setForm({ ...form, steps: parsed });
                  } catch {
                    // keep raw invalid for user to fix; don't update
                  }
                }}
                rows={10}
                className="w-full rounded border border-line bg-paper px-3 py-2 font-mono text-xs"
              />
              <p className="text-xs text-muted">Actions: run_command (allowlist), sleep, run_procedure, deploy_stack, send_webhook, run_build. Config for run_command: {`{command:"echo hi"}`}. Approval gates pause execution until POST /procedures/executions/steps/:stepId/approve.</p>
            </div>
            <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
            <button type="submit" className="rounded bg-red px-4 py-2 text-sm font-bold text-white">Create</button>
          </form>
        </AdminCard>
      </div>

      {selectedExec && (
        <AdminCard title={`Execution ${selectedExec.id.slice(0, 8)}`} description={`Status ${selectedExec.status} · trigger ${selectedExec.trigger} · created ${new Date(selectedExec.createdAt).toLocaleString()}`}>
          <div className="space-y-2">
            {selectedExec.steps.map((step) => (
              <div key={step.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">#{step.position + 1} {step.id.slice(0, 8)} · {step.status} <span className="text-xs font-normal text-muted">attempt {step.attempt}/{step.maxAttempts}</span></p>
                  <div className="flex gap-1">
                    <button onClick={() => void handleApprove(step.id)} disabled={step.status !== "waiting_approval"} className="rounded bg-green-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-40">Approve</button>
                    <button onClick={() => void handleReject(step.id)} disabled={step.status !== "waiting_approval"} className="rounded bg-red px-2 py-1 text-xs font-bold text-white disabled:opacity-40">Reject</button>
                  </div>
                </div>
                {step.output && <p className="mt-2 text-xs">Output: {step.output}</p>}
                {step.error && <p className="mt-1 text-xs text-red-dark">Error: {step.error}</p>}
                <div className="mt-2">
                  <p className="text-xs font-bold uppercase text-muted">Logs</p>
                  <div className="mt-1 max-h-32 overflow-auto rounded border border-line bg-paper p-2 font-mono text-[11px]">
                    {(logs[step.id] ?? []).length === 0 ? <span className="text-muted">No logs.</span> : (logs[step.id] ?? []).map((l) => <div key={l.id} className="flex gap-2"><span className="text-muted">{l.level}</span><span>{l.message}</span><span className="ml-auto text-muted">{new Date(l.createdAt).toLocaleTimeString()}</span></div>)}
                  </div>
                  <button onClick={async () => {
                    try {
                      const fetched = await api.listStepLogs(step.id);
                      setLogs((prev) => ({ ...prev, [step.id]: fetched }));
                    } catch (e) {
                      setError(sanitizeError(e instanceof Error ? e.message : "Load logs failed"));
                    }
                  }} className="mt-2 rounded border border-line px-2 py-1 text-xs">Reload logs</button>
                </div>
              </div>
            ))}
            <button onClick={() => setSelectedExec(null)} className="rounded border border-line px-3 py-1.5 text-xs">Close</button>
          </div>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
