import React, { useState } from "react";
import { Modal } from "./Modal";
import TaskForm from "./TaskForm";

const DEFAULT_LABEL = "Create Task";
const BTN_PRIMARY_CLS =
  "px-5 py-2 bg-brand-primary text-white rounded-lg shadow hover:bg-blue-700 dark:bg-brand-secondary dark:hover:bg-purple-700 transition-colors font-medium";
const WRAPPER_CLS = "p-6";

const CreateTaskButton = ({ children = DEFAULT_LABEL }) => {
  const [showForm, setShowForm] = useState(false);
  const _open = () => setShowForm(true);
  const _close = () => setShowForm(false);

  return (
    <div className={WRAPPER_CLS}>
      <button type="button" onClick={_open} className={BTN_PRIMARY_CLS} aria-haspopup="dialog">
        {children}
      </button>
      <Modal isOpen={showForm} onClose={_close} ariaLabel="Create task form">
        <TaskForm onCancel={_close} />
      </Modal>
    </div>
  );
};

export { CreateTaskButton, DEFAULT_LABEL };
