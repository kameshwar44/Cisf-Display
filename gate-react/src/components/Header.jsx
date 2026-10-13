import logo from "../assets/cisf-logo.png";

// header: title / ministry / facility / organization / systemStatus from
// gate_config. operator / onSignOut are given once signed in.
export default function Header({
  time,
  date,
  header = {},
  operator,
  onSignOut,
}) {
  const title =
    header.title ||
    `Government of India — ${header.organization || "CISF"} Gate Management System`;
  const subtitle = [header.ministry, header.facility].filter(Boolean);
  const status = (header.systemStatus || "ONLINE").toUpperCase();
  const online = status === "ONLINE";

  return (
    <>
      <div className="tricolor">
        <span className="saffron" />
        <span className="white" />
        <span className="green" />
      </div>

      <div className="goi-header">
        <div className="goi-header-inner">
          <div className="goi-brand">
            <img
              src={logo}
              alt="CISF - Central Industrial Security Force Emblem"
              className="emblem"
              width="48"
              height="48"
            />
            <div className="goi-titles">
              <h1>{title}</h1>
              {subtitle.length > 0 && <p>{subtitle.join("  |  ")}</p>}
            </div>
          </div>

          <div className="goi-right">
            {operator && (
              <div className="operator-block">
                <div className="operator-name">{operator.fullName}</div>
                <button
                  type="button"
                  className="sign-out-btn"
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              </div>
            )}
            <div className="clock-block">
              <div className="clock-time" aria-live="off" aria-atomic="true">
                {time}
              </div>
              <div className="clock-date">{date}</div>
            </div>
            <div
              className={online ? "system-status" : "system-status offline"}
              role="status"
              aria-label={`System status: ${status}`}
            >
              <div className="status-dot" aria-hidden="true" />
              <span>SYSTEM {status}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
