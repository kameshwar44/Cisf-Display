import { Fragment } from "react";
import { ArrowIcon, PinIcon, cls } from "./common.jsx";

const CHECKS = {
  visitor: {
    title: "Visitor Pass & Face Recognition",
    cardId: "cardVisitor",
    ok: "✓ VERIFIED",
    fail: "✕ DENIED",
  },
  vehicle: {
    title: "Vehicle Pass & ANPR Validation",
    cardId: "cardVehicle",
    ok: "✓ VERIFIED",
    fail: "✕ NOT APPROVED",
  },
  cargo: {
    title: "Cargo & Container Scan Status",
    cardId: "cardCargo",
    ok: "✓ ALL CLEAR",
    fail: "✕ DETAINED",
  },
};

// thumbs: { visitor, vehicle, cargo } — camera image shown next to each check
export default function Sidebar({
  keys,
  checks,
  allClear,
  panels,
  thumbs = {},
}) {
  return (
    <aside
      className="detection-sidebar"
      aria-labelledby="sidebarLabel"
      {...panels.sidebarProps}
    >
      <div className="sidebar-header">
        <div className="sidebar-section-label" id="sidebarLabel">
          Verification Checks
        </div>
      </div>

      <div className="sidebar-body">
        {keys.map((key, i) => {
          const check = CHECKS[key];
          const ok = checks[key];
          const isShown = panels.shown === key;
          return (
            <Fragment key={key}>
              {/* Each connector takes the colour of the check above it */}
              {i > 0 && (
                <div
                  className={cls(
                    "sidebar-connector",
                    checks[keys[i - 1]] ? "active" : "active-fail",
                  )}
                />
              )}
              <button
                type="button"
                className={cls(
                  "sidebar-item",
                  ok ? "glow-ok" : "glow-fail",
                  isShown && "is-active",
                  panels.pinned === key && "is-pinned",
                )}
                aria-controls={check.cardId}
                aria-expanded={isShown}
                {...panels.itemProps(key)}
              >
                <span className="sidebar-item-icon" aria-hidden="true">
                  <img
                    src={thumbs[key] || undefined}
                    className="sidebar-thumb"
                    alt=""
                  />
                </span>
                <span className="sidebar-item-content">
                  <span className="sidebar-item-title">{check.title}</span>
                  <span className="sidebar-item-status">
                    <span className={cls("sidebar-badge", ok ? "ok" : "fail")}>
                      {ok ? check.ok : check.fail}
                    </span>
                  </span>
                </span>
                <span className="sidebar-item-indicator" aria-hidden="true">
                  <ArrowIcon />
                  <PinIcon />
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>

      <div className={cls("sidebar-summary", !allClear && "denied")}>
        <div className="summary-icon">{allClear ? "✓" : "✕"}</div>
        <div className="summary-text">
          {allClear ? "ALL CHECKS CLEARED" : "ACCESS DENIED"}
        </div>
      </div>
    </aside>
  );
}
