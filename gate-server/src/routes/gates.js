import { Router } from "express";
import { requireOperator } from "../auth.js";
import { config } from "../config.js";
import { many } from "../db.js";
import { HttpError } from "../errors.js";
import { subscribe } from "../events.js";
import {
  configView,
  currentView,
  getGateConfig,
  searchPasses,
  simulateScan,
  startArrival,
} from "../services/gate.js";
import { broadcastCurrent } from "./broadcast.js";

export default function gateRoutes(pool) {
  const router = Router();
  const auth = requireOperator(pool);

  const gateId = async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await getGateConfig(pool, id))) throw new HttpError(404, "Gate not found");
    return id;
  };

  // gate_config rows
  router.get("/", auth, async (req, res) => {
    res.json((await many(pool, "SELECT * FROM gate_config ORDER BY id")).map(configView));
  });

  // Gate, lane and header text for a display. Public: the sign-in screen
  // shows the header before anyone has signed in.
  router.get("/:id/config", async (req, res) => {
    res.json(configView(await getGateConfig(pool, await gateId(req))));
  });

  // The arrival currently shown on the gate display (latest transaction)
  router.get("/:id/current", auth, async (req, res) => {
    res.json({ transaction: await currentView(pool, await gateId(req)) });
  });

  // Live updates for a gate display (Server-Sent Events)
  router.get("/:id/events", requireOperator(pool, { allowQueryToken: true }), async (req, res) => {
    const id = await gateId(req);
    const initial = await currentView(pool, id);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    res.write(`event: transaction\ndata: ${JSON.stringify(initial)}\n\n`);
    const unsubscribe = subscribe(id, res);
    req.on("close", unsubscribe);
  });

  // Find a pass: ?q=<pass no. / ref no. / vehicle no. / container no. / name>
  router.get("/:id/passes", auth, async (req, res) => {
    await gateId(req);
    res.json(await searchPasses(pool, req.query.q));
  });

  // The pass shown at the gate becomes this gate's current arrival.
  // Body: { visitorId, vehicleId?, cargoId? } — ids from the search results
  router.post("/:id/arrivals", auth, async (req, res) => {
    const id = await gateId(req);
    const { visitorId, vehicleId, cargoId } = req.body ?? {};
    await startArrival(pool, id, { visitorId, vehicleId, cargoId }, req.user);
    res.status(201).json({ transaction: await broadcastCurrent(pool, id) });
  });

  // Demo only: a scan built from the latest visitor / vehicle / cargo rows
  router.post("/:id/simulate", auth, async (req, res) => {
    if (!config.allowSimulation) throw new HttpError(403, "Simulation is disabled on this server");
    const id = await gateId(req);
    await simulateScan(pool, id, req.body?.mode === "full" ? "full" : "visitor");
    res.status(201).json({ transaction: await broadcastCurrent(pool, id) });
  });

  return router;
}
