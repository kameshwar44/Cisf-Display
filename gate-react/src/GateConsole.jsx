import { useEffect, useRef, useState } from "react";
import { api } from "./api/client.js";
import Header from "./components/Header.jsx";
import InfoBar from "./components/InfoBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import VisitorCard from "./components/VisitorCard.jsx";
import VehicleCard from "./components/VehicleCard.jsx";
import CargoCard from "./components/CargoCard.jsx";
import AccessOverlay from "./components/AccessOverlay.jsx";
import Footer from "./components/Footer.jsx";
import PassSearch from "./components/PassSearch.jsx";
import { GateButton, PersonIcon } from "./components/common.jsx";
import useClock from "./hooks/useClock.js";
import useGateTransaction from "./hooks/useGateTransaction.js";
import usePanelReveal from "./hooks/usePanelReveal.js";

const sameContainer = (a, b) =>
  b && a.number === b.number && a.size === b.size && a.ei === b.ei;

const LABELS = { visitor: "Visitor", vehicle: "Vehicle", cargo: "Cargo" };

// gateConfig: gate / lane / header text from gate_config
export default function GateConsole({
  operator,
  simulation,
  gateId,
  gateConfig,
  onSignOut,
}) {
  const { time, date } = useClock();
  const { txn, setTxn, connectionError } = useGateTransaction(
    gateId,
    onSignOut,
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Editable camera reads; saved to the server when a field is left
  const [plate, setPlate] = useState("");
  const [containers, setContainersState] = useState([]);
  const containersRef = useRef([]);
  const setContainers = (list) => {
    containersRef.current = list;
    setContainersState(list);
  };

  // A new arrival: close the overlay and load its camera reads
  useEffect(() => {
    setOverlayOpen(false);
    setPlate(txn?.vehicle?.plate ?? "");
    setContainers(txn?.cargo?.containers ?? []);
  }, [txn?.id]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  // Which checks this arrival has (visitor, vehicle, cargo — whichever records it links)
  const activeKeys = txn?.sections?.length ? txn.sections : ["visitor"];
  const visitorOnly = activeKeys.length === 1 && activeKeys[0] === "visitor";
  const gate = {
    name: txn?.gate.name ?? gateConfig?.gate.name ?? "—",
    lane: txn?.gate.lane ?? gateConfig?.gate.lane ?? "—",
    direction: txn?.direction ?? "entry",
  };
  const checks = txn?.checks ?? { visitor: true, vehicle: true, cargo: true };
  const allClear = txn?.decision
    ? txn.decision === "GRANTED"
    : activeKeys.every((key) => checks[key]);
  const locked = !txn || Boolean(txn.decision) || busy;

  // Why each failed check failed, as worked out by the server
  const fails = activeKeys
    .filter((key) => !checks[key])
    .map(
      (key) =>
        `${LABELS[key]}: ${txn?.reasons?.[key]?.join(", ") || "Rejected"}`,
    );

  // With a visitor-only pass the Visitor panel is the only one and stays open
  const panels = usePanelReveal(txn && visitorOnly ? "visitor" : null);

  // Runs one server call; 401 signs out, other errors show a notice
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err.status === 401) onSignOut();
      else setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const patchTxn = (body) =>
    api(`/transactions/${txn.id}`, { method: "PATCH", body }).then(setTxn);

  const toggleCheck = (key) => {
    if (locked) return;
    run(() => patchTxn({ checks: { [key]: !checks[key] } }));
  };

  const commitPlate = () => {
    if (locked || !txn.vehicle || plate === txn.vehicle.plate) return;
    const saved = txn.vehicle.plate;
    run(() =>
      patchTxn({ plateRead: plate }).catch((err) => {
        setPlate(saved);
        throw err;
      }),
    );
  };

  const updateContainer = (index, patch) =>
    setContainers(
      containersRef.current.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    );

  const commitContainers = () => {
    if (locked || !txn.cargo) return;
    const list = containersRef.current;
    const saved = txn.cargo.containers;
    if (list.every((c, i) => sameContainer(c, saved[i]))) return;
    run(() =>
      patchTxn({ containers: list }).catch((err) => {
        setContainers(saved);
        throw err;
      }),
    );
  };

  // Entry / Exit is recorded on each arrival (gate_transactions.gate_mode)
  const toggleGateMode = () => {
    if (!txn) return setNotice("No arrival at the gate");
    if (txn.decision)
      return setNotice(
        "This arrival is already decided — Entry / Exit can no longer change",
      );
    if (busy) return;
    run(() =>
      patchTxn({ gateMode: gate.direction === "exit" ? "entry" : "exit" }),
    );
  };

  // PASS pill: visitor only ⇄ visitor + the vehicle / cargo filed under
  // the same REF (the server looks them up)
  const togglePassMode = () => {
    if (!txn) return setNotice("No arrival at the gate — enter a pass number first");
    if (txn.decision) {
      return setNotice("This arrival is already decided — the pass type can no longer change");
    }
    if (busy) return;
    const mode = visitorOnly ? "full" : "visitor";
    run(async () => {
      await patchTxn({ mode });
      if (mode === "full") panels.pin("visitor");
      else panels.close();
    });
  };

  // A pass shown at the gate becomes the arrival to verify. Returns true
  // once it is on screen (so the search box can clear).
  const startArrival = async (hit) => {
    if (busy) return false;
    if (txn && !txn.decision) {
      const who = txn.visitor?.name || txn.vehicle?.plate || "the current arrival";
      if (!window.confirm(`${who} has not been allowed or denied yet.\n\nVerify ${hit.name} instead?`)) {
        return false;
      }
    }
    let started = false;
    await run(async () => {
      const r = await api(`/gates/${gateId}/arrivals`, {
        method: "POST",
        body: { visitorId: hit.visitorId, vehicleId: hit.vehicleId, cargoId: hit.cargoId },
      });
      setTxn(r.transaction);
      // Open the person's panel straight away
      if (r.transaction?.sections?.length > 1) panels.pin(r.transaction.sections[0]);
      started = true;
    });
    return started;
  };

  // F2 jumps to the pass number box
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // First press records the decision; afterwards it just shows the result
  const approve = () => {
    if (!txn || busy) return;
    if (txn.decision) {
      setOverlayOpen(true);
      return;
    }
    run(async () => {
      setTxn(await api(`/transactions/${txn.id}/decision`, { method: "POST" }));
      setOverlayOpen(true);
    });
  };

  // Esc closes the access overlay first, then any open panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (overlayOpen) setOverlayOpen(false);
      else if (panels.shown) panels.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const passMode = visitorOnly ? "visitor" : "full";

  return (
    <div className="app" data-pass={passMode}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header
        time={time}
        date={date}
        header={gateConfig?.header}
        operator={operator}
        onSignOut={onSignOut}
      />

      <InfoBar
        gate={gate}
        sections={activeKeys}
        onTogglePassMode={togglePassMode}
        gateMode={gate.direction}
        onToggleGateMode={toggleGateMode}
        allClear={allClear}
        fails={fails}
        onApprove={approve}
      />

      <div className="main-wrapper">
        {txn && (
          <Sidebar
            keys={activeKeys}
            checks={checks}
            allClear={allClear}
            panels={panels}
            thumbs={{
              visitor: txn.visitor?.liveImage || txn.visitor?.registeredImage,
              vehicle: txn.vehicle?.image,
              cargo: txn.cargo?.image,
            }}
          />
        )}

        <div className="page" id="main-content">
          <PassSearch
            gateId={gateId}
            onStart={startArrival}
            disabled={busy}
            inputRef={searchRef}
          />

          <div className="panels" data-active={panels.shown || "none"}>
            <div className="panel-empty">
              <div className="panel-empty-icon" aria-hidden="true">
                <PersonIcon size={30} />
              </div>
              {txn ? (
                <>
                  <p className="panel-empty-title">
                    <span className="copy-hover">
                      Hover a verification check to view its details
                    </span>
                    <span className="copy-touch">
                      Tap a verification check to view its details
                    </span>
                  </p>
                  <p className="panel-empty-hint">
                    <span className="copy-hover">
                      Click a check to keep its panel open
                    </span>
                    <span className="copy-touch">
                      Tap the check again to close its panel
                    </span>
                  </p>
                </>
              ) : (
                <p className="panel-empty-title">
                  {txn === undefined
                    ? "Loading the gate…"
                    : "Enter the pass number shown at the gate to start verification"}
                </p>
              )}
            </div>

            {txn?.visitor && (
              <VisitorCard
                data={txn.visitor}
                ok={checks.visitor}
                visitorOnly={visitorOnly}
                time={time}
                active={panels.shown === "visitor"}
                cardProps={panels.cardProps("visitor")}
                onToggle={() => toggleCheck("visitor")}
                locked={locked}
              />
            )}

            {txn?.vehicle && (
              <VehicleCard
                data={txn.vehicle}
                ok={checks.vehicle}
                reasons={txn.reasons?.vehicle}
                plate={plate}
                onPlateChange={setPlate}
                onPlateCommit={commitPlate}
                time={time}
                active={panels.shown === "vehicle"}
                cardProps={panels.cardProps("vehicle")}
                onToggle={() => toggleCheck("vehicle")}
                locked={locked}
              />
            )}
            {txn?.cargo && (
              <CargoCard
                data={txn.cargo}
                ok={checks.cargo}
                containers={containers}
                onContainerChange={updateContainer}
                onContainerCommit={commitContainers}
                time={time}
                active={panels.shown === "cargo"}
                cardProps={panels.cardProps("cargo")}
                onToggle={() => toggleCheck("cargo")}
                locked={locked}
              />
            )}
          </div>
        </div>
      </div>

      <AccessOverlay
        open={overlayOpen}
        allClear={allClear}
        fails={fails}
        onDismiss={() => setOverlayOpen(false)}
      />

      {/* Sticky action bar — visible on mobile only (CSS) */}
      <div className="mobile-action-bar">
        <GateButton allClear={allClear} fails={fails} onClick={approve} />
      </div>

      {(notice || connectionError) && (
        <div className="api-notice" role="alert">
          {notice || connectionError}
        </div>
      )}

      <Footer header={gateConfig?.header} />
    </div>
  );
}
