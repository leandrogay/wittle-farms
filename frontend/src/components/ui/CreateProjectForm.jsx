import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { createProject, getAllTeamMembers } from "../../services/api.js";

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
  project = null, // pass when editing
}) {
  const { user } = useAuth();
  const isEdit = !!project;

  const [members, setMembers] = useState([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [noEndDate, setNoEndDate] = useState(() => (isEdit ? !project?.endDate : false));

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        name: project?.name ?? "",
        description: project?.description ?? "",
        status: project?.status ?? "Planned",
        priority: project?.priority ?? "Medium",
        visibility: project?.visibility ?? "Team",
        projectLead:
          typeof project?.projectLead === "string"
            ? project.projectLead
            : project?.projectLead?._id ?? "",
        teamMembers: (project?.teamMembers || []).map((m) => (typeof m === "string" ? m : m?._id)),
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
      status: "Planned",
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getAllTeamMembers();
        if (!cancelled) setMembers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load team members");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Minimal payload; the API will add timestamps and refetch populated doc
      const payload = {
        name: formData.name,
        description: formData.description,
        createdBy: user.id,
        teamMembers: formData.teamMembers,
      };
  
      const project = await createProject(payload); // ← now returns populated shape
      onCreated?.(project);                         // matches your desired format
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const selectedMembers = (formData.teamMembers || [])
    .map((id) => memberMap.get(id))
    .filter(Boolean);

  return (
    <div className="w-[800px] max-h-[90vh] overflow-hidden mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-xl font-bold">
            {isEdit ? "Edit Project" : "Create New Project"}
          </h2>
          <p className="text-gray-600 text-sm">
            {isEdit ? "Update the project details below" : "Fill in details to create a project"}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-400">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">Project Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Q4 Website Revamp"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="What is this project about?"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    {isEdit ? "Update Attachments" : "Attachments"}
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-3">
                    <input type="file" name="attachments" multiple onChange={handleChange}
                      className="w-full text-xs text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {isEdit ? "Upload additional files or replace existing ones" : "Upload files, images, or documents"}
                    </p>
                  </div>

                  {formData.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {Array.from(formData.attachments).map((file, idx) => (
                        <div key={idx} className="flex items-center bg-gray-50 text-gray-700 text-xs px-2 py-1 rounded-full border">
                          <span className="truncate max-w-[100px]">{file.name}</span>
                          <button type="button" onClick={() => removeAttachment(idx)} className="ml-1 text-gray-400 hover:text-red-500 font-bold text-sm">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="space-y-4 w-full max-w-[250px]">
                <div>
                  <label className="block text-sm font-semibold mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option>Planned</option>
                    <option>Active</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Priority</label>
                  <select name="priority" value={formData.priority} onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Visibility</label>
                  <select name="visibility" value={formData.visibility} onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="Private">Private (only you)</option>
                    <option value="Team">Team (project members)</option>
                    <option value="Org">Organisation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Project Lead *</label>
                  <select name="projectLead" value={formData.projectLead} onChange={handleChange} required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">Select a lead</option>
                    {members
                      .filter((m) => formData.teamMembers.includes(m._id))
                      .map((m) => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                  </select>
                </div>

                <div className="assignee-dropdown-container relative">
                  <label className="block text-sm font-semibold mb-1">Team Members</label>

                  {selectedMembers.length > 0 && (
                    <div className="mb-2 w-[250px]">
                      <div className="grid grid-cols-2 gap-1 max-h-20 overflow-y-auto">
                        {selectedMembers.map((m) => (
                          <div key={m._id} className="flex items-center bg-blue-100 text-blue-800 text-xs px-1 py-1 rounded-full">
                            <div className="w-3 h-3 bg-blue-200 rounded-full mr-1 flex items-center justify-center text-[10px]">
                              {m.name?.charAt(0)?.toUpperCase() || "•"}
                            </div>
                            <span className="truncate">{m.name}</span>
                            <button type="button" onClick={() => removeMember(m._id)} className="ml-1 text-blue-600 hover:text-blue-800 font-bold text-xs">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowMemberDropdown((s) => !s)}
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex justify-between items-center focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="text-gray-600 truncate">
                      {formData.teamMembers.length ? `${formData.teamMembers.length} selected` : "Select team members"}
                    </span>
                    <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showMemberDropdown && (
                    <div className="absolute z-20 w-[250px] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      <div className="p-1">
                        {members.length === 0 ? (
                          <div className="p-3 text-gray-500 text-center text-sm">No members</div>
                        ) : (
                          members.map((tm) => (
                            <label key={tm._id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer rounded-md">
                              <input
                                type="checkbox"
                                checked={formData.teamMembers.includes(tm._id)}
                                onChange={() => toggleMember(tm._id)}
                                className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex items-center min-w-0 flex-1">
                                <div className="w-6 h-6 bg-gray-200 rounded-full mr-2 flex items-center justify-center text-xs font-medium text-gray-600">
                                  {tm.name?.charAt(0)?.toUpperCase() || "•"}
                                </div>
                                <span className="text-sm font-medium text-gray-700 truncate">{tm.name}</span>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Start Date *</label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1">End Date</label>
                    <label className="flex items-center gap-2 mb-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
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
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`px-4 py-2 text-sm rounded-lg font-medium shadow-sm ${
                  isEdit ? "bg-green-600 text-white hover:bg-green-700" : "bg-blue-600 text-white hover:bg-blue-700"
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
