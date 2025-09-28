import { useState } from "react";
import TaskForm from "./TaskForm.jsx";
import Modal from "./Modal";

/**
 * TaskFormButton can be used for both creating and editing a task.
 * 

 * @param {object} task - Task data for editing
 * @param {function} onCreated - Callback after create
 * @param {function} onUpdated - Callback after update
 */
export default function TaskFormButton({
  children = "edit",
  task = null,
  onCreated,
  onUpdated,
}) {
  const [showForm, setShowForm] = useState(false);

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
          onCreated={onCreated}
          onUpdated={onUpdated}
          task={task}
        />
      </Modal>
    </div>
  );
}
