import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmImport, sampleTemplateUrl, uploadPreview } from "../api/client";
import { ApiError } from "../api/client";
import type { FieldKey, ImportPreview, PreviewResponse } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PreviewView } from "../components/PreviewView";
import { ConfirmImportDialog } from "../components/ConfirmImportDialog";
import "./ImportWizard.css";

type Step = "upload" | "mapping" | "loading" | "preview" | "confirming" | "success";

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  joiningDate: "Joining Date",
};

export function ImportWizard() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingInfo, setMappingInfo] = useState<PreviewResponse | null>(null);
  const [manualMapping, setManualMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ counts: Record<string, number> } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  function pickFile(f: File) {
    setError(null);
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function generatePreview(mapping?: Partial<Record<FieldKey, string>>) {
    if (!file) return;
    setStep("loading");
    setError(null);
    try {
      const result = await uploadPreview(file, mapping);
      if (result.needsMapping) {
        setMappingInfo(result);
        setStep("mapping");
        return;
      }
      setPreview(result.preview);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't process this file. Please try again.");
      setStep("upload");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setStep("confirming");
    try {
      const result = await confirmImport(preview.importId);
      setConfirmResult(result);
      setStep("success");
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't complete the import. No changes were saved.");
      setStep("preview");
      setConfirmOpen(false);
    }
  }

  function resetWizard() {
    setFile(null);
    setPreview(null);
    setMappingInfo(null);
    setManualMapping({});
    setConfirmResult(null);
    setError(null);
    setStep("upload");
  }

  return (
    <div className="wizard">
      <header className="page-header">
        <h1>Import People</h1>
        <p className="page-subtitle">Upload a CSV or Excel file. We'll show you exactly what will change before anything is saved.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {step === "upload" && (
        <UploadStep
          file={file}
          dragOver={dragOver}
          fileInputRef={fileInputRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onPick={pickFile}
          onRemove={() => setFile(null)}
          onContinue={() => generatePreview()}
          onShowHelp={() => setShowHelp(true)}
        />
      )}

      {step === "loading" && <LoadingState />}

      {step === "mapping" && mappingInfo && (
        <MappingStep
          headers={mappingInfo.headers}
          mapping={mappingInfo.mapping}
          unmapped={mappingInfo.unmapped}
          manualMapping={manualMapping}
          setManualMapping={setManualMapping}
          onSubmit={() => generatePreview({ ...mappingInfo.mapping, ...manualMapping })}
          onCancel={resetWizard}
        />
      )}

      {step === "preview" && preview && (
        <PreviewView preview={preview} onConfirm={() => setConfirmOpen(true)} onRestart={resetWizard} />
      )}

      {step === "confirming" && <LoadingState message="Importing people..." />}

      {step === "success" && preview && confirmResult && (
        <SuccessStep
          preview={preview}
          counts={confirmResult.counts}
          onImportAnother={resetWizard}
          onViewHistory={() => navigate(`/history/${preview.importId}`)}
        />
      )}

      {confirmOpen && preview && (
        <ConfirmImportDialog preview={preview} onCancel={() => setConfirmOpen(false)} onConfirm={handleConfirm} />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function UploadStep({
  file,
  dragOver,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onRemove,
  onContinue,
  onShowHelp,
}: {
  file: File | null;
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: (f: File) => void;
  onRemove: () => void;
  onContinue: () => void;
  onShowHelp: () => void;
}) {
  return (
    <Card>
      {!file ? (
        <div
          className={`dropzone ${dragOver ? "dropzone-active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="dropzone-icon">⇪</div>
          <div className="dropzone-title">Drop your file here</div>
          <div className="dropzone-subtitle">CSV &bull; XLSX &bull; XLS</div>
          <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
            Choose File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
        </div>
      ) : (
        <div className="file-preview">
          <div className="file-preview-info">
            <div className="file-icon">📄</div>
            <div>
              <div className="file-name">{file.name}</div>
              <div className="file-meta">{(file.size / 1024).toFixed(1)} KB</div>
            </div>
          </div>
          <div className="file-preview-actions">
            <Button variant="ghost" onClick={onRemove}>
              Remove
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose Another File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
              }}
            />
            <Button variant="primary" onClick={onContinue}>
              Generate Preview
            </Button>
          </div>
        </div>
      )}

      <div className="upload-footer">
        <a href={sampleTemplateUrl()} download>
          Download Sample Template
        </a>
        <button className="link-button" onClick={onShowHelp}>
          How should my file look?
        </button>
      </div>
    </Card>
  );
}

function LoadingState({ message }: { message?: string }) {
  return (
    <Card className="loading-card">
      <div className="spinner" aria-hidden="true" />
      <div>{message ?? "Checking your data..."}</div>
    </Card>
  );
}

function MappingStep({
  headers,
  mapping,
  unmapped,
  manualMapping,
  setManualMapping,
  onSubmit,
  onCancel,
}: {
  headers: string[];
  mapping: Partial<Record<FieldKey, string>>;
  unmapped: FieldKey[];
  manualMapping: Partial<Record<FieldKey, string>>;
  setManualMapping: (m: Partial<Record<FieldKey, string>>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const fields: FieldKey[] = ["name", "email", "phone", "joiningDate"];
  const ready = fields.every((f) => mapping[f] || manualMapping[f]);

  return (
    <Card>
      <h2 className="section-title">Map your columns</h2>
      <p className="section-subtitle">
        We couldn't confidently detect every required column. Please match each application field to a column from your file.
      </p>
      <div className="mapping-grid">
        {fields.map((field) => (
          <div className="mapping-row" key={field}>
            <div className="mapping-field">
              {FIELD_LABELS[field]}
              {unmapped.includes(field) ? null : <span className="mapping-auto"> (auto-detected)</span>}
            </div>
            <select
              value={manualMapping[field] ?? mapping[field] ?? ""}
              onChange={(e) => setManualMapping({ ...manualMapping, [field]: e.target.value })}
            >
              <option value="">Select a column…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mapping-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!ready} onClick={onSubmit}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function SuccessStep({
  preview,
  counts,
  onImportAnother,
  onViewHistory,
}: {
  preview: ImportPreview;
  counts: Record<string, number>;
  onImportAnother: () => void;
  onViewHistory: () => void;
}) {
  return (
    <Card className="success-card">
      <div className="success-icon">✓</div>
      <h2>Import completed!</h2>
      <ul className="confirm-list">
        <li>{counts.created} people created</li>
        <li>{counts.updated} people updated</li>
        <li>{counts.skipped} skipped</li>
        <li>{counts.rejected} rejected</li>
      </ul>
      <p className="success-note">Your data is safe and up to date.</p>
      <div className="success-actions">
        <Button variant="secondary" onClick={onViewHistory}>
          View Report
        </Button>
        <a href={`/api/import/${preview.importId}/report.json`} download>
          <Button variant="secondary">Download Report</Button>
        </a>
        <Button variant="primary" onClick={onImportAnother}>
          Import Another File
        </Button>
      </div>
    </Card>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Import help">
      <div className="modal">
        <h2>How should my file look?</h2>
        <p>Required columns:</p>
        <ul className="help-list">
          <li>Name</li>
          <li>Email</li>
          <li>Phone</li>
          <li>Joining Date</li>
        </ul>
        <p>Email identifies a person. Phone numbers are normalized. Invalid rows are rejected.</p>
        <p>You can review everything before importing.</p>
        <div className="modal-actions">
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
