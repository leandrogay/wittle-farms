import React, { useMemo, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { createTask, updateTask } from "../../services/api.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const SG_TZ = "Asia/Singapore";
const DATE_TIME_LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";
const MINUTES = { MINUTE: 1, HOUR: 60, DAY: 1440 };
const STATUS_OPTIONS = ["To Do", "In Progress", "Done"];

dayjs.tz.setDefault(SG_TZ);

function _getMaxOffsetMinutesFromNow(localDeadlineStr) {
  if (!localDeadlineStr) return 0;
  const now = dayjs().tz(SG_TZ);
  const dl = dayjs.tz(localDeadlineStr, DATE_TIME_LOCAL_FORMAT, SG_TZ);
  return Math.max(0, dl.diff(now, "minute"));
}
const _labelFromMinutes = (m) => {
  if (m % MINUTES.DAY === 0) return `${m / MINUTES.DAY} day(s) before`;
  if (m % MINUTES.HOUR === 0) return `${m / MINUTES.HOUR} hour(s) before`;
  return `${m} minute(s) before`;
};

export default function SubtaskForm({
  parentTask,           // required for create
  subtask = null,       // when present -> edit
  onCancel,
  onCreated,
  onUpdated,
}) {
  const isEdit = Boolean(subtask);

  // sensible defaults: inherit project & members
  const inheritedProjectId = useMemo(() => {
    const ap = parentTask?.assignedProject;
    return typeof ap === "string" ? ap : ap?._id || "";
  }, [parentTask]);

  const inheritedMembers = useMemo(() => {
    return (parentTask?.assignedTeamMembers || [])
      .map((u) => u?._id || u)
      .filter(Boolean);
  }, [parentTask]);

  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        title: subtask.title || "",
        description: subtask.description || "",
        status: subtask.status || "To Do",
        priority: String(
          Number.isFinite(Number(subtask.priority))
            ? Math.max(1, Math.min(10, Math.trunc(Number(subtask.priority))))
            : 5
        ),
        deadline: subtask.deadline ? dayjs(subtask.deadline).tz().format(DATE_TIME_LOCAL_FORMAT) : "",
        reminderOffsets: Array.isArray(subtask.reminderOffsets) ? subtask.reminderOffsets : [],
      };
    }
    return {
      title: "",
      description: "",
      status: "To Do",
      priority: "5",
      deadline: "",
      reminderOffsets: [],
    };
  });

  const [noDueDate, setNoDueDate] = useState(() => (isEdit ? !subtask?.deadline : false));
  const [newReminderValue, setNewReminderValue] = useState(0);
  const [newReminderUnit, setNewReminderUnit] = useState("day");
  const [reminderError, setReminderError] = useState("");
  const [saving, setSaving] = useState(false);
  const originalDeadlineIsPast = isEdit && subtask?.deadline && dayjs(subtask.deadline).isBefore(dayjs());

  const maxOffsetNow = !noDueDate && form.deadline ? _getMaxOffsetMinutesFromNow(form.deadline) : 0;
  const pendingMinutes = Number(newReminderValue) * (MINUTES[newReminderUnit.toUpperCase()] || 0);
  const addDisabled =
    noDueDate || !form.deadline || !Number.isFinite(pendingMinutes) || pendingMinutes <= 0 || pendingMinutes > maxOffsetNow;

  function onChange(e) {
    const { name, value } = e.target;
    if (name === "priority") {
      const n = Math.max(1, Math.min(10, Math.trunc(Number(value) || 5)));
      setForm((p) => ({ ...p, priority: String(n) }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || "",
        status: form.status,
        priority: Math.max(1, Math.min(10, Math.trunc(Number(form.priority) || 5))),
        parentTask: isEdit ? subtask.parentTask || parentTask?._id || parentTask : (parentTask?._id || parentTask),
        assignedProject: inheritedProjectId || undefined,
        assignedTeamMembers: inheritedMembers,
      };

      if (!noDueDate && form.deadline) {
        payload.deadline = dayjs.tz(form.deadline, DATE_TIME_LOCAL_FORMAT, SG_TZ).toISOString();
        const arr = Array.isArray(form.reminderOffsets) ? form.reminderOffsets : [];
        payload.reminderOffsets = [...new Set(arr.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
      } else {
        payload.reminderOffsets = [];
      }

      if (isEdit) {
        const updated = await updateTask(subtask._id, payload);
        onUpdated?.(updated);
      } else {
        const created = await createTask(payload);
        onCreated?.(created);
      }
    } catch (err) {
      // surface minimal error
      alert(err.message || "Failed to save subtask");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-1">Subtask title *</label>
        <input
          type="text"
          name="title"
          required
          value={form.title}
          onChange={onChange}
          className="w-full px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary"
          placeholder="Enter subtask title"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          value={form.description}
          onChange={onChange}
          className="w-full px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary resize-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold mb-1">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={onChange}
            className="w-full px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Priority (1–10)</label>
          <select
            name="priority"
            value={form.priority}
            onChange={onChange}
            className="w-full px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary"
          >
            {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">No due date</label>
          <input
            type="checkbox"
            checked={noDueDate}
            onChange={(e) => setNoDueDate(e.target.checked)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Deadline</label>
        <input
          type="datetime-local"
          name="deadline"
          value={form.deadline}
          onChange={onChange}
          disabled={noDueDate}
          min={isEdit && originalDeadlineIsPast ? undefined : dayjs().tz().format(DATE_TIME_LOCAL_FORMAT)}
          className="w-full px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary disabled:opacity-60"
        />
      </div>

      {/* Reminders */}
      {!noDueDate && (
        <div>
          <label className="block text-sm font-semibold mb-1">Reminders</label>
          {form.reminderOffsets?.length ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {[...form.reminderOffsets].sort((a, b) => b - a).map((m, idx) => (
                <span key={`${m}-${idx}`} className="inline-flex items-center text-xs bg-light-surface dark:bg-dark-surface border rounded-full px-2 py-1">
                  {_labelFromMinutes(m)}
                  <button
                    type="button"
                    className="ml-1 hover:text-danger"
                    onClick={() =>
                      setForm((p) => ({ ...p, reminderOffsets: (p.reminderOffsets || []).filter((x) => x !== m) }))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs opacity-70 mb-2">If none are added, defaults (7/3/1 days) will be used when applicable.</p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={newReminderValue}
              onChange={(e) => setNewReminderValue(parseInt(e.target.value || "1", 10))}
              className="w-24 px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary"
            />
            <select
              value={newReminderUnit}
              onChange={(e) => setNewReminderUnit(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg bg-light-bg dark:bg-dark-bg-secondary"
            >
              <option value="minute">minute(s) before</option>
              <option value="hour">hour(s) before</option>
              <option value="day">day(s) before</option>
            </select>
            <button
              type="button"
              disabled={addDisabled}
              onClick={() => {
                setReminderError("");
                if (noDueDate || !form.deadline) return;
                const minutes = Number(newReminderValue) * (MINUTES[newReminderUnit.toUpperCase()] || 0);
                if (!Number.isFinite(minutes) || minutes <= 0) return;
                const maxMin = _getMaxOffsetMinutesFromNow(form.deadline);
                if (minutes > maxMin) {
                  setReminderError(`That reminder would be in the past. Latest allowed is ${Math.floor(maxMin / MINUTES.DAY)} day(s) before.`);
                  return;
                }
                setForm((p) => ({
                  ...p,
                  reminderOffsets: [...new Set([...(p.reminderOffsets || []), minutes])].sort((a, b) => b - a),
                }));
              }}
              className={`px-3 py-2 text-sm rounded-lg border ${addDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              Add
            </button>
          </div>
          {reminderError && <p className="mt-1 text-xs text-danger">{reminderError}</p>}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm rounded-lg text-white bg-brand-primary hover:bg-blue-700 disabled:opacity-60"
        >
          {isEdit ? "Save Subtask" : "Create Subtask"}
        </button>
      </div>
    </form>
  );
}
