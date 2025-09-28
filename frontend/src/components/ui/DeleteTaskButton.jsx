import { useState } from "react";
import Modal from "./Modal";
import { deleteTask } from "../../services/api.js";

export default function DeleteTaskButton({ 
  children = "Delete Task", 
  task, 
  onTaskDeleted // New callback prop
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  const handleDelete = async () => {
    try {
      await deleteTask(task._id);
      setShowConfirmation(false);
      
      // Trigger refresh through callback
      if (onTaskDeleted) {
        onTaskDeleted(task._id);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className="p-6">
      <button
        onClick={() => setShowConfirmation(true)}
        className="px-5 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700"
      >
        {children}
      </button>
      
      <Modal isOpen={showConfirmation} onClose={() => setShowConfirmation(false)}>
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-4">
            Are you sure you want to delete {task.title}?
          </h1>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              className="px-5 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700"
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setShowConfirmation(false)}
              className="px-5 py-2 bg-gray-300 text-gray-700 rounded-lg shadow hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}