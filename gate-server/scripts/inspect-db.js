// Prints the shape of the cisf database: row counts and a few sample rows
// per table. Password hashes are reduced to their scheme prefix.
// Usage: node --env-file=.env scripts/inspect-db.js
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — create gate-server/.env (see .env.example)");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tables = [
  "users",
  "gate_config",
  "visitors",
  "vehicles",
  "cargo",
  "gate_transactions",
  "statistics",
  "blacklist",
  "alerts",
];

try {
  const { rows: [info] } = await pool.query("SELECT current_database() AS db, version() AS v");
  console.log(`connected: ${info.db} — ${info.v.split(",")[0]}`);
  for (const table of tables) {
    const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
    console.log(`\n== ${table} (${n} rows)`);
    const { rows } = await pool.query(`SELECT * FROM "${table}" ORDER BY id DESC LIMIT 3`);
    for (const row of rows) {
      if ("password_hash" in row) {
        const h = String(row.password_hash);
        row.password_hash = `${h.slice(0, 7)}… (${h.length} chars)`;
      }
      if (row.jwt_token) row.jwt_token = `<${String(row.jwt_token).length} chars>`;
      console.log(JSON.stringify(row));
    }
  }
} catch (err) {
  console.error("ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
