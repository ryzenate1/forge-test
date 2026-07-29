"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronUp, Clock, Pencil, Play, Plus, Terminal, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiSchedule, type ApiScheduleTask, type ApiServer,
  createServerSchedule, createServerScheduleTask, deleteServerSchedule, deleteServerScheduleTask,
  fetchServerScheduleRuns, fetchServerSchedules, runServerSchedule, updateServerSchedule, updateServerScheduleTask,
} from "@/lib/api";
import { hasServerPermission, useOptionalServerContext } from "./server-context";
import { errorMessage as message, cn } from "@/lib/utils";

const inputBase = "h-10 w-full rounded-lg border border-white/10 bg-[#0f141f] text-sm text-slate-100 shadow-inner shadow-black/10 outline-none transition hover:border-white/20 focus:border-red-400/70 focus:ring-2 focus:ring-red-500/15";
const iconClasses = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500";

type ScheduleDraft = Pick<ApiSchedule, "name" | "cronMinute" | "cronHour" | "cronDayOfMonth" | "cronMonth" | "cronDayOfWeek" | "onlyWhenOnline" | "enabled">;
type TaskDraft = { action: "command" | "power" | "backup"; value: string; sequence: number; timeOffsetSeconds: number; continueOnFailure: boolean };
const defaultSchedule: ScheduleDraft = { name: "", cronMinute: "0", cronHour: "*/6", cronDayOfMonth: "*", cronMonth: "*", cronDayOfWeek: "*", onlyWhenOnline: false, enabled: true };
const defaultTask: TaskDraft = { action: "command", value: "", sequence: 1, timeOffsetSeconds: 0, continueOnFailure: false };

function scheduleDraft(schedule: ApiSchedule): ScheduleDraft {
  return { name: schedule.name, cronMinute: schedule.cronMinute, cronHour: schedule.cronHour, cronDayOfMonth: schedule.cronDayOfMonth, cronMonth: schedule.cronMonth, cronDayOfWeek: schedule.cronDayOfWeek, onlyWhenOnline: schedule.onlyWhenOnline, enabled: schedule.enabled };
}
function taskDraft(task: ApiScheduleTask): TaskDraft {
  return { action: task.action as TaskDraft["action"], value: String(task.payload.command ?? task.payload.signal ?? ""), sequence: task.sequence ?? 0, timeOffsetSeconds: task.timeOffsetSeconds ?? 0, continueOnFailure: task.continueOnFailure ?? false };
}
function taskPayload(draft: TaskDraft) {
  if (draft.action === "command") return { command: draft.value.trim() };
  if (draft.action === "power") return { signal: draft.value };
  return draft.value.trim() ? { ignoredFiles: draft.value.trim() } : {};
}
function validateSchedule(draft: ScheduleDraft) {
  if (!draft.name.trim()) return "Schedule name is required.";
  if ([draft.cronMinute, draft.cronHour, draft.cronDayOfMonth, draft.cronMonth, draft.cronDayOfWeek].some((v) => !v.trim())) return "Every cron field is required.";
  return "";
}
function validateTask(draft: TaskDraft) {
  if (!Number.isInteger(draft.sequence) || draft.sequence < 0) return "Sequence must be a non-negative integer.";
  if (!Number.isInteger(draft.timeOffsetSeconds) || draft.timeOffsetSeconds < 0 || draft.timeOffsetSeconds > 900) return "Offset must be between 0 and 900 seconds.";
  if (draft.action === "command" && !draft.value.trim()) return "Command is required.";
  if (draft.action === "power" && !["start", "stop", "restart", "kill"].includes(draft.value)) return "Choose a power action.";
  return "";
}

function Runs({ serverId, scheduleId }: { serverId: string; scheduleId: string }) {
  const query = useQuery({ queryKey: ["server-schedule-runs", serverId, scheduleId], queryFn: () => fetchServerScheduleRuns(serverId, scheduleId), refetchInterval: 10_000 });
  if (query.isLoading) return <p className="text-xs text-slate-400">Loading run history&hellip;</p>;
  if (query.isError) return <p className="text-xs text-red-300">{message(query.error, "Run history unavailable.")}</p>;
  if (!query.data?.length) return <p className="text-xs text-slate-400">No execution history yet.</p>;
  return <div className="space-y-2">{[...query.data].slice(0, 10).map((run) => <div className="rounded-lg border border-white/[0.06] bg-[#0f141f] p-3 text-xs" key={run.id}><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold uppercase text-slate-100">{run.status}</span><span className="text-slate-400">{new Date(run.startedAt ?? "").toLocaleString()} &middot; {run.trigger}</span></div>{run.error ? <p className="mt-1 text-red-300">{run.error}</p> : null}{run.tasks?.length ? <ul className="mt-2 space-y-1 text-slate-400">{(run.tasks ?? []).map((task: any) => <li key={task.id}>{task.status} &middot; {new Date(task.executedAt).toLocaleTimeString()}{task.error ? ` &middot; ${task.error}` : ""}</li>)}</ul> : null}</div>)}</div>;
}

function TaskEditor({ initial, pending, onCancel, onSave }: { initial: TaskDraft; pending: boolean; onCancel: () => void; onSave: (draft: TaskDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  const error = validateTask(draft);
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Action
      <select className={cn(inputBase, "mt-1.5 px-3")} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value as TaskDraft["action"], value: event.target.value === "power" ? "start" : "" })}>
        <option value="command">Command</option><option value="power">Power</option><option value="backup">Backup</option>
      </select>
    </label>
    {draft.action !== "backup" ? (
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {draft.action === "command" ? "Command" : "Signal"}
        {draft.action === "command" ? (
          <div className="relative mt-1.5">
            <Terminal size={14} className={iconClasses} strokeWidth={1.5} />
            <input className={cn(inputBase, "pl-9")} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="/usr/bin/backup" />
          </div>
        ) : (
          <select className={cn(inputBase, "mt-1.5 px-3")} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })}>
            <option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option><option value="kill">Kill</option>
          </select>
        )}
      </label>
    ) : (
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Ignored files
        <input className={cn(inputBase, "mt-1.5 px-3")} placeholder="One pattern per line" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} />
        <p className="mt-1 text-[11px] text-slate-500">Optional. One pattern per line.</p>
      </label>
    )}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Sequence
        <input className={cn(inputBase, "mt-1.5 px-3")} min={0} type="number" value={draft.sequence} onChange={(event) => setDraft({ ...draft, sequence: Number(event.target.value) })} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Offset <span className="font-normal normal-case text-slate-500">(seconds)</span>
        <input className={cn(inputBase, "mt-1.5 px-3")} min={0} max={900} type="number" value={draft.timeOffsetSeconds} onChange={(event) => setDraft({ ...draft, timeOffsetSeconds: Number(event.target.value) })} />
      </label>
    </div>
    <label className="flex items-center gap-2 text-sm text-slate-300"><input checked={draft.continueOnFailure} onChange={(event) => setDraft({ ...draft, continueOnFailure: event.target.checked })} type="checkbox" className="accent-red-600" /> Continue on failure</label>
    {error ? <p className="text-xs text-red-300">{error}</p> : null}
    <div className="flex justify-end gap-2">
      <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]" onClick={onCancel} type="button">Cancel</button>
      <button className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50" disabled={Boolean(error) || pending} onClick={() => onSave(draft)} type="button">{pending ? "Saving&hellip;" : "Save Task"}</button>
    </div>
  </div>;
}

function CronFields({ draft, setDraft }: { draft: ScheduleDraft; setDraft: (v: ScheduleDraft) => void }) {
  const fields = [
    { key: "cronMinute" as const, label: "Minute" },
    { key: "cronHour" as const, label: "Hour" },
    { key: "cronDayOfMonth" as const, label: "Day" },
    { key: "cronMonth" as const, label: "Month" },
    { key: "cronDayOfWeek" as const, label: "Weekday" },
  ];
  return <div className="grid gap-3 sm:grid-cols-5">
    {fields.map(({ key, label }) => (
      <div key={key}>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
        <input className={cn(inputBase, "mt-1.5 px-3 font-mono text-xs")} value={String(draft[key])} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={key === "cronMinute" ? "0" : key === "cronHour" ? "*/6" : "*"} />
      </div>
    ))}
  </div>;
}

export function SchedulesView({ server }: { server?: ApiServer }) {
  const serverId = server?.id ?? "";
  const context = useOptionalServerContext();
  const access = context?.access ?? { user: null, permissions: [], isAdmin: true, isOwner: true };
  const canCreate = hasServerPermission(access, "schedule.create");
  const canUpdate = hasServerPermission(access, "schedule.update");
  const canDelete = hasServerPermission(access, "schedule.delete");
  const qc = useQueryClient();
  const [createDraft, setCreateDraft] = useState(defaultSchedule);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(defaultSchedule);
  const [taskTarget, setTaskTarget] = useState<{ scheduleId: string; taskId?: string } | null>(null);
  const [taskInitial, setTaskInitial] = useState(defaultTask);
  const [history, setHistory] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deleteScheduleConfirm, setDeleteScheduleConfirm] = useState<string | null>(null);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ scheduleId: string; taskId: string; seq: number } | null>(null);
  const query = useQuery({ queryKey: ["server-schedules", serverId], queryFn: () => fetchServerSchedules(serverId), enabled: Boolean(serverId) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["server-schedules", serverId] });
  const createMut = useMutation({ mutationFn: (draft: ScheduleDraft) => createServerSchedule(serverId, draft), onSuccess: () => { setCreateDraft(defaultSchedule); setStatus("Schedule created."); refresh(); }, onError: (error) => setStatus(message(error, "Create failed.")) });
  const updateMut = useMutation({ mutationFn: ({ id, draft }: { id: string; draft: Partial<ScheduleDraft> }) => updateServerSchedule(serverId, id, draft), onSuccess: () => { setEditingSchedule(null); setStatus("Schedule updated."); refresh(); }, onError: (error) => setStatus(message(error, "Update failed.")) });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteServerSchedule(serverId, id), onSuccess: () => { setDeleteScheduleConfirm(null); refresh(); }, onError: (error) => { setDeleteScheduleConfirm(null); setStatus(message(error, "Delete failed.")); } });
  const runMut = useMutation({ mutationFn: (id: string) => runServerSchedule(serverId, id), onSuccess: (_, id) => { setHistory(id); setStatus("Schedule run queued."); void qc.invalidateQueries({ queryKey: ["server-schedule-runs", serverId, id] }); }, onError: (error) => setStatus(message(error, "Run failed.")) });
  const taskMut = useMutation({ mutationFn: ({ target, draft }: { target: { scheduleId: string; taskId?: string }; draft: TaskDraft }) => { if (draft.action === "backup" && server?.backupLimit === 0) throw new Error("Backup tasks are unavailable because this server has no backup slots."); return target.taskId ? updateServerScheduleTask(serverId, target.scheduleId, target.taskId, { ...draft, payload: taskPayload(draft), value: undefined }) : createServerScheduleTask(serverId, target.scheduleId, { ...draft, payload: taskPayload(draft) }); }, onSuccess: () => { setTaskTarget(null); setStatus("Task saved."); refresh(); }, onError: (error) => setStatus(message(error, "Task update failed.")) });
  const removeTaskMut = useMutation({ mutationFn: ({ scheduleId, taskId }: { scheduleId: string; taskId: string }) => deleteServerScheduleTask(serverId, scheduleId, taskId), onSuccess: () => { setDeleteTaskConfirm(null); refresh(); }, onError: (error) => { setDeleteTaskConfirm(null); setStatus(message(error, "Task delete failed.")); } });
  const reorderMut = useMutation({ mutationFn: async ({ scheduleId, tasks, index, direction }: { scheduleId: string; tasks: ApiScheduleTask[]; index: number; direction: -1 | 1 }) => { const ordered = [...tasks].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)); const other = ordered[index + direction]; const current = ordered[index]; if (!current || !other) return; await updateServerScheduleTask(serverId, scheduleId, current.id, { sequence: other.sequence }); await updateServerScheduleTask(serverId, scheduleId, other.id, { sequence: current.sequence }); }, onSuccess: refresh, onError: (error) => setStatus(message(error, "Task reorder failed.")) });
  const schedules = query.data ?? [];

  return <div className="space-y-6">
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-5 flex items-center gap-2"><Archive className="text-slate-400" size={17} strokeWidth={1.5} /><h2 className="text-sm font-semibold text-slate-200">Create Schedule</h2></div>
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Schedule Name</label>
          <div className="relative mt-1.5">
            <Clock size={14} className={iconClasses} strokeWidth={1.5} />
            <input className={cn(inputBase, "pl-9")} value={createDraft.name} onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })} placeholder="Backup every 6 hours" />
          </div>
        </div>
        <div>
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-slate-400">Cron Expression</label>
          <CronFields draft={createDraft} setDraft={setCreateDraft} />
          <p className="mt-2 text-[11px] text-slate-500">Schedule: <span className="font-mono text-slate-400">{createDraft.cronMinute} {createDraft.cronHour} {createDraft.cronDayOfMonth} {createDraft.cronMonth} {createDraft.cronDayOfWeek}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input checked={createDraft.onlyWhenOnline} onChange={(e) => setCreateDraft({ ...createDraft, onlyWhenOnline: e.target.checked })} type="checkbox" className="accent-red-600" /> Only when online</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input checked={createDraft.enabled} onChange={(e) => setCreateDraft({ ...createDraft, enabled: e.target.checked })} type="checkbox" className="accent-red-600" /> Enabled</label>
        </div>
        <div className="flex justify-end">
          <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50" disabled={!canCreate || !serverId || Boolean(validateSchedule(createDraft)) || createMut.isPending} onClick={() => createMut.mutate(createDraft)} type="button">{createMut.isPending ? "Creating&hellip;" : "Create Schedule"}</button>
        </div>
      </div>
    </div>

    {status ? <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-slate-200" role="status">{status}</div> : null}

    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-5 flex items-center gap-2"><Archive className="text-slate-400" size={17} strokeWidth={1.5} /><h2 className="text-sm font-semibold text-slate-200">Schedules</h2></div>
      {query.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading schedules&hellip;</p> : null}
      {query.isError ? <p className="text-sm text-red-300">{message(query.error, "Schedules unavailable.")}</p> : null}
      {!query.isLoading && !query.isError && !schedules.length ? <p className="py-6 text-center text-sm text-slate-500">No schedules configured.</p> : null}
      <div className="space-y-4">
        {schedules.map((schedule) => (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4" key={schedule.id}>
            {editingSchedule === schedule.id ? (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Schedule Name</label>
                  <div className="relative mt-1.5">
                    <Clock size={14} className={iconClasses} strokeWidth={1.5} />
                    <input className={cn(inputBase, "pl-9")} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-slate-400">Cron Expression</label>
                  <CronFields draft={editDraft} setDraft={setEditDraft} />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300"><input checked={editDraft.onlyWhenOnline} onChange={(e) => setEditDraft({ ...editDraft, onlyWhenOnline: e.target.checked })} type="checkbox" className="accent-red-600" /> Only when online</label>
                  <label className="flex items-center gap-2 text-sm text-slate-300"><input checked={editDraft.enabled} onChange={(e) => setEditDraft({ ...editDraft, enabled: e.target.checked })} type="checkbox" className="accent-red-600" /> Enabled</label>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]" onClick={() => setEditingSchedule(null)} type="button">Cancel</button>
                  <button className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50" disabled={!canUpdate || Boolean(validateSchedule(editDraft)) || updateMut.isPending} onClick={() => updateMut.mutate({ id: schedule.id, draft: editDraft })} type="button">{updateMut.isPending ? "Saving&hellip;" : "Save Schedule"}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-100">{schedule.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{schedule.cronMinute} {schedule.cronHour} {schedule.cronDayOfMonth} {schedule.cronMonth} {schedule.cronDayOfWeek}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {schedule.enabled ? <span className="text-emerald-300">Enabled</span> : "Disabled"}
                      &nbsp;&middot;&nbsp;{schedule.onlyWhenOnline ? "Online only" : "Any power state"}
                      &nbsp;&middot;&nbsp;Next: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "not scheduled"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button aria-label={`Edit ${schedule.name}`} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/[0.04] hover:text-slate-100 disabled:opacity-40" disabled={!canUpdate} onClick={() => { setEditingSchedule(schedule.id); setEditDraft(scheduleDraft(schedule)); }} type="button"><Pencil size={14} /></button>
                    <button className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04] disabled:opacity-40" disabled={!canUpdate || runMut.isPending} onClick={() => runMut.mutate(schedule.id)} type="button"><Play size={13} /> Run</button>
                    <button className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04] disabled:opacity-40" disabled={!canUpdate} onClick={() => { setTaskTarget({ scheduleId: schedule.id }); setTaskInitial({ ...defaultTask, sequence: (schedule.tasks ?? []).length + 1 }); }} type="button"><Plus size={13} /> Task</button>
                    <button aria-label={`Delete ${schedule.name}`} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-40" disabled={!canDelete || deleteMut.isPending} onClick={() => setDeleteScheduleConfirm(schedule.id)} type="button"><Trash2 size={14} /></button>
                  </div>
                </div>
                {(schedule.tasks ?? []).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {[...(schedule.tasks ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((task, index, ordered) => (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.04] bg-[#0f141f] p-3" key={task.id}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-100">
                            <span className="text-slate-500">#{task.sequence}</span> {task.action}
                            {task.payload.command ? <span className="text-slate-400">: <span className="font-mono text-xs">{String(task.payload.command)}</span></span> : null}
                            {task.payload.signal ? <span className="text-slate-400">: {String(task.payload.signal)}</span> : null}
                          </p>
                          <p className="text-xs text-slate-500">Offset {task.timeOffsetSeconds}s &middot; Continue on failure: {task.continueOnFailure ? "yes" : "no"}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <button aria-label="Move up" className="rounded border border-white/10 p-1.5 text-slate-500 hover:text-slate-100 disabled:opacity-40" disabled={!canUpdate || index === 0 || reorderMut.isPending} onClick={() => reorderMut.mutate({ scheduleId: schedule.id, tasks: ordered, index, direction: -1 })} type="button"><ChevronUp size={13} /></button>
                          <button aria-label="Move down" className="rounded border border-white/10 p-1.5 text-slate-500 hover:text-slate-100 disabled:opacity-40" disabled={!canUpdate || index === ordered.length - 1 || reorderMut.isPending} onClick={() => reorderMut.mutate({ scheduleId: schedule.id, tasks: ordered, index, direction: 1 })} type="button"><ChevronDown size={13} /></button>
                          <button aria-label="Edit task" className="rounded border border-white/10 p-1.5 text-slate-500 hover:text-slate-100 disabled:opacity-40" disabled={!canUpdate} onClick={() => { setTaskTarget({ scheduleId: schedule.id, taskId: task.id }); setTaskInitial(taskDraft(task)); }} type="button"><Pencil size={13} /></button>
                          <button aria-label="Delete task" className="rounded border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10 disabled:opacity-40" disabled={!canUpdate || removeTaskMut.isPending} onClick={() => setDeleteTaskConfirm({ scheduleId: schedule.id, taskId: task.id, seq: task.sequence ?? 0 })} type="button"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {taskTarget?.scheduleId === schedule.id && (
                  <div className="mt-4"><TaskEditor initial={taskInitial} pending={taskMut.isPending} onCancel={() => setTaskTarget(null)} onSave={(draft) => taskMut.mutate({ target: taskTarget, draft })} /></div>
                )}
                {history === schedule.id && (
                  <div className="mt-4 border-t border-white/[0.06] pt-4"><Runs serverId={serverId} scheduleId={schedule.id} /></div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>

    {deleteScheduleConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteScheduleConfirm(null); }}>
        <div className="w-full max-w-md rounded-xl border border-white/[0.06] bg-surface-card p-5 shadow-xl" role="dialog" aria-modal="true">
          <h3 className="text-base font-semibold text-slate-100">Delete schedule?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">This action cannot be undone. Tasks in this schedule will stop running.</p>
          <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]" onClick={() => setDeleteScheduleConfirm(null)} type="button">Cancel</button>
            <button className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteScheduleConfirm)} type="button">{deleteMut.isPending ? "Deleting&hellip;" : "Delete Schedule"}</button>
          </div>
        </div>
      </div>
    )}

    {deleteTaskConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTaskConfirm(null); }}>
        <div className="w-full max-w-md rounded-xl border border-white/[0.06] bg-surface-card p-5 shadow-xl" role="dialog" aria-modal="true">
          <h3 className="text-base font-semibold text-slate-100">Delete task #{deleteTaskConfirm.seq}?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">Remove this task from the schedule.</p>
          <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]" onClick={() => setDeleteTaskConfirm(null)} type="button">Cancel</button>
            <button className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50" disabled={removeTaskMut.isPending} onClick={() => removeTaskMut.mutate({ scheduleId: deleteTaskConfirm.scheduleId, taskId: deleteTaskConfirm.taskId })} type="button">{removeTaskMut.isPending ? "Deleting&hellip;" : "Delete Task"}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
