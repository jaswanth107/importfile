import type { ReactNode } from "react";
import "./EmptyState.css";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <p className="empty-description">{description}</p>
      {action}
    </div>
  );
}
