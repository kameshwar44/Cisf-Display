export const cls = (...names) => names.filter(Boolean).join(" ");

export function DataRow({ label, htmlFor, className, children }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cls("data-row", className)}>
      <Label className="dr-label" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function CardHeader({ color, icon, title, refNo }) {
  return (
    <div className={cls("card-header", color)}>
      <h2 className="card-title">
        {icon}
        {title}
      </h2>
      <span className="ref-tag">REF: {refNo}</span>
    </div>
  );
}

export function StatusPill({ ok }) {
  return (
    <span className="dr-value">
      <span className={cls("card-status-pill", !ok && "denied")}>
        {ok ? "✓ APPROVED" : "✕ REJECTED"}
      </span>
    </span>
  );
}

// Coloured strip at the foot of each card; clicking it toggles the check
// `locked` once the gate decision is recorded (or while a request is running)
export function StatusStrip({
  id,
  ok,
  emoji,
  title,
  badge,
  label,
  onToggle,
  locked,
}) {
  return (
    <button
      type="button"
      id={id}
      className={cls("vs-strip", !ok && "denied")}
      onClick={onToggle}
      disabled={locked}
      title={
        locked
          ? `${label} verification`
          : `Click to override ${label} verification`
      }
    >
      <span className="vs-left">
        <span className="vs-icon-box" aria-hidden="true">
          {emoji}
        </span>
        <span className="vs-title" aria-live="polite">
          {title}
        </span>
      </span>
      <span className="vs-badge-box" aria-live="polite">
        <span className="vs-dot" aria-hidden="true" />
        <span className="vs-badge-text">{badge}</span>
      </span>
    </button>
  );
}

export function GateButton({ allClear, fails, onClick }) {
  return (
    <button
      type="button"
      className={cls("approved-btn", !allClear && "denied")}
      onClick={onClick}
      title={
        allClear
          ? "All checks cleared — Click to grant access"
          : `Security Alert — ${fails.join(" | ")}`
      }
    >
      <span className="appr-check">{allClear ? "✓" : "✕"}</span>
      <span>
        {allClear
          ? "ALL CHECKS CLEARED • APPROVED"
          : "ACCESS DENIED • GATE LOCKED"}
      </span>
    </button>
  );
}

// ── ICONS ──
export const PersonIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
  </svg>
);

export const CarIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-5h14v5z" />
  </svg>
);

export const BoxIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-3V4H7v2H4a2 2 0 00-2 2v10a2 2 0 002 2zM9 6h6v2H9V6zm11 12H4V10h16v8z" />
  </svg>
);

export const ArrowIcon = () => (
  <svg
    className="ind-arrow"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const PinIcon = () => (
  <svg
    className="ind-pin"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
  </svg>
);
