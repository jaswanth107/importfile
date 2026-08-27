import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api/client";
import type { DashboardStats } from "../api/types";
import { StatTile } from "../components/Card";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import "./Dashboard.css";

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading your dashboard...</div>;
  if (!stats) return null;

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">A quick look at your people imports.</p>
      </header>

      <div className="stat-grid">
        <StatTile label="Total Imports" value={stats.totalImports} />
        <StatTile label="Successful Imports" value={stats.successfulImports} accent />
        <StatTile label="Rows Imported" value={stats.rowsImported} accent />
        <StatTile label="Rows Rejected" value={stats.rowsRejected} />
      </div>

      <div className="quick-actions">
        <Link to="/import">
          <Button variant="primary">Import People</Button>
        </Link>
        <Link to="/history">
          <Button variant="secondary">View History</Button>
        </Link>
      </div>

      <section className="recent-section">
        <h2>Recent Imports</h2>
        {stats.recent.length === 0 ? (
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
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Date</th>
                  <th>Rows</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/history/${r.id}`}>{r.fileName}</Link>
                    </td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{r.totalRows}</td>
                    <td>
                      <span className={`run-status run-status-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
