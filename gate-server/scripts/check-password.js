// Says which users a password works for (prints usernames only, never hashes).
// Usage: npm run -s check-password -- <password>
import { verifyPassword } from "../src/auth.js";
import { createPool, many } from "../src/db.js";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run -s check-password -- <password>");
  process.exit(1);
}
const pool = createPool();
try {
  for (const u of await many(pool, "SELECT username, password_hash FROM users ORDER BY id")) {
    const ok = await verifyPassword(password, u.password_hash);
    console.log(`${u.username.padEnd(16)} ${ok === null ? "unsupported hash format" : ok ? "MATCH" : "no"}`);
  }
} finally {
  await pool.end();
}
