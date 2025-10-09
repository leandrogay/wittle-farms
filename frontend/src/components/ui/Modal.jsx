export default function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-light-bg dark:bg-dark-bg rounded-2xl relative max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-light-border dark:border-dark-border">
        {children}
      </div>
    </div>
  );
}