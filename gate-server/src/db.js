import fs from "node:fs";
import pg from "pg";
import { config } from "./config.js";
import { instrumentClient } from "./debug.js";

// NUMERIC (frs_match_score) as a number; DATE as plain "YYYY-MM-DD"
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export function createPool(connectionString = config.databaseUrl) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — create gate-server/.env (see .env.example)");
  }
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on("error", (err) => console.error("PostgreSQL pool error:", err.message));
  // Debug: log every SQL statement, its parameters and the rows returned
  pool.on("connect", instrumentClient);
  return pool;
}

// The only schema change the server makes: the audit_log table (idempotent)
export async function prepareDatabase(pool) {
  await pool.query(fs.readFileSync(new URL("../db/audit-log.sql", import.meta.url), "utf8"));
}

// Runs fn(client) inside BEGIN / COMMIT; rolls back if it throws
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// q is a pool or a client
export const one = async (q, text, params) => (await q.query(text, params)).rows[0] ?? null;
export const many = async (q, text, params) => (await q.query(text, params)).rows;
