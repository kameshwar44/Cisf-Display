import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { requestLogger } from "./debug.js";
import { errorHandler } from "./errors.js";
import authRoutes from "./routes/auth.js";
import gateRoutes from "./routes/gates.js";
import monitoringRoutes from "./routes/monitoring.js";
import transactionRoutes from "./routes/transactions.js";

export function createApp(pool) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogger);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
    });
    next();
  });

  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Device scans set their own (larger) limit
  app.use("/api", (req, res, next) =>
    req.method === "POST" && req.path === "/transactions"
      ? next()
      : express.json({ limit: "100kb" })(req, res, next),
  );

  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use("/api/auth", authRoutes(pool));
  app.use("/api/gates", gateRoutes(pool));
  app.use("/api/transactions", transactionRoutes(pool));
  app.use("/api", monitoringRoutes(pool));
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // Camera images (registered faces, live captures, ANPR / container shots)
  app.use("/uploads", express.static(config.uploadsDir, { maxAge: "1h" }));

  // Production: serve the built React display from the same origin
  if (fs.existsSync(path.join(config.webDist, "index.html"))) {
    app.use(express.static(config.webDist));
    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) =>
      res.sendFile(path.join(config.webDist, "index.html")),
    );
  }

  app.use(errorHandler);
  return app;
}
