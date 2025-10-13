import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  createProject,
  getAllTeamMembers,
  getDepartments,
} from "../../services/api.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault("Asia/Singapore");

export default function CreateProjectForm({
  onCancel,
  onCreated,
  onUpdated,
  project = null,
}) {
  const { user } = useAuth();
  const isEdit = !!project;

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

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        name: project?.name ?? "",
        description: project?.description ?? "",
        priority: project?.priority ?? "Medium",
        visibility: project?.visibility ?? "Team",
        projectLead:
          typeof project?.projectLead === "string"
            ? project.projectLead
            : project?.projectLead?._id ?? "",
        teamMembers: (project?.teamMembers || []).map((m) =>
          typeof m === "string" ? m : m?._id
        ),
        startDate: project?.startDate
          ? dayjs(project.startDate).tz().format("YYYY-MM-DD")
          : dayjs().tz().format("YYYY-MM-DD"),
        endDate: project?.endDate ? dayjs(project.endDate).tz().format("YYYY-MM-DD") : "",
        attachments: [],
        createdBy: project?.createdBy?._id || project?.createdBy || user.id,
      };
    }
    return {
      name: "",
      description: "",
      priority: "Medium",
      visibility: "Team",
      projectLead: user.id,
      teamMembers: [user.id],
      startDate: dayjs().tz().format("YYYY-MM-DD"),
      endDate: "",
      attachments: [],
      createdBy: user.id,
    };
  });

  // Load members & departments
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [memberList, deptList] = await Promise.all([
          getAllTeamMembers(),
          getDepartments(),
        ]);

        if (!cancelled) {
          setMembers(Array.isArray(memberList) ? memberList : []);
          setDepartments(Array.isArray(deptList) ? deptList : []);
          if (isEdit && Array.isArray(project?.department)) {
            setDepartmentIds(
              project.department
                .map((d) => (typeof d === "string" ? d : d?._id))
                .filter(Boolean)
            );
          }
          if (isEdit && project?.deadline) {
            setDeadline(dayjs(project.deadline).tz().format("YYYY-MM-DDTHH:mm"));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load form data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, project]);

  // close dropdown on outside click / Esc
  useEffect(() => {
    function onDocClick(e) {
      if (!showMemberDropdown) return;
      const insideMenu = dropdownRef.current?.contains(e.target);
      const insideBtn = dropdownBtnRef.current?.contains(e.target);
      if (!insideMenu && !insideBtn) setShowMemberDropdown(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setShowMemberDropdown(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showMemberDropdown]);

  const memberMap = useMemo(() => {
    const m = new Map();
    (members || []).forEach((u) => m.set(u._id, u));
    return m;
  }, [members]);

  function handleChange(e) {
    const { name, value, type, files } = e.target;
    if (type === "file") setFormData((p) => ({ ...p, [name]: files }));
    else setFormData((p) => ({ ...p, [name]: value }));
  }

  function toggleMember(id) {
    setFormData((p) => {
      const exists = p.teamMembers.includes(id);
      const next = exists ? p.teamMembers.filter((x) => x !== id) : [...p.teamMembers, id];
      const leadValid = next.includes(p.projectLead);
      return { ...p, teamMembers: next, projectLead: leadValid ? p.projectLead : "" };
    });
  }

  function removeMember(id) {
    toggleMember(id);
  }

  function toggleNoEndDate(checked) {
    setNoEndDate(checked);
    if (checked) setFormData((p) => ({ ...p, endDate: "" }));
  }

  function removeAttachment(idx) {
    if (!formData.attachments?.length) return;
    const files = Array.from(formData.attachments);
    files.splice(idx, 1);
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    setFormData((p) => ({ ...p, attachments: dt.files }));
  }

  // ---------- VALIDATION ----------
  const isValid =
    formData.name.trim().length > 0 &&
    departmentIds.length > 0 &&
    !!formData.projectLead &&
    !!formData.startDate;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid) {
      setError("Please complete all required fields: Name, Department(s), Project Lead, Start Date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: formData.name,
        description: formData.description ?? "",
        departmentIds,                       // helper key
        department: departmentIds,           // common key
        departments: departmentIds,          // alias
        ...(departmentIds.length === 1 ? { departmentId: departmentIds[0] } : {}),
        ...(deadline
          ? {
              deadline: dayjs
                .tz(deadline, "YYYY-MM-DDTHH:mm", "Asia/Singapore")
                .toISOString(),
            }
          : {}),
        createdBy: user.id,
        teamMembers: formData.teamMembers,
        visibility: formData.visibility,
        priority: formData.priority,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        projectLead: formData.projectLead || undefined,
      };
  
      const project = await createProject(payload);
      onCreated?.(project);
      alert("Project created successfully!");
      onCancel?.();
    } catch (e) {
      setError(e.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary" />
      </div>
    );
  }

  const selectedMembers = (formData.teamMembers || [])
    .map((id) => memberMap.get(id))
    .filter(Boolean);

  return (
    <div className="w-[800px] max-h-[90vh] overflow-hidden mx-auto">
      <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-sm border border-light-border dark:border-dark-border flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
            {isEdit ? "Edit Project" : "Create New Project"}
          </h2>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
            {isEdit ? "Update the project details below" : "Fill in details to create a project"}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-priority-high-bg dark:bg-priority-high-bg-dark border-l-4 border-danger">
            <p className="text-priority-high-text dark:text-priority-high-text-dark">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-dark-bg-secondary rounded-b-lg">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Q4 Website Revamp"
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="What is this project about?"
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary resize-none"
                  />
                </div>

                {/* Departments */}
                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Department(s) *
                  </label>
                  <div className="border rounded-lg p-2 bg-light-bg dark:bg-dark-bg-secondary border-light-border dark:border-dark-border max-h-40 overflow-y-auto">
                    {departments.length === 0 ? (
                      <div className="text-sm text-light-text-muted dark:text-dark-text-muted">
                        No departments available
                      </div>
                    ) : (
                      departments.map((d) => (
                        <label key={d._id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={departmentIds.includes(d._id)}
                            onChange={() => {
                              setDepartmentIds((prev) =>
                                prev.includes(d._id)
                                  ? prev.filter((x) => x !== d._id)
                                  : [...prev, d._id]
                              );
                            }}
                            className="w-4 h-4 text-brand-primary dark:text-brand-secondary border-light-border dark:border-dark-border rounded"
                          />
                          <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                            {d.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">
                    Select at least one department.
                  </p>
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    {isEdit ? "Update Attachments" : "Attachments"}
                  </label>
                  <div className="border-2 border-dashed border-light-border dark:border-dark-border rounded-lg p-3 bg-light-surface dark:bg-dark-surface">
                    <input 
                      type="file" 
                      name="attachments" 
                      multiple 
                      onChange={handleChange}
                      className="w-full text-xs text-light-text-secondary dark:text-dark-text-secondary file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-brand-primary file:text-white hover:file:bg-blue-700"
                    />
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                      {isEdit ? "Upload additional files or replace existing ones" : "Upload files, images, or documents"}
                    </p>
                  </div>

                  {formData.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {Array.from(formData.attachments).map((file, idx) => (
                        <div key={idx} className="flex items-center bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary text-xs px-2 py-1 rounded-full border border-light-border dark:border-dark-border">
                          <span className="truncate max-w-[100px]">{file.name}</span>
                          <button 
                            type="button" 
                            onClick={() => removeAttachment(idx)} 
                            className="ml-1 text-light-text-muted dark:text-dark-text-muted hover:text-danger font-bold text-sm"
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
              <div className="space-y-4 w-full max-w-[250px]">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Status
                  </label>
                  <select 
                    name="status" 
                    value={formData.status} 
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
                  >
                    <option>Planned</option>
                    <option>Active</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Priority
                  </label>
                  <select 
                    name="priority" 
                    value={formData.priority} 
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Visibility
                  </label>
                  <select 
                    name="visibility" 
                    value={formData.visibility} 
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
                  >
                    <option value="Private">Private (only you)</option>
                    <option value="Team">Team (project members)</option>
                    <option value="Org">Organisation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Project Lead *
                  </label>
                  <select 
                    name="projectLead" 
                    value={formData.projectLead} 
                    onChange={handleChange} 
                    required
                    className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
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

                <div className="assignee-dropdown-container relative">
                  <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                    Team Members
                  </label>

                  {selectedMembers.length > 0 && (
                    <div className="mb-2 w-[250px]">
                      <div className="grid grid-cols-2 gap-1 max-h-20 overflow-y-auto">
                        {selectedMembers.map((m) => (
                          <div key={m._id} className="flex items-center bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary text-xs px-1 py-1 rounded-full border border-brand-primary/20 dark:border-brand-secondary/20">
                            <div className="w-3 h-3 bg-brand-primary/20 dark:bg-brand-secondary/20 rounded-full mr-1 flex items-center justify-center text-[10px]">
                              {m.name?.charAt(0)?.toUpperCase() || "•"}
                            </div>
                            <span className="truncate">{m.name}</span>
                            <button 
                              type="button" 
                              onClick={() => removeMember(m._id)} 
                              className="ml-1 text-brand-primary dark:text-brand-secondary hover:text-danger font-bold text-xs"
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
                    onClick={() => setShowMemberDropdown((s) => !s)}
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary hover:bg-light-surface dark:hover:bg-dark-surface flex justify-between items-center focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary text-light-text-secondary dark:text-dark-text-secondary"
                  >
                    <span className="truncate">
                      {formData.teamMembers.length ? `${formData.teamMembers.length} selected` : "Select team members"}
                    </span>
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showMemberDropdown && (
                    <div className="absolute z-20 w-[250px] mt-1 bg-light-bg dark:bg-dark-bg-secondary border border-light-border dark:border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      <div className="p-1">
                        {members.length === 0 ? (
                          <div className="p-3 text-light-text-muted dark:text-dark-text-muted text-center text-sm">No members</div>
                        ) : (
                          members.map((tm) => (
                            <label key={tm._id} className="flex items-center p-2 hover:bg-light-surface dark:hover:bg-dark-surface cursor-pointer rounded-md">
                              <input
                                type="checkbox"
                                checked={formData.teamMembers.includes(tm._id)}
                                onChange={() => toggleMember(tm._id)}
                                className="mr-2 w-4 h-4 text-brand-primary dark:text-brand-secondary border-light-border dark:border-dark-border rounded focus:ring-brand-primary dark:focus:ring-brand-secondary"
                              />
                              <div className="flex items-center min-w-0 flex-1">
                                <div className="w-6 h-6 bg-light-surface dark:bg-dark-surface rounded-full mr-2 flex items-center justify-center text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                                  {tm.name?.charAt(0)?.toUpperCase() || "•"}
                                </div>
                                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate">{tm.name}</span>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1 text-light-text-primary dark:text-dark-text-primary">
                      End Date
                    </label>
                    <label className="flex items-center gap-2 mb-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      <input
                        type="checkbox"
                        className="rounded border-light-border dark:border-dark-border"
                        checked={noEndDate}
                        onChange={(e) => toggleNoEndDate(e.target.checked)}
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
                      className="w-full px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary disabled:bg-light-surface dark:disabled:bg-dark-surface disabled:text-light-text-muted dark:disabled:text-dark-text-muted"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4 pt-3 border-t border-light-border dark:border-dark-border">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="px-4 py-2 text-sm border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !isValid}
                aria-disabled={saving || !isValid}
                className={`px-4 py-2 text-sm rounded-lg font-medium shadow-sm ${
                  isEdit 
                    ? "bg-success text-white hover:bg-emerald-600" 
                    : "bg-brand-primary text-white hover:bg-blue-700"
                }`}
              >
                {saving ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
