import { ImportFlowIcon } from "./ImportFlowIcon";
import "./ImportFlowLogo.css";

interface ImportFlowLogoProps {
  tagline?: boolean;
  size?: "sm" | "md";
}

export function ImportFlowLogo({ tagline = false, size = "sm" }: ImportFlowLogoProps) {
  return (
    <div className={`importflow-logo importflow-logo-${size}`}>
      <div className="importflow-logo-row">
        <span className="importflow-badge">
          <ImportFlowIcon size={size === "md" ? 22 : 16} />
        </span>
        <span className="importflow-wordmark">ImportFlow</span>
      </div>
      {tagline && <p className="importflow-tagline">Import with confidence.</p>}
    </div>
  );
}
