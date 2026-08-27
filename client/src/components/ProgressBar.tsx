import "./ProgressBar.css";

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress-wrap">
      {label && <div className="progress-label">{label}</div>}
      <div className="progress-track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function DataQualityBar({ validPct, warningPct, rejectedPct }: { validPct: number; warningPct: number; rejectedPct: number }) {
  return (
    <div className="quality-track">
      <div className="quality-seg quality-valid" style={{ width: `${validPct}%` }} />
      <div className="quality-seg quality-warning" style={{ width: `${warningPct}%` }} />
      <div className="quality-seg quality-rejected" style={{ width: `${rejectedPct}%` }} />
    </div>
  );
}
