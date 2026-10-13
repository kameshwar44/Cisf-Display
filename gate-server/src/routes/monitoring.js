import { Router } from "express";
import { requireOperator } from "../auth.js";
import { many, one } from "../db.js";
import { HttpError } from "../errors.js";
import { formatDateTime } from "../format.js";
import { getGateConfig } from "../services/gate.js";

// Read access to statistics, alerts and the blacklist
export default function monitoringRoutes(pool) {
  const router = Router();
  const auth = requireOperator(pool);

  // Daily counts, newest first: ?gateId=1&days=7
  router.get("/statistics", auth, async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 366);
    let gateName = null;
    if (req.query.gateId) {
      const g = await getGateConfig(pool, Number(req.query.gateId));
      if (!g) throw new HttpError(404, "Gate not found");
      gateName = g.gate_name;
    }
    res.json(
      await many(
        pool,
        `SELECT * FROM statistics
          WHERE ($1::text IS NULL OR gate_name = $1)
          ORDER BY date DESC, id DESC LIMIT $2`,
        [gateName, days],
      ),
    );
  });

  // ?all=1 includes acknowledged alerts
  router.get("/alerts", auth, async (req, res) => {
    const rows = await many(
      pool,
      `SELECT * FROM alerts WHERE ($1::boolean OR acknowledged IS NOT TRUE)
        ORDER BY "timestamp" DESC NULLS LAST, id DESC LIMIT 200`,
      [req.query.all === "1"],
    );
    res.json(rows.map((a) => ({ ...a, at: a.timestamp && formatDateTime(a.timestamp) })));
  });

  router.post("/alerts/:id/acknowledge", auth, async (req, res) => {
    const row = await one(
      pool,
      "UPDATE alerts SET acknowledged = true, acknowledged_by = $1 WHERE id = $2 RETURNING *",
      [req.user.username, Number(req.params.id)],
    );
    if (!row) throw new HttpError(404, "Alert not found");
    res.json(row);
  });

  router.get("/blacklist", auth, async (req, res) => {
    res.json(await many(pool, "SELECT * FROM blacklist ORDER BY id DESC"));
  });

  return router;
}
