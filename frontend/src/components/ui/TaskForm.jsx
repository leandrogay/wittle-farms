// TaskForm.jsx
import { useEffect, useState } from "react";
import {
  getProjectsByUserId,
  getTeamMembersByProjectId,
  createTask,
} from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault("Asia/Singapore");

export default function TaskForm({ onCancel, defaultProjectId, onCreated }) {
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    notes: "",
    assignedProject: defaultProjectId || "",
    assignedTeamMembers: [],
    status: "To Do",
    priority: "Low",
    deadline: dayjs().tz().format("YYYY-MM-DDTHH:mm"),
    createdBy: user.id,
    attachments: [],
  });

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjectsByUserId(user.id);
        setProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [user.id, defaultProjectId]);

  useEffect(() => {
    async function loadTeamMembers() {
      if (!formData.assignedProject) {
        setTeamMembers([]);
        return;
      }
      try {
        const data = await getTeamMembersByProjectId(formData.assignedProject);
        setTeamMembers(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      }
    }
    loadTeamMembers();
  }, [formData.assignedProject]);

  function handleChange(e) {
    const { name, value, files, options, type } = e.target;

    if (type === "file") {
      setFormData((prev) => ({ ...prev, [name]: files }));
    } else if (type === "select-multiple") {
      const selectedValues = Array.from(options)
        .filter((option) => option.selected)
        .map((option) => option.value);
      setFormData((prev) => ({ ...prev, [name]: selectedValues }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  }

  function removeAttachment(fileIndex) {
    if (!formData.attachments) return;
    const filesArray = Array.from(formData.attachments);
    filesArray.splice(fileIndex, 1);

    const dt = new DataTransfer();
    filesArray.forEach((file) => dt.items.add(file));

    setFormData((prev) => ({
      ...prev,
      attachments: dt.files,
    }));
  }

  function handleAssigneeToggle(memberId) {
    setFormData((prev) => ({
      ...prev,
      assignedTeamMembers: prev.assignedTeamMembers.includes(memberId)
        ? prev.assignedTeamMembers.filter((id) => id !== memberId)
        : [...prev.assignedTeamMembers, memberId],
    }));
  }

  function removeAssignee(memberId) {
    setFormData((prev) => ({
      ...prev,
      assignedTeamMembers: prev.assignedTeamMembers.filter((id) => id !== memberId),
    }));
  }

  function getSelectedTeamMemberNames() {
    return teamMembers
      .filter((tm) => formData.assignedTeamMembers.includes(tm._id))
      .map((tm) => tm.name);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      const deadlineIso = dayjs
        .tz(formData.deadline, "YYYY-MM-DDTHH:mm", "Asia/Singapore")
        .toISOString();

      const payload = {
        ...formData,
        deadline: deadlineIso,
      };

      const data = await createTask(payload);
      console.log("Task created:", data);
      onCreated?.(data); 
      onCancel();
    } catch (err) {
      alert("Error creating task: " + err.message);
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (!event.target.closest(".assignee-dropdown-container")) {
        setShowAssigneeDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[800px] max-h-[90vh] overflow-hidden mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col max-h-[90vh] w-full">
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Create New Task</h2>
          <p className="text-gray-600 text-sm mt-1">
            Fill in the details to create a new task
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-400">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
              <div className="lg:col-span-2 space-y-4 min-w-0">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Enter a clear, descriptive title"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Describe the task in detail..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Any additional information or context..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Attachments
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-gray-400 transition-colors">
                    <input
                      type="file"
                      name="attachments"
                      multiple
                      onChange={handleChange}
                      className="w-full text-xs text-gray-600
                                 file:mr-3 file:py-1 file:px-3
                                 file:rounded-full file:border-0
                                 file:text-xs file:font-medium
                                 file:bg-blue-50 file:text-blue-700
                                 hover:file:bg-blue-100 file:cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Upload files, images, or documents
                    </p>
                  </div>

                  {formData.attachments && formData.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {Array.from(formData.attachments).map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center bg-gray-50 text-gray-700 text-xs px-2 py-1 rounded-full border group hover:bg-gray-100 transition-colors"
                        >
                          <svg
                            className="w-3 h-3 mr-1 text-gray-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="truncate max-w-[80px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="ml-1 text-gray-400 hover:text-red-500 font-bold transition-colors text-sm"
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
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Project *
                  </label>
                  <select
                    name="assignedProject"
                    value={formData.assignedProject}
                    onChange={handleChange}
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex justify-between items-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  >
                    <option value="">
                      {projects.length ? "Select a project" : "No projects found"}
                    </option>
                    {projects.map((p, idx) => (
                      <option key={p._id || idx} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="assignee-dropdown-container relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Assignees
                  </label>

                  {formData.assignedTeamMembers.length > 0 && (
                    <div className="mb-2 w-[250px] overflow-hidden">
                      <div className="grid grid-cols-2 gap-1 max-h-20 overflow-y-auto">
                        {getSelectedTeamMemberNames().map((name, idx) => (
                          <div
                            key={idx}
                            className="flex items-center bg-blue-100 text-blue-800 text-xs px-1 py-1 rounded-full min-w-0 max-w-[120px]"
                          >
                            <div className="w-3 h-3 bg-blue-200 rounded-full mr-1 flex items-center justify-center text-xs font-medium shrink-0">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate text-xs min-w-0 flex-1">
                              {name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                removeAssignee(formData.assignedTeamMembers[idx])
                              }
                              className="ml-1 text-blue-600 hover:text-blue-800 font-bold text-xs shrink-0 w-3 h-3 flex items-center justify-center"
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
                    onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                    className="w-full max-w-[250px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex justify-between items-center focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <span className="text-gray-600 truncate min-w-0 flex-1">
                      {formData.assignedTeamMembers.length > 0
                        ? `${formData.assignedTeamMembers.length} selected`
                        : "Select team members"}
                    </span>
                    <svg
                      className="w-4 h-4 transition-transform text-gray-400 shrink-0 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={showAssigneeDropdown ? "M19 15l-7-7-7 7" : "M19 9l-7 7-7-7"}
                      />
                    </svg>
                  </button>

                  {showAssigneeDropdown && (
                    <div className="absolute z-20 w-[250px] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {teamMembers.length === 0 ? (
                        <div className="p-3 text-gray-500 text-center text-sm">
                          No team members found
                        </div>
                      ) : (
                        <div className="p-1">
                          {teamMembers.map((tm) => (
                            <label
                              key={tm._id}
                              className="flex items-center p-2 hover:bg-gray-50 cursor-pointer rounded-md transition-colors min-w-0"
                            >
                              <input
                                type="checkbox"
                                checked={formData.assignedTeamMembers.includes(tm._id)}
                                onChange={() => handleAssigneeToggle(tm._id)}
                                className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shrink-0"
                              />
                              <div className="flex items-center min-w-0 flex-1">
                                <div className="w-6 h-6 bg-gray-200 rounded-full mr-2 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                                  {tm.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-gray-700 truncate min-w-0">
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
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Deadline
                  </label>
                  <input
                    type="datetime-local"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    min={dayjs().tz().format("YYYY-MM-DDTHH:mm")}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                Create Task
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
