import React, { useState } from "react";
import { Modal } from "./Modal";
import { deleteTask } from "../../services/api.js";

const DEFAULT_DELETE_LABEL = "Delete Task";
const BTN_DANGER_CLS =
  "px-5 py-2 bg-danger text-white rounded-lg shadow hover:bg-red-700 transition-colors font-medium";
const BTN_SECONDARY_CLS =
  "px-5 py-2 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-lg shadow hover:bg-light-border dark:hover:bg-dark-border disabled:opacity-50 transition-colors font-medium";

const DeleteTaskButton = ({ children = DEFAULT_DELETE_LABEL, task, onTaskDeleted }) => {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const _open = () => setShowConfirmation(true);
  const _close = () => setShowConfirmation(false);

  const _handleDelete = async () => {
    if (!task?._id) return;
    setDeleting(true);
    try {
      const res = await deleteTask(task._id);
      setShowConfirmation(false);
      alert(res?.message || "Task deleted successfully");
      onTaskDeleted?.(task._id);
    } catch (err) {
      alert(err?.message || "Failed to delete task");
      // eslint-disable-next-line no-console
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={_open} className={BTN_DANGER_CLS} aria-haspopup="dialog">
        {children}
      </button>

      <Modal isOpen={showConfirmation} onClose={_close} ariaLabel="Delete task confirmation">
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
            Are you sure you want to delete: <br />
            [<span className="font-bold text-danger">{task?.title ?? "this task"}</span>]?
          </h1>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={_handleDelete}
              disabled={deleting}
              className={`${BTN_DANGER_CLS} disabled:opacity-50`}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button type="button" onClick={_close} disabled={deleting} className={BTN_SECONDARY_CLS}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export { DeleteTaskButton, DEFAULT_DELETE_LABEL };