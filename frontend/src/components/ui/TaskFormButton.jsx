import { useState } from "react";
import TaskForm from "./TaskForm.jsx";
import Modal from "./Modal";

/**
 * TaskFormButton can be used for both creating and editing a task.
 *
 * @param {object} task - Task data for editing
 * @param {function} onTaskCreated - Callback after create
 * @param {function} onTaskUpdated - Callback after update
 */
export default function TaskFormButton({
  children = "Edit Task",
  task = null,
  onTaskCreated,
  onTaskUpdated,
}) {
  const [showForm, setShowForm] = useState(false);

  const handleTaskCreated = (newTask) => {
    setShowForm(false);
    if (onTaskCreated) {
      onTaskCreated(newTask);
    }
  };

  const handleTaskUpdated = (updatedTask) => {
    setShowForm(false);
    if (onTaskUpdated) {
      onTaskUpdated(updatedTask);
    }
  };

  return (
    <div className="p-6">
      <button
        onClick={() => setShowForm(true)}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
      >
        {children}
      </button>
      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <TaskForm
          onCancel={() => setShowForm(false)}
          onCreated={handleTaskCreated}
          onUpdated={handleTaskUpdated}
          task={task}
        />
      </Modal>
    </div>
  );
}