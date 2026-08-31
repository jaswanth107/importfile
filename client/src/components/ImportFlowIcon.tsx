interface ImportFlowIconProps {
  size?: number;
  className?: string;
}

/**
 * The ImportFlow mark: an upward import arrow assembled from three
 * connected record nodes. Uses currentColor so it inherits the
 * surrounding accent color; wrap in an element with a background
 * when a standalone badge (e.g. favicon) is needed.
 */
export function ImportFlowIcon({ size = 20, className = "" }: ImportFlowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9 24 15 20.5M23 24 17 20.5M16 27V20.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M16 20.5V7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11.5 12 16 6.5 20.5 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="9" cy="24.4" r="2.3" fill="currentColor" />
      <circle cx="23" cy="24.4" r="2.3" fill="currentColor" />
      <circle cx="16" cy="27.6" r="2.3" fill="currentColor" />
    </svg>
  );
}
