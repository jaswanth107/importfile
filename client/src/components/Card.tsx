import type { HTMLAttributes } from "react";
import "./Card.css";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest} />;
}

export function StatTile({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className="stat-tile">
      <div className={`stat-value ${accent ? "stat-value-accent" : ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </Card>
  );
}
