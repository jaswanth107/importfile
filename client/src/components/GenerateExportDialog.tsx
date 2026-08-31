import { useState } from "react";
import type { ExportFileSummary } from "../api/types";
import { Button } from "./Button";

type Mode = "new" | "existing";

export function GenerateExportDialog({
  files,
  onCancel,
  onGenerate,
  generating = false,
}: {
  files: ExportFileSummary[];
  onCancel: () => void;
  onGenerate: (input: { mode: "new"; name: string } | { mode: "existing"; targetId: string }) => void;
  generating?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(files.length === 0 ? "new" : "existing");
  const [name, setName] = useState("");
  const [targetId, setTargetId] = useState(files[0]?.id ?? "");

  function handleSubmit() {
    if (mode === "new") {
      if (!name.trim()) return;
      onGenerate({ mode: "new", name: name.trim() });
    } else {
      if (!targetId) return;
      onGenerate({ mode: "existing", targetId });
    }
  }

  const canSubmit = mode === "new" ? name.trim().length > 0 : targetId.length > 0;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate clean sheet">
      <div className="modal">
        <h2>Generate a clean sheet</h2>
        <p className="section-subtitle">
          Choose whether this generation should start a brand-new file, or be merged into a file you've already
          generated.
        </p>

        <div className="filter-tabs export-mode-tabs">
          <button
            type="button"
            className={`filter-tab ${mode === "new" ? "filter-tab-active" : ""}`}
            onClick={() => setMode("new")}
          >
            New File
          </button>
          <button
            type="button"
            className={`filter-tab ${mode === "existing" ? "filter-tab-active" : ""}`}
            onClick={() => setMode("existing")}
            disabled={files.length === 0}
          >
            Existing File
          </button>
        </div>

        {mode === "new" ? (
          <label className="export-dialog-field">
            File name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 Onboarding List"
              autoFocus
            />
          </label>
        ) : files.length === 0 ? (
          <p className="row-reason">You don't have any generated files yet. Create a new one first.</p>
        ) : (
          <label className="export-dialog-field">
            Add to
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.rowCount} rows)
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel} disabled={generating}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={generating || !canSubmit}>
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
