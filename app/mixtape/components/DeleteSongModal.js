import { formatSongDate } from "../mixtapeUtils";
import ModalShell from "./ModalShell";

export default function DeleteSongModal({
  deleting,
  deleteError,
  deleteTarget,
  onClose,
  onDelete,
}) {
  if (!deleteTarget) return null;

  return (
    <ModalShell title="Delete song" onClose={onClose} zIndex={10000}>
      <div className="ui-fieldLabel">Delete this entry?</div>
      <div className="ui-deletePreview">
        <strong>{formatSongDate(deleteTarget.date)}</strong> |{" "}
        <strong>{deleteTarget.title}</strong> | {deleteTarget.artist}
      </div>

      {deleteError ? <div className="ui-errorInline">{deleteError}</div> : null}

      <div className="ui-actionRow">
        <button type="button" onClick={onClose} disabled={deleting}>
          Cancel
        </button>
        <button type="button" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}
