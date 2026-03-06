export default function ModalShell({
  children,
  onClose,
  title,
  zIndex = 9999,
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="ui-modalOverlay"
      style={{ zIndex }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="card ui-modalCard"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ui-modalHeader">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
