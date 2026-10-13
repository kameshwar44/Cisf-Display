import { BoxIcon, CardHeader, DataRow, StatusStrip, cls } from "./common.jsx";

const blurOnEnter = (e) => e.key === "Enter" && e.currentTarget.blur();

// Edits are saved when a field is left; the E / I switch saves at once
function ContainerRow({ index, container, onChange, onCommit, locked }) {
  const n = index + 1;
  const isExport = container.ei === "E";
  return (
    <DataRow label={`Container ${n}`} htmlFor={`cnBox${n}`} className="cn-row">
      <div className="cn-fields">
        {/* Export (navy) / Import (orange) toggle */}
        <button
          type="button"
          className={cls("ei-btn", !isExport && "imp")}
          disabled={locked}
          onClick={() => {
            onChange({ ei: isExport ? "I" : "E" });
            onCommit();
          }}
          aria-label={`Container ${n}: ${isExport ? "Export" : "Import"} — Click to toggle Export / Import`}
          title="Click to toggle Export / Import"
        >
          <span className="ei-letter" aria-hidden="true">
            {container.ei}
          </span>
          <span className="ei-label" aria-hidden="true">
            {isExport ? "EXP" : "IMP"}
          </span>
        </button>
        <input
          type="text"
          className="cn-size"
          maxLength={2}
          inputMode="numeric"
          autoComplete="off"
          title="Size (20/40 ft)"
          placeholder="20…"
          aria-label={`Container ${n} Size`}
          value={container.size}
          readOnly={locked}
          onChange={(e) =>
            onChange({ size: e.target.value.replace(/\D/g, "") })
          }
          onBlur={onCommit}
          onKeyDown={blurOnEnter}
        />
        <input
          type="text"
          id={`cnBox${n}`}
          className="cn-input"
          autoComplete="off"
          spellCheck="false"
          placeholder="e.g. TCKU 123456-7…"
          value={container.number}
          readOnly={locked}
          onChange={(e) => onChange({ number: e.target.value.toUpperCase() })}
          onBlur={onCommit}
          onKeyDown={blurOnEnter}
        />
      </div>
    </DataRow>
  );
}

export default function CargoCard({
  data,
  ok,
  containers,
  onContainerChange,
  onContainerCommit,
  time,
  active,
  cardProps,
  onToggle,
  locked,
}) {
  return (
    <div
      id="cardCargo"
      className={cls("card", active && "is-active", !ok && "denied")}
      {...cardProps}
    >
      <CardHeader
        color="teal"
        icon={<BoxIcon />}
        title="Cargo & Container Scan Status"
        refNo={data.ref}
      />
      <div className="card-body">
        <div className="cam-box">
          <img
            src={data.image}
            alt="AI camera feed showing container number recognition scan at Gate 0"
            width="640"
            height="360"
          />
          <div className="cam-tag" aria-hidden="true">
            {data.camera || "AI-CAM · Container"}
          </div>
          <div className="cam-time" aria-hidden="true">
            {time}
          </div>
        </div>

        {containers.map((c, i) => (
          <ContainerRow
            key={c.seq ?? i}
            index={i}
            container={c}
            onChange={(patch) => onContainerChange(i, patch)}
            onCommit={onContainerCommit}
            locked={locked}
          />
        ))}

        <DataRow label="Form 13 No.">
          <span className="dr-value mono-strong">{data.form13}</span>
        </DataRow>
        <DataRow label="Form 13 Match">
          <span className={data.form13Match ? "badge-ok" : "badge-fail"}>
            {data.form13Match ? "✓ Matched" : "✕ Mismatch"}
          </span>
        </DataRow>
        <DataRow label="Terminal">
          <span className="dr-value">{data.terminal}</span>
        </DataRow>
        <DataRow label="RapiScan (Cargo X-Ray)">
          <span className={data.rapiscanOk ? "badge-ok" : "badge-warn"}>
            {data.rapiscanOk ? "✓" : "⚠"} {data.rapiscan || "No result"}
          </span>
        </DataRow>
        <DataRow label="OOC Status">
          <span className={data.oocOk ? "badge-ok" : "badge-fail"}>
            {data.oocOk ? "✓" : "✕"} {data.ooc || "Not completed"}
          </span>
        </DataRow>

        <StatusStrip
          id="vsStrip3"
          ok={ok}
          emoji="📦"
          title={ok ? "✓ Cargo Identified" : "✕ Customs Inspection Required"}
          badge={ok ? "ALL CLEAR" : "✕ DETAINED"}
          label="Cargo"
          onToggle={onToggle}
          locked={locked}
        />
      </div>
    </div>
  );
}
