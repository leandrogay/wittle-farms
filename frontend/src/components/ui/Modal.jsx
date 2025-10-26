import React, { useEffect } from "react";

const OVERLAY_CLS =
  "fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50";
const PANEL_CLS =
  "bg-light-bg dark:bg-dark-bg rounded-2xl relative max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-light-border dark:border-dark-border";

const Modal = ({ isOpen, onClose, children, ariaLabel = "Modal dialog" }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className={OVERLAY_CLS} onClick={() => onClose?.()} aria-hidden={false}>
      <div
        className={PANEL_CLS}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export { Modal };