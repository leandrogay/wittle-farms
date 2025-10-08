import { useState } from "react";
import Modal from "./Modal";
import { deleteTask } from "../../services/api.js";

export default function DeleteTaskButton({ 
  children = "Delete Task", 
  task, 
  onTaskDeleted 
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteTask(task._id);
      // Close modal
      setShowConfirmation(false);
      // Show success message from backend if present
      alert(res.message || "Task deleted successfully");
      // Update parent
      onTaskDeleted?.(task._id);
    } catch (err) {
      alert(err.message || "Failed to delete task");
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => setShowConfirmation(true)}
        className="px-5 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700"
      >
        {children}
      </button>
      
      <Modal isOpen={showConfirmation} onClose={() => setShowConfirmation(false)}>
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-4">
            Are you sure you want to delete: <br></br>[<span className="font-bold">{task?.title ?? "this task"}</span>]?
          </h1>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={deleting}
              className="px-5 py-2 bg-gray-300 text-gray-700 rounded-lg shadow hover:bg-gray-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
