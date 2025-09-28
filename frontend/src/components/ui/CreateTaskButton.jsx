import { useState } from "react";
import TaskForm from "./TaskForm";
import Modal from "./Modal";

export default function TaskButton({ children }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="p-6">
      <button
        onClick={() => setShowForm(true)}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
      >
        { children }
      </button>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <TaskForm onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}
