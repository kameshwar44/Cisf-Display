// Server-Sent Events: each gate display keeps one open stream and receives
// the gate's current transaction whenever it changes.
import { logLine } from "./debug.js";

const clients = new Map(); // gateId → Set<res>

export function subscribe(gateId, res) {
  if (!clients.has(gateId)) clients.set(gateId, new Set());
  const set = clients.get(gateId);
  set.add(res);
  // Comment lines keep proxies from closing an idle stream
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  return () => {
    clearInterval(heartbeat);
    set.delete(res);
  };
}

export function publish(gateId, event, data) {
  const set = clients.get(gateId);
  logLine("sse", `push "${event}" to ${set?.size ?? 0} display(s) on gate ${gateId}`, data);
  if (!set) return;
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(message);
}
