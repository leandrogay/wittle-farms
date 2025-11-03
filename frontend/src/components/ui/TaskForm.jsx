import React, { useEffect, useState } from "react";
import {
  getProjectsByUserId,
  getTeamMembersByProjectId,
  createTask,
  updateTask,
} from "../../services/api.js";
import { useAuth } from "/src/context/useAuth";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// ===== Constants =====
const SG_TZ = "Asia/Singapore";
const DATE_TIME_LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";
const MINUTES = { MINUTE: 1, HOUR: 60, DAY: 1440 };
const STATUS_OPTIONS = ["To Do", "In Progress", "Done"];

dayjs.tz.setDefault(SG_TZ);

// ===== Helpers =====
const _labelFromMinutes = (m) => {
  if (m % MINUTES.DAY === 0) return `${m / MINUTES.DAY} day(s) before`;
  if (m % MINUTES.HOUR === 0) return `${m / MINUTES.HOUR} hour(s) before`;
  return `${m} minute(s) before`;
};

const _getDeadlineDayjs = (localDeadlineStr) =>
  dayjs.tz(localDeadlineStr, DATE_TIME_LOCAL_FORMAT, SG_TZ);

/** Latest offset (in minutes) that would still be in the future right now. */
const _getMaxOffsetMinutesFromNow = (localDeadlineStr) => {
  if (!localDeadlineStr) return 0;
  const now = dayjs().tz(SG_TZ);
  const dl = _getDeadlineDayjs(localDeadlineStr);
  const diffMin = dl.diff(now, "minute");
  return Math.max(0, diffMin);
};

const _fmtDays = (m) => `${Math.floor(m / MINUTES.DAY)} day(s) before`;

const TaskForm = ({ onCancel, onCreated, onUpdated, task = null, parentTask = null }) => {
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const { user } = useAuth();

  const isEdit = task !== null;
  const [noDueDate, setNoDueDate] = useState(() =>
    isEdit ? !task?.deadline : false
  );

  // recurrence UI state (fresh restart)
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(
    isEdit ? Boolean(task?.recurrence) : false
  );
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(
    isEdit && task?.recurrence?.frequency ? task.recurrence.frequency : "daily"
  ); // "daily" | "weekly" | "monthly"
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    isEdit && task?.recurrence?.interval ? Number(task.recurrence.interval) : 1
  ); // >=1
  const [recurrenceEnds, setRecurrenceEnds] = useState(
    isEdit && task?.recurrence?.ends ? task.recurrence.ends : "never"
  ); // "never" | "onDate"
  const [recurrenceUntil, setRecurrenceUntil] = useState(
    isEdit && task?.recurrence?.until
      ? dayjs(task.recurrence.until).tz().format(DATE_TIME_LOCAL_FORMAT)
      : ""
  );

  const [newReminderValue, setNewReminderValue] = useState(0);
  const [newReminderUnit, setNewReminderUnit] = useState("day");
  const [reminderError, setReminderError] = useState("");

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        ...task,
        assignedTeamMembers:
          task.assignedTeamMembers?.map((m) =>
            typeof m === "string" ? m : m?._id
          ) || [],
        assignedProject:
          typeof task.assignedProject === "string"
            ? task.assignedProject
            : task.assignedProject?._id || "",
        deadline: task.deadline
          ? dayjs(task.deadline).tz().format(DATE_TIME_LOCAL_FORMAT)
          : "",
        createdBy: user.id,
        reminderOffsets: Array.isArray(task.reminderOffsets)
          ? task.reminderOffsets
          : [],
        attachments: [],
        priority: String(
          Number.isFinite(Number(task.priority))
            ? Math.max(1, Math.min(10, Math.trunc(Number(task.priority))))
            : 5
        ),
        parentTask: task.parentTask || null,
      };
    }
    return {
      title: "",
      description: "",
      notes: "",
      // assignedProject: "",
      assignedProject: parentTask?.assignedProject?._id || parentTask?.assignedProject || "",
      assignedTeamMembers: [user.id],
      status: STATUS_OPTIONS[0],
      priority: "5",
      deadline: "",
      createdBy: user.id,
      attachments: [],
      reminderOffsets: [],
      parentTask: parentTask?._id || parentTask || null,
    };
  });

  // ===== NEW: allow past deadlines when editing a past-deadline task =====
  const originalDeadlineIsPast =
    isEdit && task?.deadline && dayjs(task.deadline).isBefore(dayjs());

  // Load projects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProjectsByUserId(user.id);
        if (cancelled) return;
        setProjects(Array.isArray(data) ? data : []);
        if (!isEdit && data?.length && !formData.assignedProject) {
          setFormData((prev) => ({ ...prev, assignedProject: data[0]._id }));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load projects");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, isEdit, formData.assignedProject]);

  // Load team members when project changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!formData.assignedProject) {
        setTeamMembers([]);
        setFormData((prev) => ({ ...prev, assignedTeamMembers: [] }));
        return;
      }
      try {
        const members = await getTeamMembersByProjectId(
          formData.assignedProject
        );
        if (cancelled) return;
        setTeamMembers(Array.isArray(members) ? members : []);
        const validIds = new Set((members || []).map((m) => m._id));
        setFormData((prev) => {
          const validIdsSet = new Set(validIds);
          const base = new Set(prev.assignedTeamMembers || []);
          if (validIdsSet.has(user.id)) base.add(user.id);
          return {
            ...prev,
            assignedTeamMembers: [...base].filter((id) => validIdsSet.has(id)),
          };
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load team members");
        setTeamMembers([]);
        setFormData((prev) => ({ ...prev, assignedTeamMembers: [] }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.assignedProject, user.id]);

  const handleChange = (e) => {
    const { name, value, files, options, type } = e.target;
    if (name === "deadline" && !value) {
      setRecurrenceEnabled(false);
    }
    if (name === "priority") {
      const n = Math.max(1, Math.min(10, Math.trunc(Number(value) || 5)));
      setFormData((prev) => ({ ...prev, priority: String(n) }));
      return;
    }
    if (type === "file") {
      setFormData((prev) => ({ ...prev, [name]: files }));
    } else if (type === "select-multiple") {
      const selectedValues = Array.from(options)
        .filter((o) => o.selected)
        .map((o) => o.value);
      setFormData((prev) => ({ ...prev, [name]: selectedValues }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const removeAttachment = (fileIndex) => {
    if (!formData.attachments) return;
    const filesArray = Array.from(formData.attachments);
    filesArray.splice(fileIndex, 1);
    const dt = new DataTransfer();
    filesArray.forEach((file) => dt.items.add(file));
    setFormData((prev) => ({ ...prev, attachments: dt.files }));
  };

  const handleAssigneeToggle = (memberId) => {
    setFormData((prev) => ({
      ...prev,
      assignedTeamMembers: prev.assignedTeamMembers.includes(memberId)
        ? prev.assignedTeamMembers.filter((id) => id !== memberId)
        : [...prev.assignedTeamMembers, memberId],
    }));
  };

  const removeAssignee = (memberId) => {
    setFormData((prev) => ({
      ...prev,
      assignedTeamMembers: prev.assignedTeamMembers.filter(
        (id) => id !== memberId
      ),
    }));
  };

  const toggleNoDueDate = (checked) => {
    setNoDueDate(checked);
    if (checked) {
      setFormData((prev) => ({ ...prev, deadline: "" }));
      // also disable recurrence when user removes deadline
      setRecurrenceEnabled(false);
    }
  };

  const selectedMembers = teamMembers.filter((tm) =>
    formData.assignedTeamMembers.includes(tm._id)
  );

  // Auto-prune past reminders whenever deadline toggles/changes
  useEffect(() => {
    if (noDueDate || !formData.deadline) return;
    const maxMin = _getMaxOffsetMinutesFromNow(formData.deadline);
    setFormData((prev) => ({
      ...prev,
      reminderOffsets: (prev.reminderOffsets || [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0 && n <= maxMin)
        .sort((a, b) => b - a),
    }));
  }, [noDueDate, formData.deadline]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { ...formData };
      payload.priority = Math.max(
        1,
        Math.min(10, Math.trunc(Number(formData.priority) || 5))
      );

      payload.parentTask = formData.parentTask || null;
      if (payload.parentTask && !payload.assignedProject) {
        delete payload.assignedProject;
      }

      const hasDeadline = !noDueDate && !!formData.deadline;

      // deadline + reminders
      if (hasDeadline) {
        payload.deadline = dayjs
          .tz(formData.deadline, DATE_TIME_LOCAL_FORMAT, SG_TZ)
          .toISOString();

        let offsets = Array.isArray(formData.reminderOffsets)
          ? [...formData.reminderOffsets]
          : [];
        const pending =
          Number(newReminderValue) * MINUTES[newReminderUnit.toUpperCase()];
        if (Number.isFinite(pending) && pending > 0 && !offsets.includes(pending))
          offsets.push(pending);
        offsets = [...new Set(offsets)]
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
        const maxMin = _getMaxOffsetMinutesFromNow(formData.deadline);
        const before = offsets.length;
        offsets = offsets.filter((n) => n <= maxMin).sort((a, b) => b - a);
        if (before !== offsets.length) {
          // you can also surface a non-blocking banner/toast here if you like
          // e.g., set a local message near the Reminders section
          // (keeping silent by default)
        }
        payload.reminderOffsets = offsets;
      } else {
        delete payload.deadline;
        payload.reminderOffsets = (Array.isArray(formData.reminderOffsets)
          ? formData.reminderOffsets
          : []
        )
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
      }

      if (recurrenceEnabled) {
        if (!hasDeadline) {
          setError('To repeat this task, add a deadline or uncheck "Repeat this task".');
          return;
        }

        const freq = (recurrenceFrequency || "none").toLowerCase();
        if (freq === "none") {
          payload.recurrence = null;
        } else {
          payload.recurrence = {
            frequency: freq, // "daily" | "weekly" | "monthly"
            interval: Math.max(1, Math.trunc(Number(recurrenceInterval) || 1)),
            ends: recurrenceEnds, // "never" | "onDate"
            until:
              recurrenceEnds === "onDate" && recurrenceUntil
                ? dayjs
                  .tz(recurrenceUntil, DATE_TIME_LOCAL_FORMAT, SG_TZ)
                  .toISOString()
                : null,
          };
        }
      } else {
        payload.recurrence = null;
      }

      if (isEdit) {
        const data = await updateTask(task._id, payload);
        onUpdated?.(data);
      } else {
        const data = await createTask(payload);
        onCreated?.(data);
      }
      onCancel();
    } catch (err) {
      setError(err.message || (isEdit ? "Failed to update task" : "Failed to create task"));
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".assignee-dropdown-container"))
        setShowAssigneeDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Loading form...
          </p>
        </div>
      </div>
    );
  }

  // Render-time values for UX
  const maxOffsetNow =
    !noDueDate && formData.deadline
      ? _getMaxOffsetMinutesFromNow(formData.deadline)
      : 0;
  const pendingMinutes =
    Number(newReminderValue) * (MINUTES[newReminderUnit.toUpperCase()] || 0);
  const addDisabled =
    noDueDate ||
    !formData.deadline ||
    !Number.isFinite(pendingMinutes) ||
    pendingMinutes <= 0 ||
    pendingMinutes > maxOffsetNow;

  return (
    <div className="w-[800px] max-h-[90vh] overflow-hidden mx-auto">
      <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-sm border border-light-border dark:border-dark-border flex flex-col max-h-[90vh] w-full">
        <div className="p-4 border-b border-light-border dark:border-dark-border flex-shrink-0">
          <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
            {isEdit ? "Edit Task" : "Create New Task"}
          </h2>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm mt-1">
            {isEdit
              ? "Update the task details below"
              : "Fill in the details to create a new task"}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-priority-high-bg dark:bg-priority-high-bg-dark border-l-4 border-danger">
            <p className="text-priority-high-text dark:text-priority-high-text-dark">
              {error}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
              <div className="lg:col-span-2 space-y-4 min-w-0">
                <div>
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder={
                      isEdit ? "Update task title" : "Enter a clear, descriptive title"
                    }
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder={
                      isEdit ? "Update task description..." : "Describe the task in detail..."
                    }
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent resize-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    {isEdit ? "Update Attachments" : "Attachments"}
                  </label>
                  <div className="border-2 border-dashed border-light-border dark:border-dark-border rounded-lg p-3 bg-light-surface dark:bg-dark-surface hover:border-brand-primary/50 dark:hover:border-brand-secondary/50 transition-colors">
                    <input
                      type="file"
                      name="attachments"
                      multiple
                      onChange={handleChange}
                      className="w-full text-xs text-light-text-secondary dark:text-dark-text-secondary file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-brand-primary file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                    />
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                      {isEdit
                        ? "Upload additional files or replace existing ones"
                        : "Upload files, images, or documents"}
                    </p>
                  </div>

                  {formData.attachments && formData.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {Array.from(formData.attachments).map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary text-xs px-2 py-1 rounded-full border border-light-border dark:border-dark-border group hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary transition-colors"
                        >
                          <svg
                            className="w-3 h-3 mr-1 text-light-text-muted dark:text-dark-text-muted"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="truncate max-w-[80px]">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="ml-1 text-light-text-muted dark:text-dark-text-muted hover:text-danger font-bold transition-colors text-sm"
                            title="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 w-full max-w-[250px]">
                <div>
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    Project{formData.parentTask ? "" : " *"}
                  </label>
                  <select
                    name="assignedProject"
                    value={formData.assignedProject}
                    onChange={handleChange}
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-surface flex justify-between items-center focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-all"
                    // required
                    // disabled={projects.length === 0}
                    required={!formData.parentTask}
                    disabled={!!formData.parentTask || projects.length === 0}
                  >
                    <option value="">
                      {projects.length
                        ? isEdit
                          ? "Change project"
                          : "Select a project"
                        : "No projects found"}
                    </option>
                    {projects.map((p, idx) => (
                      <option key={p._id || idx} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="assignee-dropdown-container relative">
                  <label className="block text sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    {isEdit ? "Update Assignees" : "Assignees"}
                  </label>

                  {selectedMembers.length > 0 && (
                    <div className="mb-2 w-[250px] overflow-hidden">
                      <div className="grid grid-cols-2 gap-1 max-h-20 overflow-y-auto">
                        {selectedMembers.map((m) => (
                          <div
                            key={m._id}
                            className="flex items-center bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary text-xs px-1 py-1 rounded-full min-w-0 max-w-[120px] border border-brand-primary/20 dark:border-brand-secondary/20"
                          >
                            <div className="w-3 h-3 bg-brand-primary/20 dark:bg-brand-secondary/20 rounded-full mr-1 flex items-center justify-center text-xs font-medium shrink-0">
                              {m.name?.charAt(0)?.toUpperCase() || "•"}
                            </div>
                            <span className="truncate text-xs min-w-0 flex-1">
                              {m.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAssignee(m._id)}
                              className="ml-1 text-brand-primary dark:text-brand-secondary hover:text-danger font-bold text-xs shrink-0 w-3 h-3 flex items-center justify-center"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setShowAssigneeDropdown(!showAssigneeDropdown)
                    }
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary hover:bg-light-surface dark:hover:bg-dark-surface flex justify-between items-center focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-colors"
                  >
                    <span className="text-light-text-secondary dark:text-dark-text-secondary truncate min-w-0 flex-1">
                      {formData.assignedTeamMembers.length > 0
                        ? `${formData.assignedTeamMembers.length} selected`
                        : isEdit
                          ? "Change assignees"
                          : "Select team members"}
                    </span>
                    <svg
                      className="w-4 h-4 transition-transform text-light-text-muted dark:text-dark-text-muted shrink-0 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          showAssigneeDropdown
                            ? "M19 15l-7-7-7 7"
                            : "M19 9l-7 7-7-7"
                        }
                      />
                    </svg>
                  </button>

                  {showAssigneeDropdown && (
                    <div className="absolute z-20 w-[250px] mt-1 bg-light-bg dark:bg-dark-bg-secondary border border-light-border dark:border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {teamMembers.length === 0 ? (
                        <div className="p-3 text-light-text-muted dark:text-dark-text-muted text-center text-sm">
                          No team members found
                        </div>
                      ) : (
                        <div className="p-1">
                          {teamMembers.map((tm) => (
                            <label
                              key={tm._id}
                              className="flex items-center p-2 hover:bg-light-surface dark:hover:bg-dark-surface cursor-pointer rounded-md transition-colors min-w-0"
                            >
                              <input
                                type="checkbox"
                                checked={formData.assignedTeamMembers.includes(
                                  tm._id
                                )}
                                onChange={() => handleAssigneeToggle(tm._id)}
                                className="mr-2 w-4 h-4 text-brand-primary dark:text-brand-secondary border-light-border dark:border-dark-border rounded focus:ring-brand-primary dark:focus:ring-brand-secondary shrink-0"
                              />
                              <div className="flex items-center min-w-0 flex-1">
                                <div className="w-6 h-6 bg-light-surface dark:bg-dark-surface rounded-full mr-2 flex items-center justify-center text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary shrink-0">
                                  {tm.name?.charAt(0)?.toUpperCase() || "•"}
                                </div>
                                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate min-w-0">
                                  {tm.name}
                                </span>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-all"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                      Priority Bucket
                    </label>
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-1">
                      1 is least important, 10 is most important
                    </p>
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-all"
                    >
                      {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(
                        (v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    Deadline
                  </label>
                  <label className="flex items-center gap-2 mb-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    <input
                      type="checkbox"
                      className="rounded border-light-border dark:border-dark-border"
                      checked={noDueDate}
                      onChange={(e) => toggleNoDueDate(e.target.checked)}
                    />
                    No due date
                  </label>
                  <input
                    type="datetime-local"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    disabled={noDueDate}
                    // IMPORTANT: only enforce future min for new tasks or edits whose ORIGINAL deadline wasn't past
                    min={
                      originalDeadlineIsPast
                        ? undefined
                        : dayjs().tz().format(DATE_TIME_LOCAL_FORMAT)
                    }
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary focus:border-transparent transition-all disabled:bg-light-surface dark:disabled:bg-dark-surface disabled:text-light-text-muted dark:disabled:text-dark-text-muted"
                  />
                  {noDueDate && (
                    <p className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">
                      This task will be created with <strong>No due date</strong>.
                    </p>
                  )}
                </div>

                {/* ===== Recurrence Section (hidden when no due date) ===== */}
                {!noDueDate && (
                  <div className="mt-3">
                    <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                      Recurrence
                    </label>

                    <label className="flex items-center gap-2 mb-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      <input
                        type="checkbox"
                        className="rounded border-light-border dark:border-dark-border"
                        checked={recurrenceEnabled}
                        onChange={(e) => setRecurrenceEnabled(e.target.checked)}
                      />
                      Repeat this task
                    </label>

                    {recurrenceEnabled && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                              Frequency
                            </label>
                            <select
                              value={recurrenceFrequency}
                              onChange={(e) =>
                                setRecurrenceFrequency(e.target.value)
                              }
                              className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                              Every
                            </label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={recurrenceInterval}
                              onChange={(e) =>
                                setRecurrenceInterval(
                                  Math.max(
                                    1,
                                    Math.trunc(Number(e.target.value) || 1)
                                  )
                                )
                              }
                              className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                              Ends
                            </label>
                            <select
                              value={recurrenceEnds}
                              onChange={(e) => setRecurrenceEnds(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
                            >
                              <option value="never">Never</option>
                              <option value="onDate">On date…</option>
                            </select>
                          </div>
                        </div>

                        {recurrenceEnds === "onDate" && (
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
                              Repeat until (inclusive)
                            </label>
                            <input
                              type="datetime-local"
                              value={recurrenceUntil}
                              onChange={(e) => setRecurrenceUntil(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
                              min={
                                formData.deadline ||
                                dayjs().tz().format(DATE_TIME_LOCAL_FORMAT)
                              }
                            />
                          </div>
                        )}

                        <p className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">
                          When the task is marked <strong>Done</strong>, the next
                          occurrence will be created with the same details and a new
                          due date based on the recurrence settings.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Reminders */}
                <div className="mt-3">
                  <label className="block text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    Reminders
                  </label>
                  {noDueDate ? (
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      Add a deadline to enable reminders.
                    </p>
                  ) : (
                    <>
                      {formData.reminderOffsets.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {formData.reminderOffsets
                            .slice()
                            .sort((a, b) => b - a)
                            .map((m, idx) => (
                              <span
                                key={`${m}-${idx}`}
                                className="inline-flex items-center text-xs bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-full px-2 py-1"
                              >
                                {_labelFromMinutes(m)}
                                <button
                                  type="button"
                                  className="ml-1 text-light-text-muted dark:text-dark-text-muted hover:text-danger"
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      reminderOffsets: (prev.reminderOffsets ||
                                        []
                                      ).filter((x) => x !== m),
                                    }))
                                  }
                                  title="Remove reminder"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-2">
                          If you don’t add any, we’ll remind you <b>7</b>, <b>3</b>,
                          and <b>1</b> day before the deadline by default.
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={newReminderValue}
                          onChange={(e) =>
                            setNewReminderValue(
                              parseInt(e.target.value || "1", 10)
                            )
                          }
                          className="w-24 px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
                        />
                        <select
                          value={newReminderUnit}
                          onChange={(e) => setNewReminderUnit(e.target.value)}
                          className="px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary"
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
                            if (noDueDate || !formData.deadline) return;
                            const unitKey = newReminderUnit.toUpperCase();
                            const minutes =
                              Number(newReminderValue) * (MINUTES[unitKey] || 0);
                            if (!Number.isFinite(minutes) || minutes <= 0) return;
                            const maxMin = _getMaxOffsetMinutesFromNow(
                              formData.deadline
                            );
                            if (minutes > maxMin) {
                              setReminderError(
                                `That reminder would be in the past. Latest allowed is ${_fmtDays(
                                  maxMin
                                )}.`
                              );
                              return;
                            }
                            setFormData((prev) => ({
                              ...prev,
                              reminderOffsets: [
                                ...new Set([
                                  ...(prev.reminderOffsets || []),
                                  minutes,
                                ]),
                              ].sort((a, b) => b - a),
                            }));
                          }}
                          className={`px-3 py-2 text-sm rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary ${addDisabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                        >
                          Add
                        </button>
                      </div>

                      {!noDueDate && formData.deadline && (
                        <p className="mt-1 text-xs">
                          Latest valid reminder right now:{" "}
                          <b>{_fmtDays(maxOffsetNow)}</b>
                        </p>
                      )}
                      {reminderError && (
                        <p className="mt-1 text-xs text-danger">
                          {reminderError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4 pt-3 border-t border-light-border dark:border-dark-border">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recurrenceEnabled && !formData.deadline}
                aria-disabled={recurrenceEnabled && !formData.deadline}
                className={`px-4 py-2 text-sm rounded-lg transition-colors font-medium shadow-sm ${isEdit
                  ? "bg-success text-white hover:bg-emerald-600"
                  : "bg-brand-primary text-white hover:bg-blue-700"
                  }`}
              >
                {isEdit ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export { TaskForm };
