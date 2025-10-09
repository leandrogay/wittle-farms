import { useState } from "react";
import TaskForm from "./TaskForm.jsx";
import Modal from "./Modal";

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
    <div>
      <button
        onClick={() => setShowForm(true)}
        className="px-5 py-2 bg-brand-primary text-white rounded-lg shadow hover:bg-blue-700 dark:bg-brand-secondary dark:hover:bg-purple-700 transition-colors font-medium"
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