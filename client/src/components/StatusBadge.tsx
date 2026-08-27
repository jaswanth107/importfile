import type { RowStatus } from "../api/types";
import "./StatusBadge.css";

const CONFIG: Record<RowStatus, { icon: string; label: string; className: string }> = {
  CREATED: { icon: "✓", label: "Created", className: "status-created" },
  UPDATED: { icon: "↻", label: "Updated", className: "status-updated" },
  SKIPPED: { icon: "→", label: "Skipped", className: "status-skipped" },
  REJECTED: { icon: "✕", label: "Rejected", className: "status-rejected" },
};

export function StatusBadge({ status }: { status: RowStatus }) {
  const cfg = CONFIG[status];
  return (
    <span className={`status-badge ${cfg.className}`}>
      <span aria-hidden="true">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

export function WarningBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="status-badge status-warning">
      <span aria-hidden="true">⚠</span>
      {count} warning{count === 1 ? "" : "s"}
    </span>
  );
}
