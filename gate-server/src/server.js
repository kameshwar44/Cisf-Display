import { createApp } from "./app.js";
import { ensureJwtSecret } from "./auth.js";
import { debugEnabled } from "./debug.js";
import { config } from "./config.js";
import { createPool, prepareDatabase } from "./db.js";

let pool;
try {
  pool = createPool();
  const { rows } = await pool.query("SELECT current_database() AS db");
  await prepareDatabase(pool);
  console.log(`Connected to PostgreSQL database "${rows[0].db}"`);
} catch (err) {
  console.error(`Cannot start: ${err.message}`);
  process.exit(1);
}

if (debugEnabled) {
  console.log("Debug logging is on: API calls, SQL queries and live updates are printed (DEBUG_LOG=false to turn off).");
}
if (!ensureJwtSecret()) {
  console.warn("JWT_SECRET is not set — using a random one; operators must sign in again after a restart.");
}
if (process.env.NODE_ENV === "production") {
  if (config.deviceKey === "dev-device-key") {
    console.warn("WARNING: DEVICE_KEY is the development default — set a secret value.");
  }
  if (config.allowSimulation) console.warn("WARNING: simulation is enabled — set ALLOW_SIMULATION=false.");
}

const server = createApp(pool).listen(config.port, () => {
  console.log(`CISF gate server listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  server.closeAllConnections(); // ends open live-event streams
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
