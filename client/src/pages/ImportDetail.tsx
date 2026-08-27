import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, confirmImport, downloadReport, getImportDetail, rollbackImport } from "../api/client";
import type { ImportPreview } from "../api/types";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { PreviewView } from "../components/PreviewView";
import { ConfirmImportDialog } from "../components/ConfirmImportDialog";
import "./pages.css";

export function ImportDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function load() {
    if (!id) return;
    getImportDetail(id)
      .then(setRun)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this import."));
  }

  useEffect(load, [id]);

  async function handleConfirm() {
    if (!id) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmImport(id);
      setConfirmOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't complete the import. No changes were saved.");
      setConfirmOpen(false);
    } finally {
      setConfirming(false);
    }
  }

  async function handleRollback() {
    if (!id) return;
    setRollingBack(true);
    setError(null);
    try {
      const result = await rollbackImport(id);
      setRollbackMessage(
        `Rolled back: ${result.deleted} deleted, ${result.restored} restored${
          result.skipped ? `, ${result.skipped} skipped because records changed since import` : ""
        }.`
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rollback failed.");
    } finally {
      setRollingBack(false);
    }
  }

  if (error && !run) return <div className="alert alert-error">{error}</div>;
  if (!run) return <div className="page-loading">Loading import report...</div>;

  const storedPreview: ImportPreview | null = run.previewJson ? JSON.parse(run.previewJson) : null;

  return (
    <div>
      <header className="page-header">
        <h1>{run.id}</h1>
        <p className="page-subtitle">{run.fileName}</p>
      </header>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {rollbackMessage && <div className="alert alert-info" style={{ marginBottom: 16 }}>{rollbackMessage}</div>}

      <Card style={{ marginBottom: 20 }}>
        <div className="summary-counts">
          <SummaryStat label="Total" value={run.totalRows} />
          <SummaryStat label="Created" value={run.created} />
          <SummaryStat label="Updated" value={run.updated} />
          <SummaryStat label="Skipped" value={run.skipped} />
          <SummaryStat label="Rejected" value={run.rejected} />
        </div>
        <div className="detail-actions">
          <div className="detail-actions-group">
            <Button variant="secondary" onClick={() => downloadReport(run.id)}>
              Download Import Report
            </Button>
            {run.status === "CONFIRMED" && (
              <Button variant="danger" onClick={handleRollback} disabled={rollingBack}>
                {rollingBack ? "Rolling back..." : "Rollback Import"}
              </Button>
            )}
          </div>
          {storedPreview && (
            <Button variant="primary" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide Preview" : "View Preview"}
            </Button>
          )}
        </div>
      </Card>

      {showPreview && storedPreview ? (
        <PreviewView
          preview={storedPreview}
          onConfirm={run.status === "PENDING" ? () => setConfirmOpen(true) : undefined}
        />
      ) : (
        <Card>
          <h2 className="section-title">Row Results</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {run.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.rowNumber}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {confirmOpen && storedPreview && (
        <ConfirmImportDialog
          preview={storedPreview}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
          confirming={confirming}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-count">
      <div className="summary-count-value">{value}</div>
      <div className="summary-count-label">{label}</div>
    </div>
  );
}
