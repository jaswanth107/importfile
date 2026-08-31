import { useEffect, useMemo, useState } from "react";
import { downloadPeopleExport, getPeople } from "../api/client";
import type { PersonEntry } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import "./pages.css";

export function CleanExport() {
  const [people, setPeople] = useState<PersonEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeople().then(setPeople);
  }, []);

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)
    );
  }, [people, search]);

  async function handleDownload() {
    setError(null);
    setDownloading(true);
    try {
      await downloadPeopleExport();
    } catch {
      setError("Couldn't download the clean data sheet. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (!people) return <div className="page-loading">Loading clean data...</div>;

  return (
    <div>
      <header className="page-header">
        <h1>Clean Data</h1>
        <p className="page-subtitle">
          The current, deduplicated set of people in your database — export it as a single ready-to-share spreadsheet.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {people.length === 0 ? (
        <EmptyState
          title="No clean data yet"
          description="Once you confirm an import, the resulting records will appear here and can be exported as one clean sheet."
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
            <Button variant="primary" onClick={handleDownload} disabled={downloading}>
              {downloading ? "Preparing..." : "Download Clean Sheet"}
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
    </div>
  );
}
