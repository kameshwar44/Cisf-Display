import {
  CardHeader,
  DataRow,
  PersonIcon,
  StatusPill,
  StatusStrip,
  cls,
} from "./common.jsx";

// With a visitor-only pass there is no live capture to compare against:
// the panel shows the registered face and the pass data.
export default function VisitorCard({
  data,
  ok,
  visitorOnly,
  time,
  active,
  cardProps,
  onToggle,
  locked,
}) {
  return (
    <div
      id="cardVisitor"
      className={cls("card", active && "is-active", !ok && "denied")}
      {...cardProps}
    >
      <CardHeader
        color="blue"
        icon={<PersonIcon />}
        title="Visitor Pass & Face Recognition"
        refNo={data.ref}
      />
      <div className="card-body">
        <div className="face-compare">
          {!visitorOnly && (
            <div className="face-slot live">
              <div className="face-slot-label">Captured Face (Live)</div>
              <div className="face-img">
                <img
                  src={data.liveImage}
                  alt="Captured live CCTV face capture of visitor"
                  width="400"
                  height="300"
                />
                <div className="live-noise-overlay" aria-hidden="true" />
                <div className="live-rec" aria-hidden="true">
                  <div className="live-rec-dot" />
                  <span className="live-rec-text">REC</span>
                </div>
                <div className="cam-tag" aria-hidden="true">
                  {data.camera || "FRS · CAM-01"}
                  {!ok && " · ✕ REJECTED"}
                </div>
                <div className="cam-time" aria-hidden="true">
                  {time}
                </div>
              </div>
            </div>
          )}
          <div className="face-slot registered">
            <div className="face-slot-label">Registered Face</div>
            <div className="face-img">
              <img
                src={data.registeredImage}
                alt="Registered face from database on file"
                width="400"
                height="300"
              />
              <div className="cam-tag" aria-hidden="true">
                RF
              </div>
            </div>
          </div>
        </div>

        <DataRow label="Full Name">
          <span className="dr-value">{data.name}</span>
        </DataRow>
        <DataRow label="ID Proof">
          <span className="dr-value mono-value">{data.idProof}</span>
        </DataRow>
        <DataRow label="Company">
          <span className="dr-value">{data.company}</span>
        </DataRow>
        <DataRow label="Purpose">
          <span className="dr-value">{data.purpose}</span>
        </DataRow>
        <DataRow label="Vehicle">
          <span className="dr-value">{data.vehicle}</span>
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
          id="vsStrip1"
          ok={ok}
          emoji="🧑"
          title="Visitor Pass & Face Recognition"
          badge={ok ? "✓ VERIFIED" : "✕ DENIED"}
          label="Visitor"
          onToggle={onToggle}
          locked={locked}
        />
      </div>
    </div>
  );
}
