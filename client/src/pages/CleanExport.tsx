import { useEffect, useMemo, useState } from "react";
import {
  deleteExportFile,
  downloadExportFile,
  generateExportFile,
  getPeople,
  listExportFiles,
} from "../api/client";
import type { ExportFileSummary, PersonEntry } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { GenerateExportDialog } from "../components/GenerateExportDialog";
import "./pages.css";

export function CleanExport() {
  const [people, setPeople] = useState<PersonEntry[] | null>(null);
  const [files, setFiles] = useState<ExportFileSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshFiles() {
    return listExportFiles().then(setFiles);
  }

  useEffect(() => {
    getPeople().then(setPeople);
    refreshFiles();
  }, []);

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)
    );
  }, [people, search]);

  async function handleGenerate(input: { mode: "new"; name: string } | { mode: "existing"; targetId: string }) {
    setError(null);
    setGenerating(true);
    try {
      await generateExportFile(input);
      await refreshFiles();
      setShowDialog(false);
    } catch {
      setError("Couldn't generate the sheet. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileDownload(file: ExportFileSummary) {
    setError(null);
    setBusyFileId(file.id);
    try {
      await downloadExportFile(file.id, file.name);
    } catch {
      setError("Couldn't download this file. Please try again.");
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleFileDelete(file: ExportFileSummary) {
    if (!window.confirm(`Delete "${file.name}"? This can't be undone.`)) return;
    setError(null);
    setBusyFileId(file.id);
    try {
      await deleteExportFile(file.id);
      await refreshFiles();
    } catch {
      setError("Couldn't delete this file. Please try again.");
    } finally {
      setBusyFileId(null);
    }
  }

  if (!people || !files) return <div className="page-loading">Loading clean data...</div>;

  return (
    <div>
      <header className="page-header">
        <h1>Clean Data</h1>
        <p className="page-subtitle">
          The current, deduplicated set of people in your database — generate it as a tracked clean spreadsheet.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {people.length === 0 ? (
        <EmptyState
          title="No clean data yet"
          description="Once you confirm an import, the resulting records will appear here and can be generated into a clean sheet."
        />
      ) : (
        <>
          <div className="history-toolbar">
            <input
              className="search-input"
              placeholder="Search by name, email, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="primary" onClick={() => setShowDialog(true)}>
              Generate Clean Sheet
            </Button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Joining Date</th>
                  <th>Added On</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.email}</td>
                    <td>{p.phone}</td>
                    <td>{p.joiningDate}</td>
                    <td>{new Date(p.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="export-files-section">
        <h2 className="section-title">Generated Files</h2>
        <p className="section-subtitle">
          Every clean sheet you've generated stays here until you delete it — pick "New File" to start a fresh one, or
          "Existing File" to fold the latest data into one you already have.
        </p>

        {files.length === 0 ? (
          <EmptyState
            title="No generated files yet"
            description='Click "Generate Clean Sheet" above to create your first tracked export.'
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rows</th>
                  <th>Created</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.rowCount}</td>
                    <td>{new Date(f.createdAt).toLocaleString()}</td>
                    <td>{new Date(f.updatedAt).toLocaleString()}</td>
                    <td>
                      <div className="export-file-row-actions">
                        <Button variant="ghost" disabled={busyFileId === f.id} onClick={() => handleFileDownload(f)}>
                          Download
                        </Button>
                        <Button variant="danger" disabled={busyFileId === f.id} onClick={() => handleFileDelete(f)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showDialog && (
        <GenerateExportDialog
          files={files}
          onCancel={() => setShowDialog(false)}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}
    </div>
  );
}
