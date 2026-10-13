import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api/client.js";
import GateConsole from "./GateConsole.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import useGateConfig from "./hooks/useGateConfig.js";

// Which gate this display shows: ?gate=<id> (default 1)
const GATE_ID = Number(new URLSearchParams(window.location.search).get("gate")) || 1;

export default function App() {
  const [session, setSession] = useState({ status: "loading" });
  const gateConfig = useGateConfig(GATE_ID);

  const loadSession = useCallback(() => {
    if (!getToken()) {
      setSession({ status: "signed-out" });
      return;
    }
    setSession({ status: "loading" });
    api("/auth/me")
      .then((me) => setSession({ status: "signed-in", ...me }))
      .catch((err) => {
        if (err.status === 401) {
          setToken(null);
          setSession({ status: "signed-out" });
        } else {
          setSession({ status: "error", message: err.message });
        }
      });
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // session already gone — nothing to end on the server
    }
    setToken(null);
    setSession({ status: "signed-out" });
  }, []);

  if (session.status === "signed-out") return <LoginScreen header={gateConfig?.header} onSignedIn={loadSession} />;

  if (session.status === "signed-in") {
    return (
      <GateConsole
        operator={session.operator}
        simulation={session.simulation}
        gateId={GATE_ID}
        gateConfig={gateConfig}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="app-status" role="status">
      {session.status === "loading" ? (
        "Connecting to the gate server…"
      ) : (
        <>
          <p>{session.message}</p>
          <button type="button" className="ag-btn" onClick={loadSession}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}
