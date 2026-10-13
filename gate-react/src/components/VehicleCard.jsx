import {
  CarIcon,
  CardHeader,
  DataRow,
  StatusPill,
  StatusStrip,
  cls,
} from "./common.jsx";

export default function VehicleCard({
  data,
  ok,
  reasons = [],
  plate,
  onPlateChange,
  onPlateCommit,
  time,
  active,
  cardProps,
  onToggle,
  locked,
}) {
  return (
    <div
      id="cardVehicle"
      className={cls("card", active && "is-active", !ok && "denied")}
      {...cardProps}
    >
      <CardHeader
        color="orange"
        icon={<CarIcon />}
        title="Vehicle Pass & ANPR Validation"
        refNo={data.ref}
      />
      <div className="card-body">
        <div className="cam-box">
          <img
            src={data.image}
            alt="ANPR camera feed showing vehicle at weighbridge, Gate 0 Lane A"
            width="640"
            height="360"
          />
          <div className="cam-tag" aria-hidden="true">
            {data.camera || "ANPR · CAM-02"}
            {!ok && " · ⚠ FLAGGED"}
          </div>
          <div className="cam-time" aria-hidden="true">
            {time}
          </div>
        </div>

        <DataRow label="Registration No." htmlFor="anprInput">
          <input
            type="text"
            id="anprInput"
            className="plate-number"
            name="registration_no"
            autoComplete="off"
            spellCheck="false"
            placeholder="e.g. UP91AT4254…"
            value={plate}
            readOnly={locked}
            onChange={(e) => onPlateChange(e.target.value.toUpperCase())}
            onBlur={onPlateCommit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </DataRow>
        <DataRow label="Blacklist Check">
          <span className="dr-value">
            {reasons.includes("Vehicle blacklisted") ? (
              <span className="badge-fail">
                ✕ {data.blacklistStatus || "Blacklisted"}
              </span>
            ) : (
              <span className="badge-ok">
                ✓ {data.blacklistStatus || "Clear"}
              </span>
            )}
          </span>
        </DataRow>
        <DataRow label="Company">
          <span className="dr-value">{data.company}</span>
        </DataRow>
        <DataRow label="Purpose">
          <span className="dr-value">{data.purpose}</span>
        </DataRow>
        <DataRow label="Pass Type">
          <span className="dr-value">
            {data.passType} : <span className="pass-no">{data.passNo}</span>
          </span>
        </DataRow>
        <DataRow label="Valid From - Till">
          <span className="dr-value validity">{data.validity}</span>
        </DataRow>
        <DataRow label="Pass Status">
          <StatusPill ok={ok} />
        </DataRow>

        <StatusStrip
          id="vsStrip2"
          ok={ok}
          emoji="🚗"
          title="Vehicle Pass & ANPR Validation"
          badge={ok ? "✓ VERIFIED" : "✕ NOT APPROVED"}
          label="Vehicle"
          onToggle={onToggle}
          locked={locked}
        />
      </div>
    </div>
  );
}
