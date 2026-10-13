import { GateButton, cls } from "./common.jsx";

// sections: what the current arrival includes, e.g. ["visitor", "vehicle", "cargo"]
export default function InfoBar({
  gate,
  sections = ["visitor"],
  onTogglePassMode,
  gateMode,
  onToggleGateMode,
  allClear,
  fails,
  onApprove,
}) {
  const isEntry = gateMode === "entry";
  const visitorOnly = sections.length === 1 && sections[0] === "visitor";
  const passLabel = visitorOnly
    ? "VISITOR ONLY"
    : sections.map((s) => s.toUpperCase()).join(" + ");

  return (
    <div className="info-bar">
      <div className="info-bar-inner">
        <div className="info-pills">
          <div className="pill">
            <span className="pill-label">Gate</span>
            <span className="pill-value">{gate.name}</span>
          </div>
          <div className="pill">
            <span className="pill-label">Lane</span>
            <span className="pill-value">{gate.lane}</span>
          </div>
          {/* Click: switch between visitor only and the vehicle + cargo
              registered under the same REF */}
          {onTogglePassMode ? (
            <button
              type="button"
              className="pill pass-mode-btn"
              onClick={onTogglePassMode}
              title={
                visitorOnly
                  ? "Click to add the vehicle and cargo registered under this REF"
                  : "Click to verify the visitor only"
              }
            >
              <span className="pill-label">Pass</span>
              <span className="pill-value">{passLabel}</span>
            </button>
          ) : (
            <div className="pill">
              <span className="pill-label">Pass</span>
              <span className="pill-value">{passLabel}</span>
            </div>
          )}
        </div>

        <div className="info-actions">
          <button
            type="button"
            className={cls("entry-exit-badge", isEntry ? "entry" : "exit")}
            onClick={onToggleGateMode}
            aria-label={`Gate mode: ${isEntry ? "Entry" : "Exit"} — Click to toggle Entry / Exit`}
            title="Click to toggle Entry / Exit"
          >
            <div className="ee-dot" aria-hidden="true" />
            <div className="ee-text">
              <span className="ee-main">{isEntry ? "ENTRY" : "EXIT"}</span>
              <span className="ee-sub">
                {isEntry
                  ? "In-Gate · Click to switch"
                  : "Out-Gate · Click to switch"}
              </span>
            </div>
            <span className="ee-arrow" aria-hidden="true">
              {isEntry ? "→" : "←"}
            </span>
          </button>

          <GateButton allClear={allClear} fails={fails} onClick={onApprove} />
        </div>
      </div>
    </div>
  );
}
