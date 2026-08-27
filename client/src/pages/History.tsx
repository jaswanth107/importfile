import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getHistory } from "../api/client";
import type { HistoryEntry } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import "./pages.css";

type SortKey = "date" | "status";

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    getHistory().then(setEntries);
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    let rows = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) => e.fileName.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) =>
      sortKey === "date" ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : a.status.localeCompare(b.status)
    );
    return rows;
  }, [entries, search, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (!entries) return <div className="page-loading">Loading import history...</div>;

  return (
    <div>
      <header className="page-header">
        <h1>Import History</h1>
        <p className="page-subtitle">Every import, with its full summary and report.</p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description="Once you import a CSV or Excel file, your import history will appear here."
          action={
            <Link to="/import">
              <Button variant="primary">Import People</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="history-toolbar">
            <input
              className="search-input"
              placeholder="Search by file name or import ID"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="date">Sort by date</option>
              <option value="status">Sort by status</option>
            </select>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Import ID</th>
                  <th>File Name</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Skipped</th>
                  <th>Rejected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/history/${e.id}`}>{e.id}</Link>
                    </td>
                    <td>{e.fileName}</td>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>{e.totalRows}</td>
                    <td>{e.created}</td>
                    <td>{e.updated}</td>
                    <td>{e.skipped}</td>
                    <td>{e.rejected}</td>
                    <td>
                      <span className={`run-status run-status-${e.status.toLowerCase()}`}>{e.status}</span>
                    </td>
                  </tr>
                ))}
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
        </>
      )}
    </div>
  );
}
