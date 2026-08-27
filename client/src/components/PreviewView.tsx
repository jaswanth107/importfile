import { useMemo, useState } from "react";
import type { ImportPreview, RowStatus } from "../api/types";
import { Button } from "./Button";
import { Card } from "./Card";
import { StatusBadge, WarningBadge } from "./StatusBadge";
import { DataQualityBar } from "./ProgressBar";
import "../pages/pages.css";

const FILTERS: Array<{ key: "ALL" | RowStatus | "WARNINGS"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "CREATED", label: "Created" },
  { key: "UPDATED", label: "Updated" },
  { key: "SKIPPED", label: "Skipped" },
  { key: "REJECTED", label: "Rejected" },
  { key: "WARNINGS", label: "Warnings" },
];

const PAGE_SIZE = 25;

interface PreviewViewProps {
  preview: ImportPreview;
  onConfirm?: () => void;
  onRestart?: () => void;
}

export function PreviewView({ preview, onConfirm, onRestart }: PreviewViewProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    let rows = preview.rows;
    if (filter === "WARNINGS") rows = rows.filter((r) => r.warnings.length > 0);
    else if (filter !== "ALL") rows = rows.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          String(r.rowNumber).includes(q)
      );
    }
    return rows;
  }, [preview, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = preview.totalRows || 1;
  const validPct = ((preview.counts.created + preview.counts.updated + preview.counts.skipped) / total) * 100;
  const warningPct = (preview.counts.warnings / total) * 100;
  const rejectedPct = (preview.counts.rejected / total) * 100;

  return (
    <div className="preview-step">
      <Card className="summary-card">
        <div className="summary-header">
          <div>
            <div className="import-id">{preview.importId}</div>
            <div className="file-name">{preview.fileName}</div>
          </div>
          {onRestart && (
            <Button variant="ghost" onClick={onRestart}>
              Start Over
            </Button>
          )}
        </div>
        <div className="summary-counts">
          <SummaryCount label="Total" value={preview.totalRows} />
          <SummaryCount label="Created" value={preview.counts.created} accent />
          <SummaryCount label="Updated" value={preview.counts.updated} />
          <SummaryCount label="Skipped" value={preview.counts.skipped} />
          <SummaryCount label="Rejected" value={preview.counts.rejected} danger={preview.counts.rejected > 0} />
        </div>
      </Card>

      <Card>
        <h2 className="section-title">Data Quality</h2>
        <DataQualityBar validPct={validPct} warningPct={warningPct} rejectedPct={rejectedPct} />
        <div className="quality-legend">
          <span>✓ {preview.counts.created + preview.counts.updated + preview.counts.skipped} rows ready</span>
          <span>⚠ {preview.counts.warnings} rows have warnings</span>
          <span>✕ {preview.counts.rejected} rows rejected</span>
        </div>
        <div className="column-quality-grid">
          {preview.columnQuality.map((cq) => (
            <div key={cq.field} className="column-quality-item">
              <div className="cq-field">{cq.field}</div>
              <div className="cq-stat cq-valid">
                ✓ {cq.valid} / {cq.total} valid
              </div>
              {cq.invalid > 0 && <div className="cq-stat cq-invalid">✕ {cq.invalid} invalid</div>}
              {cq.normalized > 0 && <div className="cq-stat cq-normalized">⚠ {cq.normalized} normalized</div>}
            </div>
          ))}
        </div>
      </Card>

      {preview.conflicts.length > 0 && (
        <Card>
          <h2 className="section-title">Duplicate Conflicts</h2>
          {preview.conflicts.map((c, i) => (
            <div className="conflict-item" key={i}>
              <div className="conflict-title">
                {c.email} appears in rows {c.canonicalRow} and {c.conflictingRow}
              </div>
              {c.differences.map((d) => (
                <div className="conflict-diff" key={d.field}>
                  {d.field}: <span className="diff-before">{d.before}</span> → <span className="diff-after">{d.after}</span>
                </div>
              ))}
              <div className="conflict-note">Using row {c.canonicalRow} as the canonical record.</div>
            </div>
          ))}
        </Card>
      )}

      {preview.counts.rejected > 0 && (
        <div className="rejected-download">
          <a href={`/api/import/${preview.importId}/rejected.csv`} download>
            <Button variant="secondary">Download Rejected Rows</Button>
          </a>
        </div>
      )}

      <Card>
        <div className="preview-toolbar">
          <div className="filter-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${filter === f.key ? "filter-tab-active" : ""}`}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder="Search by name, email, phone, or row number"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table preview-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Joining Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>{row.phone}</td>
                  <td>{row.joiningDate}</td>
                  <td>
                    <div className="status-cell">
                      <StatusBadge status={row.status} />
                      <WarningBadge count={row.warnings.length} />
                    </div>
                  </td>
                  <td>
                    {row.reason && <div className="row-reason">{row.reason}</div>}
                    {row.changes.length > 0 && (
                      <div className="row-changes">
                        {row.changes.map((c) => (
                          <div key={c.field}>
                            <strong>{c.field}:</strong> {c.before} → {c.after}
                          </div>
                        ))}
                      </div>
                    )}
                    {row.warnings.length > 0 && <div className="row-warnings">{row.warnings.join(" ")}</div>}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="no-rows">
                    No rows match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>

      {onConfirm && (
        <div className="confirm-bar">
          <Button variant="primary" onClick={onConfirm}>
            Confirm Import
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryCount({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="summary-count">
      <div className={`summary-count-value ${accent ? "value-accent" : ""} ${danger ? "value-danger" : ""}`}>{value}</div>
      <div className="summary-count-label">{label}</div>
    </div>
  );
}
