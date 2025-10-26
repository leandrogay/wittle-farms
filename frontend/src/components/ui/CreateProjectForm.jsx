import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "/src/context/useAuth";
import { createProject, getAllTeamMembers, getDepartments } from "../../services/api.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// ===== Constants (avoid magic strings) =====
const DEFAULT_TIMEZONE = "Asia/Singapore";
const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_LOCAL_FORMAT = "YYYY-MM-DDTHH:mm";
const PRIORITY_OPTIONS = ["Low", "Medium", "High"];
const VISIBILITY_OPTIONS = [
  { value: "Private", label: "Private (only you)" },
  { value: "Team", label: "Team (project members)" },
  { value: "Org", label: "Organisation" },
];

const LOADING_SPINNER_CLS =
  "h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500";

const PANEL_WRAPPER_CLS =
  "flex max-h-[90vh] flex-col rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900";

const SECTION_TITLE_CLS = "text-xl font-semibold text-gray-900 dark:text-gray-100";
const SECTION_SUBTITLE_CLS = "text-sm text-gray-500 dark:text-gray-400";

const INPUT_BASE_CLS =
  "mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const BTN_SECONDARY_CLS =
  "inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800";

const BTN_PRIMARY_CLS =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

const ERROR_BANNER_CLS =
  "border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:border-red-600 dark:bg-red-900/20 dark:text-red-200";

const MEMBER_CHIP_CLS =
  "flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/30 dark:text-blue-200";

const DROPDOWN_MENU_CLS =
  "absolute left-0 top-full z-50 mt-1 w-[260px] max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800";

dayjs.tz.setDefault(DEFAULT_TIMEZONE);

// ===== Private helpers =====
const _toId = (x) => (typeof x === "string" ? x : x?._id ?? "");

const _initialFormData = (user, project) => {
  if (project) {
    return {
      name: project?.name ?? "",
      description: project?.description ?? "",
      priority: project?.priority ?? PRIORITY_OPTIONS[1],
      visibility: project?.visibility ?? VISIBILITY_OPTIONS[1].value,
      projectLead: _toId(project?.projectLead),
      teamMembers: (project?.teamMembers || []).map(_toId),
      startDate: project?.startDate
        ? dayjs(project.startDate).tz().format(DATE_FORMAT)
        : dayjs().tz().format(DATE_FORMAT),
      endDate: project?.endDate ? dayjs(project.endDate).tz().format(DATE_FORMAT) : "",
      attachments: [],
      createdBy: _toId(project?.createdBy) || user.id,
    };
  }
  return {
    name: "",
    description: "",
    priority: PRIORITY_OPTIONS[1],
    visibility: VISIBILITY_OPTIONS[1].value,
    projectLead: user.id,
    teamMembers: [user.id],
    startDate: dayjs().tz().format(DATE_FORMAT),
    endDate: "",
    attachments: [],
    createdBy: user.id,
  };
};

const _isValid = (formData, departmentIds) =>
  formData.name.trim().length > 0 &&
  departmentIds.length > 0 &&
  Boolean(formData.projectLead) &&
  Boolean(formData.startDate);

const _filesMinusIndex = (fileList, idx) => {
  if (!fileList?.length) return fileList;
  const files = Array.from(fileList);
  files.splice(idx, 1);
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
};

const _buildPayload = ({ formData, departmentIds, deadline, user, isEdit }) => {
  const base = {
    name: formData.name,
    description: formData.description ?? "",
    departmentIds,
    department: departmentIds,
    departments: departmentIds,
    ...(departmentIds.length === 1 ? { departmentId: departmentIds[0] } : {}),
    ...(deadline
      ? { deadline: dayjs.tz(deadline, DATE_TIME_LOCAL_FORMAT, DEFAULT_TIMEZONE).toISOString() }
      : {}),
    createdBy: user.id,
    teamMembers: formData.teamMembers,
    visibility: formData.visibility,
    priority: formData.priority,
    startDate: formData.startDate || undefined,
    endDate: formData.endDate || undefined,
    projectLead: formData.projectLead || undefined,
  };

  // Ensure project lead is included as a team member
  if (formData.projectLead && !base.teamMembers.includes(formData.projectLead)) {
    base.teamMembers = Array.from(new Set([formData.projectLead, ...base.teamMembers]));
  }

  return base;
};

// ===== Component =====
const CreateProjectForm = ({ onCancel, onCreated, project = null }) => {
  const { user } = useAuth();
  const isEdit = Boolean(project);

  const [members, setMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [deadline, setDeadline] = useState("");

  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [noEndDate, setNoEndDate] = useState(() => (isEdit ? !project?.endDate : false));

  const dropdownRef = useRef(null);
  const dropdownBtnRef = useRef(null);

  const [formData, setFormData] = useState(() => _initialFormData(user, project));

  // ===== Effects =====
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const [memberList, deptList] = await Promise.all([
          getAllTeamMembers(),
          getDepartments(),
        ]);

        if (!isCancelled) {
          setMembers(Array.isArray(memberList) ? memberList : []);
          setDepartments(Array.isArray(deptList) ? deptList : []);
          if (isEdit && Array.isArray(project?.department)) {
            setDepartmentIds(project.department.map(_toId).filter(Boolean));
          }
          if (isEdit && project?.deadline) {
            setDeadline(dayjs(project.deadline).tz().format(DATE_TIME_LOCAL_FORMAT));
          }
        }
      } catch (e) {
        if (!isCancelled) setError(e.message || "Failed to load form data");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isEdit, project]);

  // Close dropdown on outside click / Esc
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (!showMemberDropdown) return;
      const insideMenu = dropdownRef.current?.contains(e.target);
      const insideBtn = dropdownBtnRef.current?.contains(e.target);
      if (!insideMenu && !insideBtn) setShowMemberDropdown(false);
    };

    const handleEsc = (e) => {
      if (e.key === "Escape") setShowMemberDropdown(false);
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [showMemberDropdown]);

  const memberMap = useMemo(() => {
    const map = new Map();
    (members || []).forEach((u) => map.set(u._id, u));
    return map;
  }, [members]);

  // ===== Handlers =====
  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === "file") setFormData((p) => ({ ...p, [name]: files }));
    else setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleToggleMember = (id) => {
    setFormData((p) => {
      const exists = p.teamMembers.includes(id);
      const next = exists ? p.teamMembers.filter((x) => x !== id) : [...p.teamMembers, id];
      const leadValid = next.includes(p.projectLead);
      return { ...p, teamMembers: next, projectLead: leadValid ? p.projectLead : "" };
    });
  };

  const handleRemoveMember = (id) => handleToggleMember(id);

  const handleToggleNoEndDate = (checked) => {
    setNoEndDate(checked);
    if (checked) setFormData((p) => ({ ...p, endDate: "" }));
  };

  const handleRemoveAttachment = (idx) => {
    setFormData((p) => ({ ...p, attachments: _filesMinusIndex(p.attachments, idx) }));
  };

  // ===== Validation =====
  const isValid = _isValid(formData, departmentIds);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) {
      setError(
        "Please complete all required fields: Name, Department(s), Project Lead, Start Date."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = _buildPayload({ formData, departmentIds, deadline, user, isEdit });
      const created = await createProject(payload);
      onCreated?.(created);
      // Keeping alert for now to avoid scope creep into custom toasts
      alert(isEdit ? "Project updated successfully!" : "Project created successfully!");
      onCancel?.();
    } catch (e) {
      setError(e.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className={LOADING_SPINNER_CLS} />
      </div>
    );
  }

  const selectedMembers = (formData.teamMembers || [])
    .map((id) => memberMap.get(id))
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-[800px] overflow-visible">
      <div className={PANEL_WRAPPER_CLS}>
        <div className="border-b border-gray-100 p-5 dark:border-gray-800">
          <h2 className={SECTION_TITLE_CLS}>{isEdit ? "Edit Project" : "Create New Project"}</h2>
          <p className={SECTION_SUBTITLE_CLS}>
            {isEdit ? "Update the project details below" : "Fill in details to create a project"}
          </p>
        </div>

        {error && <div className={ERROR_BANNER_CLS}>{error}</div>}

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="rounded-b-xl bg-white p-5 dark:bg-gray-900">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left */}
              <div className="space-y-5 lg:col-span-2">
                {/* Project Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Q4 Website Revamp"
                    className={`${INPUT_BASE_CLS}`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="What is this project about?"
                    className={`${INPUT_BASE_CLS} resize-none`}
                  />
                </div>

                {/* Departments */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Department(s) *
                  </label>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                    {departments.length === 0 ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">No departments available</div>
                    ) : (
                      departments.map((d) => (
                        <label key={d._id} className="flex cursor-pointer items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={departmentIds.includes(d._id)}
                            onChange={() => {
                              setDepartmentIds((prev) =>
                                prev.includes(d._id) ? prev.filter((x) => x !== d._id) : [...prev, d._id]
                              );
                            }}
                            className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200">{d.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select at least one department.</p>
                </div>

                {/* Attachments */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isEdit ? "Update Attachments" : "Attachments"}
                  </label>
                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                    <input
                      type="file"
                      name="attachments"
                      multiple
                      onChange={handleChange}
                      className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {isEdit ? "Upload additional files or replace existing ones" : "Upload files, images, or documents"}
                    </p>
                  </div>

                  {formData.attachments?.length > 0 && (
                    <div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                      {Array.from(formData.attachments).map((file, idx) => (
                        <div key={idx} className={MEMBER_CHIP_CLS}>
                          <span className="max-w-[140px] truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            className="ml-1 text-blue-700 hover:text-red-600 dark:text-blue-200"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="w-full max-w-[280px] space-y-5">
                {/* Priority */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Priority
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className={INPUT_BASE_CLS}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Visibility */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Visibility
                  </label>
                  <select
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleChange}
                    className={INPUT_BASE_CLS}
                  >
                    {VISIBILITY_OPTIONS.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>

                {/* Project Lead */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Project Lead * (Lead must be a team member)
                  </label>
                  <select
                    name="projectLead"
                    value={formData.projectLead}
                    onChange={handleChange}
                    required
                    className={INPUT_BASE_CLS}
                  >
                    <option value="">Select a lead</option>
                    {members
                      .filter((m) => formData.teamMembers.includes(m._id))
                      .map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Team members */}
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Team Members
                  </label>

                  {selectedMembers.length > 0 && (
                    <div className="mb-2 w-[260px]">
                      <div className="grid max-h-20 grid-cols-2 gap-1 overflow-y-auto">
                        {selectedMembers.map((m) => (
                          <div key={m._id} className={MEMBER_CHIP_CLS}>
                            <div className="mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-200 text-[10px] dark:bg-blue-800">
                              {m.name?.charAt(0)?.toUpperCase() || "•"}
                            </div>
                            <span className="truncate">{m.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m._id)}
                              className="ml-1 text-blue-700 hover:text-red-600 dark:text-blue-200"
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
                    ref={dropdownBtnRef}
                    onClick={() => setShowMemberDropdown((s) => !s)}
                    className="flex w-full max-w-[260px] items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-left text-sm text-gray-600 outline-none hover:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <span className="truncate">
                      {formData.teamMembers.length
                        ? `${formData.teamMembers.length} selected`
                        : "Select team members"}
                    </span>
                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showMemberDropdown && (
                    <div ref={dropdownRef} className={DROPDOWN_MENU_CLS}>
                      <div className="p-1">
                        {members.length === 0 ? (
                          <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">No members</div>
                        ) : (
                          members.map((tm) => (
                            <label
                              key={tm._id}
                              className="flex cursor-pointer items-center rounded-md p-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={formData.teamMembers.includes(tm._id)}
                                onChange={() => handleToggleMember(tm._id)}
                                className="mr-2 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex min-w-0 flex-1 items-center">
                                <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                  {tm.name?.charAt(0)?.toUpperCase() || "•"}
                                </div>
                                <span className="truncate text-gray-800 dark:text-gray-200">{tm.name}</span>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Deadline */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={INPUT_BASE_CLS}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional — used for reporting/overdue calculations</p>
                </div>

                {/* Dates */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      required
                      className={INPUT_BASE_CLS}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      End Date
                    </label>
                    <label className="mb-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
                        checked={noEndDate}
                        onChange={(e) => handleToggleNoEndDate(e.target.checked)}
                      />
                      No end date
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleChange}
                      disabled={noEndDate}
                      min={formData.startDate}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-800/70"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
              <div className="flex flex-col items-stretch justify-end gap-3 sm:flex-row">
                <button type="button" onClick={onCancel} disabled={saving} className={BTN_SECONDARY_CLS}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !isValid}
                  aria-disabled={saving || !isValid}
                  className={BTN_PRIMARY_CLS}
                >
                  {saving ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Project"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export { CreateProjectForm, DEFAULT_TIMEZONE, DATE_FORMAT, DATE_TIME_LOCAL_FORMAT, PRIORITY_OPTIONS, VISIBILITY_OPTIONS };
