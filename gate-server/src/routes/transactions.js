import express, { Router } from "express";
import { requireDevice, requireOperator } from "../auth.js";
import { HttpError } from "../errors.js";
import {
  auditTrail,
  createTransaction,
  decide,
  getView,
  listTransactions,
  updateTransaction,
} from "../services/gate.js";
import { broadcastCurrent } from "./broadcast.js";

export default function transactionRoutes(pool) {
  const router = Router();
  const auth = requireOperator(pool);

  const idParam = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Transaction not found");
    return id;
  };
  const view = async (req) => {
    const v = await getView(pool, idParam(req));
    if (!v) throw new HttpError(404, "Transaction not found");
    return v;
  };

  // Gate devices report an arrival. Images may be base64 data URLs, so this
  // route accepts a larger body than the rest of the API.
  router.post("/", requireDevice, express.json({ limit: "15mb" }), async (req, res) => {
    const { id, gateId } = await createTransaction(pool, req.body ?? {});
    await broadcastCurrent(pool, gateId);
    res.status(201).json(await getView(pool, id));
  });

  // History, newest first: ?gateId=1&limit=50
  router.get("/", auth, async (req, res) => {
    const gateId = req.query.gateId ? Number(req.query.gateId) : null;
    res.json(await listTransactions(pool, { gateId, limit: req.query.limit }));
  });

  router.get("/:id", auth, async (req, res) => res.json(await view(req)));

  router.get("/:id/audit", auth, async (req, res) => {
    await view(req); // 404 if missing
    res.json(await auditTrail(pool, idParam(req)));
  });

  // Operator corrections: { mode?, checks?, plateRead?, containers?, gateMode? }
  router.patch("/:id", auth, async (req, res) => {
    const gateId = await updateTransaction(pool, idParam(req), req.body ?? {}, req.user);
    await broadcastCurrent(pool, gateId);
    res.json(await view(req));
  });

  // Final gate decision — GRANTED if all checks clear, else DENIED
  router.post("/:id/decision", auth, async (req, res) => {
    const gateId = await decide(pool, idParam(req), req.user);
    await broadcastCurrent(pool, gateId);
    res.json(await view(req));
  });

  return router;
}
