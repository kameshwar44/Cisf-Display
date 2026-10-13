import { useEffect, useRef } from "react";
import { cls } from "./common.jsx";

export default function AccessOverlay({ open, allClear, fails, onDismiss }) {
  const btnRef = useRef(null);
  const prevFocus = useRef(null);

  // Move focus into the dialog on open; return it on close
  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement;
      btnRef.current?.focus();
    } else if (prevFocus.current) {
      prevFocus.current.focus?.();
      prevFocus.current = null;
    }
  }, [open]);

  return (
    <div
      className={cls("access-overlay", open && "show", !allClear && "denied")}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-labelledby="agTitle"
      aria-describedby="agSub"
      onKeyDown={(e) => {
        // The dismiss button is the only control — keep Tab on it
        if (e.key === "Tab") {
          e.preventDefault();
          btnRef.current?.focus();
        }
      }}
    >
      <div className="ag-ring" aria-hidden="true">
        <span className="ag-check">{allClear ? "✓" : "✕"}</span>
      </div>
      <div className="ag-title" id="agTitle">
        {allClear ? "ACCESS GRANTED" : "ACCESS DENIED — GATE LOCKED"}
      </div>
      <div className="ag-sub" id="agSub">
        {allClear
          ? "All Checks Cleared — Boom Barrier Lifted"
          : `PORT ENTRY NOT APPROVED: ${fails.join(" • ")}`}
      </div>
      <button ref={btnRef} type="button" className="ag-btn" onClick={onDismiss}>
        {allClear ? "Dismiss / Close Gate" : "Acknowledge Security Alert"}
      </button>
    </div>
  );
}
