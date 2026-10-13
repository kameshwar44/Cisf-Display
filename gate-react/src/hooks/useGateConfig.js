import { useEffect, useState } from "react";
import { api } from "../api/client.js";

// Gate / lane names and header text from gate_config (public endpoint, so
// the sign-in screen can show it too). null until loaded or if unavailable.
export default function useGateConfig(gateId) {
  const [gateConfig, setGateConfig] = useState(null);

  useEffect(() => {
    let alive = true;
    api(`/gates/${gateId}/config`)
      .then((c) => alive && setGateConfig(c))
      .catch(() => alive && setGateConfig(null));
    return () => {
      alive = false;
    };
  }, [gateId]);

  return gateConfig;
}
