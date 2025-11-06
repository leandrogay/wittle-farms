import React, { useEffect, useState } from "react";
import SubtaskForm from "./SubtaskForm.jsx";
import dayjs from "dayjs";
import TaskFormButton from "./TaskFormButton";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { TaskComments } from "./TaskComments";
import { updateTask, createTask, getSubtasks } from "../../services/api.js";

const BTN_PRIMARY_CLS =
  "px-5 py-2 bg-brand-primary/90 text-white rounded-lg shadow hover:bg-brand-primary transition-colors font-medium";
const PRIORITY = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
const PRIORITY_STYLES = {
  [PRIORITY.LOW]:
    "bg-priority-low-bg dark:bg-priority-low-bg-dark text-priority-low-text dark:text-priority-low-text-dark ring-1 ring-priority-low-border dark:ring-priority-low-border-dark",
  [PRIORITY.MEDIUM]:
    "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark ring-1 ring-priority-medium-border dark:ring-priority-medium-border-dark",
  [PRIORITY.HIGH]:
    "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark",
};

const MINUTES = { MINUTE: 1, HOUR: 60, DAY: 1440 };
const DEFAULT_TRIPLET = [10080, 4320, 1440]; // 7d, 3d, 1d

const DEADLINE_DT_FORMAT = "dddd, MMMM D, YYYY h:mm A";
const REMINDER_FORMAT = "ddd, MMM D, YYYY h:mm A";

const _getPriorityBucket = (p) => {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n)) return null;
  if (n <= 3) return PRIORITY.LOW;
  if (n <= 7) return PRIORITY.MEDIUM;
  return PRIORITY.HIGH;
};

const _labelFromMinutes = (m) => {
  if (m % MINUTES.DAY === 0) return `${m / MINUTES.DAY} day(s) before`;
  if (m % MINUTES.HOUR === 0) return `${m / MINUTES.HOUR} hour(s) before`;
  return `${m} minute(s) before`;
};

const Badge = ({ children, className = "" }) => (
  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${className}`}>{children}</span>
);

const FieldRow = ({ label, children }) => (
  <p className="mt-1 leading-relaxed">
    <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">{label}: </span>
    <span className="text-light-text-primary dark:text-dark-text-primary">{children}</span>
  </p>
);

const STATUS_OPTIONS = ["To Do", "In Progress", "Done"];

/* ------------------------------
   NEW: Small helpers for files
--------------------------------*/
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    bytes /= k;
    i++;
  } while (bytes >= k && i < units.length - 1);
  return `${bytes.toFixed(bytes >= 100 ? 0 : bytes >= 10 ? 1 : 2)} ${units[i]}`;
}
function buildAttachmentUrl(taskId, attachmentId) {
  // Matches your Express route: GET /api/tasks/:taskId/attachments/:attachmentId
  return `/api/tasks/${taskId}/attachments/${attachmentId}`;
}
function canPreview(mimetype) {
  if (!mimetype) return false;
  return mimetype.startsWith("image/") || mimetype === "application/pdf";
}

const TaskCard = ({ task, onTaskUpdated, onTaskDeleted, currentUser }) => {
  const priorityValue = Number(task?.priority);
  const priorityBucket = _getPriorityBucket(priorityValue);
  const pClass = priorityBucket
    ? PRIORITY_STYLES[priorityBucket]
    : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border";

  const now = dayjs();
  const deadline = task?.deadline ? dayjs(task.deadline) : null;
  const isOverdue = Boolean(deadline && now.isAfter(deadline, "day"));
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;
  const deadlineText = deadline ? deadline.format(DEADLINE_DT_FORMAT) : null;

  // Normalize reminder offsets from API
  const rawOffsets = Array.isArray(task?.reminderOffsets)
    ? task.reminderOffsets
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => b - a)
    : [];

  // If there IS a deadline and no custom reminders, show defaults (7/3/1)
  const effectiveOffsets = deadline ? (rawOffsets.length ? rawOffsets : DEFAULT_TRIPLET) : rawOffsets;

  const computedReminders =
    deadline && effectiveOffsets.length > 0
      ? effectiveOffsets.map((m) => ({ minutes: m, label: _labelFromMinutes(m), when: deadline.subtract(m, "minute") }))
      : [];

  const [showComments, setShowComments] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [localStatus, setLocalStatus] = useState(task?.status ?? "To Do");

  const isRoot = !task?.parentTask;
  const [subtasks, setSubtasks] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [pendingSub, setPendingSub] = useState(new Set());
  const [previewAttachment, setPreviewAttachment] = useState(null);

  useEffect(() => {
    if (!isRoot || !task?._id) return;
    (async () => {
      setSubsLoading(true);
      try {
        const data = await getSubtasks(task._id);
        setSubtasks(Array.isArray(data) ? data : []);
      } finally {
        setSubsLoading(false);
      }
    })();
  }, [isRoot, task?._id]);

  async function handleStatusChange(e) {
    const next = e.target.value;
    if (next === localStatus) return;
    setLocalStatus(next);
    setSavingStatus(true);
    try {
      const updated = await updateTask(task._id, { status: next });
      onTaskUpdated?.(updated);
    } catch (err) {
      setLocalStatus(task?.status ?? "To Do");
    } finally {
      setSavingStatus(false);
    }
  }

  async function addSubtask() {
    const title = newSubTitle.trim();
    if (!title) return;
    setCreatingSub(true);
    try {
      const created = await createTask({
        title,
        parentTask: task._id,
        assignedProject: task?.assignedProject?._id || task?.assignedProject || undefined,
        createdBy: currentUser?._id || task?.createdBy?._id || task?.createdBy,
        assignedTeamMembers: (task?.assignedTeamMembers || []).map((u) => u?._id || u).filter(Boolean),
        status: "To Do",
        priority: task?.priority ?? 5,
      });
      setSubtasks((prev) => [...prev, created]);
      setNewSubTitle("");
    } finally {
      setCreatingSub(false);
    }
  }

  async function setSubStatus(sub, next) {
    if (!sub?._id) return;
    if (pendingSub.has(sub._id)) return;
    const prevStatus = sub.status;
    setSubtasks((prev) => prev.map((s) => (s._id === sub._id ? { ...s, status: next } : s)));
    setPendingSub((old) => new Set(old).add(sub._id));
    try {
      const updated = await updateTask(sub._id, { status: next });
      setSubtasks((prev) => prev.map((s) => (s._id === sub._id ? updated : s)));
    } catch (e) {
      setSubtasks((prev) => prev.map((s) => (s._id === sub._id ? { ...s, status: prevStatus } : s)));
    } finally {
      setPendingSub((old) => {
        const n = new Set(old);
        n.delete(sub._id);
        return n;
      });
    }
  }

  return (
    <article className={`rounded-2xl border p-6 shadow-sm bg-light-bg dark:bg-dark-bg ${isOverdue ? "border-danger ring-2 ring-danger/20" : "border-light-border dark:border-dark-border"}`}>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-light-text-muted dark:text-dark-text-muted">
            Project: {task?.assignedProject?.name ?? "—"}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-light-text-primary dark:text-dark-text-primary">
            Title: {task?.title ?? "Untitled"}
          </h2>
        </div>

        {/* Status dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary">Status</span>
          <select
            value={localStatus}
            onChange={handleStatusChange}
            disabled={savingStatus}
            aria-label="Change task status"
            className={`text-sm px-2 py-1 rounded-md border ring-1 ring-light-border dark:ring-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary
                   ${savingStatus ? "opacity-60 cursor-not-allowed" : "hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary"}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <FieldRow label="Description">{task?.description ?? "—"}</FieldRow>
      <FieldRow label="Notes">{task?.notes ?? "—"}</FieldRow>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge className={pClass}>
          {Number.isFinite(priorityValue) ? (
            <>
              <span className="text-sm font-bold">{priorityValue}</span>
              <span className="text-sm font-medium"> · {priorityBucket}</span>
            </>
          ) : (
            <span className="text-sm font-medium">No priority</span>
          )}
        </Badge>

        {deadlineText ? (
          <Badge className={`${isOverdue ? PRIORITY_STYLES[PRIORITY.HIGH] : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border"}`}>
            <span className="font-semibold">Deadline:</span> <span className="font-medium">{deadlineText}</span>
            {isOverdue ? (
              <span className="ml-2 text-sm font-bold text-danger">{daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue</span>
            ) : null}
          </Badge>
        ) : null}
      </div>

      {/* Reminders */}
      <div className="mt-4 rounded-xl bg-light-surface dark:bg-dark-surface ring-1 ring-light-border dark:ring-dark-border">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">Reminders</div>
        <div className="px-4 pb-3">
          {!deadline ? (
            rawOffsets.length > 0 ? (
              <ul className="space-y-1 text-light-text-primary dark:text-dark-text-primary">
                {rawOffsets.map((m, i) => (
                  <li key={`${m}-${i}`} className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-light-border dark:ring-dark-border bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary">
                      {_labelFromMinutes(m)}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted">(inactive until a deadline is set)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-light-text-muted dark:text-dark-text-muted">— (No deadline)</p>
            )
          ) : computedReminders.length > 0 ? (
            <ul className="space-y-1 text-light-text-primary dark:text-dark-text-primary">
              {computedReminders.map(({ minutes, label, when }) => (
                <li key={minutes} className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-light-border dark:ring-dark-border bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary">
                    {label}
                  </span>
                  <span className="text-sm">→ {when.format(REMINDER_FORMAT)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-light-text-muted dark:text-dark-text-muted">— (No reminders)</p>
          )}
        </div>
      </div>

      {/* Team members */}
      <div className="mt-5 rounded-xl bg-brand-primary/5 dark:bg-brand-secondary/5 ring-1 ring-brand-primary/10 dark:ring-brand-secondary/10">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">Team Members</div>
        <ul className="px-4 pb-3 text-light-text-primary dark:text-dark-text-primary">
          {(task?.assignedTeamMembers ?? []).length > 0 ? (
            (task.assignedTeamMembers ?? []).map((tm) => <li key={tm?._id} className="py-1">{tm?.name ?? "Unknown"}</li>)
          ) : (
            <li className="py-1 text-light-text-muted dark:text-dark-text-muted">—</li>
          )}
        </ul>
      </div>

      {/* ----------------------------------------
          NEW: Attachments section
      ----------------------------------------- */}
      <div className="mt-5 rounded-xl bg-light-surface dark:bg-dark-surface ring-1 ring-light-border dark:ring-dark-border">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">Attachments</div>
        <div className="px-4 pb-3">
          {Array.isArray(task?.attachments) && task.attachments.length > 0 ? (
            <ul className="divide-y divide-light-border/60 dark:divide-dark-border/60">
              {task.attachments.map((att) => {
                const url = buildAttachmentUrl(task?._id, att?._id);
                const showPreview = canPreview(att?.mimetype);
                return (
                  <li key={att?._id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-light-text-primary dark:text-dark-text-primary">
                        {att?.filename || "Unnamed file"}
                      </p>
                      <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                        {att?.mimetype || "application/octet-stream"} • {formatBytes(att?.size)}{att?.uploadedBy?.name ? ` • Uploaded by ${att.uploadedBy.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-primary/90 text-white hover:opacity-95"
                        download
                      >
                        Download
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-light-text-muted dark:text-dark-text-muted">— No attachments</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-5 space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {task?.updatedAt ? (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Updated at:</span> {dayjs(task.updatedAt).format(DEADLINE_DT_FORMAT)}
          </p>
        ) : null}
        {task?.createdAt ? (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Created at:</span> {dayjs(task.createdAt).format(DEADLINE_DT_FORMAT)}
          </p>
        ) : null}
        <p>
          <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Created by:</span> {task?.createdBy?.name ?? "—"}
        </p>
      </div>

      {isRoot && (
        <section className="mt-6">
          <h3 className="mb-3 text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            Subtasks
          </h3>

          {/* quick add */}
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              placeholder="Add a subtask title…"
              value={newSubTitle}
              onChange={(e) => setNewSubTitle(e.target.value)}
              className="flex-1 rounded-lg border px-3 py-2 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border"
            />
            <button
              onClick={addSubtask}
              disabled={creatingSub || !newSubTitle.trim()}
              className="rounded-lg px-3 py-2 text-sm font-semibold bg-brand-primary/90 text-white hover:opacity-95 disabled:opacity-60"
            >
              {creatingSub ? "Adding…" : "Add"}
            </button>
          </div>

          {/* list */}
          <div className="rounded-xl ring-1 ring-light-border dark:ring-dark-border bg-light-surface dark:bg-dark-surface">
            {subsLoading ? (
              <p className="p-3 text-light-text-muted dark:text-dark-text-muted">Loading…</p>
            ) : subtasks.length === 0 ? (
              <p className="p-3 text-light-text-muted dark:text-dark-text-muted">— No subtasks</p>
            ) : (
              <ul className="divide-y divide-light-border/60 dark:divide-dark-border/60">
                {subtasks.map((st) => {
                  const dl = st?.deadline ? dayjs(st.deadline).format(REMINDER_FORMAT) : "—";
                  return (
                    <li key={st._id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-light-text-primary dark:text-dark-text-primary">
                          {st.title}
                        </p>
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                          Deadline: {dl} • Priority: {st?.priority ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Status</label>
                        <select
                          value={st.status || "To Do"}
                          onChange={(e) => setSubStatus(st, e.target.value)}
                          className="text-sm px-2 py-1 rounded-md border ring-1 ring-light-border dark:ring-dark-border bg-light-bg dark:bg-dark-bg disabled:opacity-60"
                          disabled={pendingSub.has(st._id)}
                        >
                          {["To Do", "In Progress", "Done"].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setEditingSub(st)}
                          className={BTN_PRIMARY_CLS}
                        >
                          Edit
                        </button>

                        <DeleteTaskButton
                          task={st}
                          onTaskDeleted={() => {
                            setSubtasks((prev) => prev.filter((x) => x._id !== st._id));
                          }}
                        >
                          Delete
                        </DeleteTaskButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )
      }

      {/* Subtask edit modal */}
      {editingSub && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setEditingSub(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-[min(90vw,740px)] rounded-2xl bg-light-bg dark:bg-dark-bg shadow-2xl p-6 border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Edit Subtask</h3>
              <button onClick={() => setEditingSub(null)} className="text-2xl font-bold">×</button>
            </div>
            <SubtaskForm
              parentTask={task}
              subtask={editingSub}
              onCancel={() => setEditingSub(null)}
              onUpdated={(updated) => {
                setSubtasks((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
                setEditingSub(null);
              }}
            />
          </div>
        </div>
      )}

      {/* NEW: Attachment preview modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[95] grid place-items-center bg-black/60 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-[min(92vw,900px)] rounded-2xl bg-light-bg dark:bg-dark-bg shadow-2xl p-4 border border-light-border dark:border-dark-border max-h-[92vh] overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold truncate">{previewAttachment.filename || "Preview"}</h3>
              <button onClick={() => setPreviewAttachment(null)} className="text-2xl font-bold">×</button>
            </div>
            <div className="rounded-lg ring-1 ring-light-border dark:ring-dark-border overflow-auto max-h-[80vh] bg-white dark:bg-black">
              {previewAttachment.mimetype?.startsWith("image/") ? (
                <img
                  src={buildAttachmentUrl(task?._id, previewAttachment?._id)}
                  alt={previewAttachment.filename || "image"}
                  className="max-w-full h-auto block mx-auto"
                />
              ) : previewAttachment.mimetype === "application/pdf" ? (
                <iframe
                  title={previewAttachment.filename || "PDF preview"}
                  src={buildAttachmentUrl(task?._id, previewAttachment?._id)}
                  className="w-full h-[80vh]"
                />
              ) : (
                <div className="p-6 text-center text-sm text-light-text-muted dark:text-dark-text-muted">
                  Preview not supported for this file type.<br />
                  Use “Download” to open it locally.
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <a
                href={buildAttachmentUrl(task?._id, previewAttachment?._id)}
                target="_blank"
                rel="noopener noreferrer"
                className={BTN_PRIMARY_CLS}
                download
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-3 justify-end">
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className={BTN_PRIMARY_CLS}
          aria-expanded={showComments}
        >
          {showComments ? "Hide comments" : "Show comments"}
        </button>
        <TaskFormButton task={task} onTaskUpdated={onTaskUpdated}>Edit Task</TaskFormButton>
        <DeleteTaskButton task={task} onTaskDeleted={onTaskDeleted}>Delete Task</DeleteTaskButton>
      </div>

      {/* Comments */}
      {
        showComments ? (
          <section className="mt-6">
            <h3 className="mb-2 text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">Comments</h3>
            <div className="rounded-2xl border p-3 bg-light-surface dark:bg-dark-surface ring-1 ring-light-border dark:ring-dark-border">
              <TaskComments taskId={task?._id} currentUser={currentUser} />
            </div>
          </section>
        ) : null
      }
    </article >
  );
};

export { TaskCard, PRIORITY, PRIORITY_STYLES, MINUTES, DEFAULT_TRIPLET, DEADLINE_DT_FORMAT, REMINDER_FORMAT };
