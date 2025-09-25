import { useEffect, useState } from "react";
import { getProjectsByUserId, createTask } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function TaskForm({ onCancel }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    notes: "",
    assignedProject: "",
    assignedTeamMembers: [],
    status: "To Do",
    priority: "Low",
    deadline: new Date(),
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
  }, []);

  function handleChange(e) {
    const { name, value, files, options, type, multiple } = e.target;

    if (type === "file") {
      setFormData(prev => ({ ...prev, [name]: files }));
    } else if (type === "select-multiple") {
      const selectedValues = Array.from(options)
        .filter(option => option.selected)
        .map(option => option.value);
      setFormData(prev => ({ ...prev, [name]: selectedValues }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      const data = await createTask(formData);
      console.log("Task created:", data);
      alert("Task created successfully!"); // TODO: Potentially improve with Toast
      onCancel();
    } catch (err) {
      alert("Error creating task: " + err.message);
    }

  }

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-4xl">
      <h2 className="text-xl font-semibold mb-4">Create New Task</h2>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p>Loading projects...</p>
      ) : (
        <div className="grid grid-cols-5 grid-rows-6 gap-5">
          {/* Title + Description */}
          <div className="col-span-4 row-span-4 flex flex-col">
            <div className="mb-3">
              <label className="block mb-1 text-sm font-medium">Title</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter task title"
                className="w-full rounded-lg border border-gray-300 p-2"
                required
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block mb-1 text-sm font-medium">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Task details"
                className="w-full flex-1 rounded-lg border border-gray-300 p-2 resize-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="col-span-4 col-start-1 row-start-5">
            <label className="block mb-2 text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              rows={2}
              value={formData.notes}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2 resize-none"
            />
          </div>

          {/* Attachments */}
          <div className="col-span-4 col-start-1 row-start-6">
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Attachments
            </label>
            <input
              type="file"
              name="attachments"
              multiple
              onChange={handleChange}
              className="w-full text-sm text-blue-700 border border-gray-300 rounded-md p-2 bg-white 
                         file:border-0 file:bg-blue-600 file:text-white file:rounded-md 
                         file:px-3 file:py-1 file:mr-3 hover:file:bg-blue-700 transition"
            />
            {formData.attachments &&
              Array.from(formData.attachments).map((file, idx) => (
                <span
                  key={idx}
                  className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-md mr-2 mt-2"
                >
                  {file.name}
                </span>
              ))}
          </div>

          {/* Project */}
          <div className="col-start-5 row-start-1">
            <label className="block mb-1 text-sm font-medium">Project</label>
            <select
              name="assignedProject"
              value={formData.assignedProject}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
              required
              disabled={projects.length === 0}
            >
              <option value="">
                {projects.length
                  ? "Select a project"
                  : "No projects found"}
              </option>
              {projects.map((p, idx) => (
                <option key={p._id || idx} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div className="row-span-2 col-start-5 row-start-2">
            <label className="block mb-2 text-sm font-medium">Assignee</label>
            <input
              type="text"
              name="assignee"
              value={formData.assignee}
              onChange={handleChange}
              placeholder="e.g., user email or name"
              className="w-full rounded-lg border border-gray-300 p-2"
            />
            {/* TODO: Implement as per project */}
            {/* <select
              name="assignedTeamMembers"
              value={formData.assignedTeamMembers}
              onChange={handleChange}
              multiple
              className="w-full rounded-lg border border-gray-300 p-2"
            >
              {users.map(u => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select> */}
          </div>

          {/* Status */}
          <div className="col-start-5 row-start-4">
            <label className="block mb-2 text-sm font-medium">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
            >
              <option>To Do</option>
              <option>In Progress</option>
              <option>Done</option>
            </select>
          </div>

          {/* Priority */}
          <div className="col-start-5 row-start-5">
            <label className="block mb-2 text-sm font-medium">Priority</label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </div>

          {/* Created / Updated (static placeholder for now) */}
          {/* <div className="col-start-5 row-start-6">
            <div className="shadow-sm rounded-xl p-3 border border-gray-200">
              <p className="text-sm text-gray-600">
                Created at: <span className="font-medium">—</span>
              </p>
              <p className="text-sm text-gray-600">
                Updated at: <span className="font-medium">—</span>
              </p>
            </div>
          </div> */}

        </div>
      )}

      {/* Footer with Cancel + Save */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
        >
          Save Task
        </button>
      </div>
    </form>
  );
}
