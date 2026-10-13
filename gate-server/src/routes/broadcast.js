import { publish } from "../events.js";
import { currentView } from "../services/gate.js";

// Push a gate's current arrival to every display watching that gate
export async function broadcastCurrent(pool, gateId) {
  if (!gateId) return null;
  const view = await currentView(pool, gateId);
  publish(gateId, "transaction", view);
  return view;
}
