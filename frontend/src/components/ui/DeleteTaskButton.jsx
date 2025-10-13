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
      setShowConfirmation(false);
      alert(res.message || "Task deleted successfully");
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
        className="px-5 py-2 bg-danger text-white rounded-lg shadow hover:bg-red-700 transition-colors font-medium"
      >
        {children}
      </button>
     
      <Modal isOpen={showConfirmation} onClose={() => setShowConfirmation(false)}>
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
            Are you sure you want to delete: <br />
            [<span className="font-bold text-danger">{task?.title ?? "this task"}</span>]?
          </h1>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 bg-danger text-white rounded-lg shadow hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={deleting}
              className="px-5 py-2 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-lg shadow hover:bg-light-border dark:hover:bg-dark-border disabled:opacity-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}