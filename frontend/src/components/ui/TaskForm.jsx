import { useEffect, useState } from "react";
import { getProjectNamesByUserId } from "../../services/api.js";

export default function TaskForm() {
  const [projectNames, setProjectNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    project: "",
    title: "",
    description: "",
    assignee: "",
    status: "To Do",
    priority: "Low",
    notes: "",
    attachments: null,
  });

  useEffect(() => {
    async function loadProjectNames() {
      try {
        const data = await getProjectNamesByUserId("68d105001122a3d207eacebc"); // TODO: fetch from session
        setProjectNames(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadProjectNames();
  }, []);

  function handleChange(e) {
    const { name, value, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: files ? files : value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Example validation: project + title required
    if (!formData.project || !formData.title.trim()) {
      alert("Please select a project and enter a title.");
      return;
    }
    console.log("Submitted task:", formData);
    // TODO: call your /api/tasks create endpoint
  }

  // Make names unique and sorted (optional nicety)
  const projectOptions = [...new Set(projectNames)].sort((a, b) =>
    a.localeCompare(b)
  );

  return (
    <form onSubmit={handleSubmit} className="p-4">
      {error && <p className="text-red-500">{error}</p>}

      {loading ? (
        <p>Loading projects...</p>
      ) : (
        <div className="grid grid-cols-5 grid-rows-6 gap-3 shadow-md rounded-2xl p-4 bg-white">
          {/* Title + Description */}
          <div className="col-span-4 row-span-4 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Enter task title"
              className="w-full rounded-lg border border-gray-300 p-2 mb-3 focus:ring-2 focus:ring-blue-500"
              required
            />

            <label className="block mb-2 text-sm font-medium">Description</label>
            <textarea
              name="description"
              rows={4}
              value={formData.description}
              onChange={handleChange}
              placeholder="Task details"
              className="w-full rounded-lg border border-gray-300 p-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Project (replaces Created By) */}
          <div className="col-start-5 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Project</label>
            <select
              name="project"
              value={formData.project}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
              required
              disabled={projectOptions.length === 0}
            >
              <option value="">
                {projectOptions.length ? "Select a project" : "No projects found"}
              </option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div className="col-start-5 row-start-2 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Assignee</label>
            <input
              type="text"
              name="assignee"
              value={formData.assignee}
              onChange={handleChange}
              placeholder="e.g., user email or name"
              className="w-full rounded-lg border border-gray-300 p-2"
            />
          </div>

          {/* Status */}
          <div className="col-start-5 row-start-3 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
            >
              <option>To Do</option>
              <option>In Progress</option>
              <option>Blocked</option>
              <option>Done</option>
            </select>
          </div>

          {/* Priority */}
          <div className="col-start-5 row-start-4 shadow-md rounded-2xl p-3">
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
              <option>Critical</option>
            </select>
          </div>

          {/* Created + Updated (read-only placeholders) */}
          <div className="row-span-2 col-start-5 row-start-5 shadow-md rounded-2xl p-3">
            <p className="text-sm text-gray-600">
              Created at: <span className="font-medium">—</span>
            </p>
            <p className="text-sm text-gray-600">
              Updated at: <span className="font-medium">—</span>
            </p>
          </div>

          {/* Notes */}
          <div className="col-span-4 col-start-1 row-start-5 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              rows={2}
              value={formData.notes}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 p-2"
            />
          </div>

          {/* Attachments */}
          <div className="col-span-4 row-start-6 shadow-md rounded-2xl p-3">
            <label className="block mb-2 text-sm font-medium">Attachments</label>
            <input
              type="file"
              name="attachments"
              multiple
              onChange={handleChange}
              className="w-full text-sm text-gray-700"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
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
