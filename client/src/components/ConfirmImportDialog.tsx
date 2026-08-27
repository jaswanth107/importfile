import type { ImportPreview } from "../api/types";
import { Button } from "./Button";

export function ConfirmImportDialog({
  preview,
  onCancel,
  onConfirm,
  confirming = false,
}: {
  preview: ImportPreview;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const totalChanges = preview.counts.created + preview.counts.updated;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm import">
      <div className="modal">
        <h2>You're about to make these changes</h2>
        <ul className="confirm-list">
          <li>{preview.counts.created} people created</li>
          <li>{preview.counts.updated} people updated</li>
          <li>{preview.counts.skipped} skipped</li>
          <li>{preview.counts.rejected} rejected</li>
        </ul>
        <p className="confirm-total">{totalChanges} database changes will be made.</p>
        {preview.counts.rejected > 0 && <p className="confirm-note">Rejected rows will NOT be imported.</p>}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Confirming..." : "Confirm Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
