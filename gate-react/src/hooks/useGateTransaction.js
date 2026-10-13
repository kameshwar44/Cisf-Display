import { useEffect, useRef, useState } from "react";
import { api, eventsUrl } from "../api/client.js";
import { logEvent } from "../api/debug.js";

// Live state of one gate. The server's event stream sends the gate's
// current arrival on connect and again after every change (new scan,
// operator edit, decision), so every display at the gate stays in step.
//   txn: undefined = loading, null = no arrival yet, else the transaction
export default function useGateTransaction(gateId, onUnauthorized) {
  const [txn, setTxn] = useState(undefined);
  const [connectionError, setConnectionError] = useState(null);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let alive = true;
    const stream = new EventSource(eventsUrl(gateId));
    stream.addEventListener("transaction", (e) => {
      if (!alive) return;
      const next = JSON.parse(e.data);
      logEvent("transaction", next);
      setTxn(next);
      setConnectionError(null);
    });
    stream.onopen = () => logEvent("connected to live updates", { gateId });
    stream.onerror = () => {
      if (!alive) return;
      logEvent("connection lost (browser will retry)", { gateId, readyState: stream.readyState });
      setConnectionError("Connection to the gate server lost — reconnecting…");
      // A stream refused for an expired session never reconnects: sign out
      api("/auth/me").catch((err) => alive && err.status === 401 && unauthorized.current());
    };

    return () => {
      alive = false;
      stream.close();
    };
  }, [gateId]);

  return { txn, setTxn, connectionError };
}
